import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * Der Prisma-Client INNERHALB einer Transaktion.
 *
 * Nicht derselbe Typ wie der PrismaService: Er kann alles ausser den
 * Methoden, die eine eigene Verbindung eroeffnen wuerden - `$transaction`
 * etwa laesst sich nicht verschachteln, `$connect` waere sinnlos.
 *
 * Der Typ wird von Prisma mitgeliefert statt von Hand als `Omit<...>` gebaut.
 * Ein handgeschriebener Ausschluss waere eine Kopie einer Liste, die Prisma
 * pflegt - und liefe bei der naechsten Version auseinander.
 */
type TransaktionsClient = Prisma.TransactionClient;

/**
 * Eine Organisation aus der Sicht eines bestimmten Nutzers.
 *
 * Die eigene Rolle gehoert mit in die Antwort: Das Frontend muss entscheiden,
 * ob es "Mitglied einladen" ueberhaupt anzeigt. Ohne sie braeuchte es einen
 * zweiten Aufruf pro Organisation - der klassische N+1-Fehler.
 *
 * Achtung, das ist eine SICHT, keine Tabelle: `role` steht in `memberships`,
 * der Rest in `organizations`. Ein eigener Typ macht klar, dass hier zwei
 * Quellen zusammenfliessen.
 */
export interface OrganisationMitRolle {
  id: string;
  name: string;
  role: Role;
  createdAt: Date;
}

/**
 * Ein Mitglied einer Organisation.
 *
 * Der Schluessel heisst `userId`, nicht `id`: Die Mitgliedschaft hat eine
 * eigene ID, und die beiden zu verwechseln waere ein teurer Fehler. Was der
 * Client hier braucht, ist die Nutzer-ID - mit ihr adressiert er das Mitglied
 * in `DELETE /organizations/:orgId/members/:userId`.
 *
 * `mitgliedSeit` ist bewusst das Datum der MITGLIEDSCHAFT, nicht das des
 * Kontos. Wann sich jemand bei DevBoard registriert hat, geht seine Kollegen
 * nichts an.
 */
export interface Mitglied {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  mitgliedSeit: Date;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Legt eine Organisation an und macht den Ersteller zu ihrem OWNER.
   *
   * ==========================================================================
   * WARUM DAS EINE TRANSAKTION SEIN MUSS
   * ==========================================================================
   * Es sind ZWEI Schreibvorgaenge: die Organisation und die Mitgliedschaft.
   * Gelingt der erste und scheitert der zweite - Verbindungsabbruch,
   * Prozessende, Deadlock -, bleibt eine Organisation OHNE EIGENTUEMER zurueck.
   * Niemand kann sie mehr verwalten, niemand sie loeschen, und sie taucht in
   * keiner Liste auf, weil Listen ueber Mitgliedschaften laufen. Eine Leiche in
   * der Datenbank.
   *
   * Eine Transaktion macht aus beiden Schritten einen einzigen: entweder beide
   * oder keiner. Das "A" in ACID - Atomarity.
   *
   * ==========================================================================
   * WARUM HIER KEIN EXPLIZITES $transaction STEHT
   * ==========================================================================
   * Ein "nested write" - das verschachtelte `memberships: { create: ... }` -
   * fuehrt Prisma VON SICH AUS in einer Transaktion aus. Das ist keine
   * Bequemlichkeit, sondern eine Zusage der Schnittstelle.
   *
   * Ausgeschrieben saehe dasselbe so aus:
   *
   *     return this.prisma.$transaction(async (tx) => {
   *       const org = await tx.organization.create({ data: { name } });
   *       await tx.membership.create({
   *         data: { organizationId: org.id, userId, role: Role.OWNER },
   *       });
   *       return org;
   *     });
   *
   * Gleiches Ergebnis, mehr Code, eine zusaetzliche Runde zur Datenbank.
   *
   * WANN man `$transaction` trotzdem braucht: sobald zwischen den Schritten
   * GELESEN und ENTSCHIEDEN wird ("hat diese Organisation noch einen anderen
   * OWNER?"), oder wenn Schritte betroffen sind, die nicht ueber eine Relation
   * zusammenhaengen. Ein verschachtelter Schreibvorgang kann nur, was der
   * Beziehungsbaum hergibt.
   *
   * Merksatz: Die beste Transaktion ist die, die man nicht selbst schreiben
   * muss - aber man muss wissen, dass es eine ist.
   *
   * ==========================================================================
   * WARUM DER ERSTELLER OWNER WIRD UND NICHT ADMIN
   * ==========================================================================
   * OWNER ist die einzige Rolle, die die Organisation loeschen und andere zu
   * OWNER machen darf. Bekaeme der Ersteller nur ADMIN, gaebe es niemanden mit
   * dieser Rolle - siehe oben, wieder eine unverwaltbare Organisation.
   */
  async erstelle(
    nutzerId: string,
    daten: CreateOrganizationDto,
  ): Promise<OrganisationMitRolle> {
    const organisation = await this.prisma.organization.create({
      data: {
        name: daten.name,
        memberships: {
          create: {
            userId: nutzerId,
            role: Role.OWNER,
          },
        },
      },
      select: { id: true, name: true, createdAt: true },
    });

    // Ohne den Namen: Organisationsnamen sind Kundendaten und haben in
    // weitergeleiteten, durchsuchbaren Logs nichts verloren. IDs reichen zur
    // Nachverfolgung - dieselbe Regel wie bei E-Mail-Adressen im AuthService.
    this.logger.log(
      `Organisation angelegt: ${organisation.id} durch Nutzer ${nutzerId}`,
    );

    return { ...organisation, role: Role.OWNER };
  }

  /**
   * Liefert alle Organisationen, in denen der Nutzer Mitglied ist.
   *
   * ==========================================================================
   * DIE RICHTUNG DER ABFRAGE IST DIE GANZE POINTE
   * ==========================================================================
   * Naheliegend waere, von den Organisationen auszugehen:
   *
   *     prisma.organization.findMany({
   *       where: { memberships: { some: { userId } } },
   *     })
   *
   * Das liefert dasselbe Ergebnis - aber es ist die falsche Richtung gedacht.
   * Die Frage lautet nicht "welche Organisationen haben diesen Nutzer?",
   * sondern "welche Mitgliedschaften hat dieser Nutzer?". Von dort aus ist es
   * ein Zugriff ueber den Index auf `userId`: PostgreSQL liest genau die zwei
   * bis drei Zeilen, die es gibt, statt ueber alle Organisationen zu pruefen.
   *
   * Genau dafuer existiert der zusaetzliche Index auf `userId` - der, der neben
   * dem UNIQUE (organizationId, userId) auf den ersten Blick redundant aussieht.
   * Der Unique-Index ist nach `organizationId` sortiert und traegt fuer eine
   * Abfrage nach `userId` allein nicht (Praefix-Regel).
   *
   * ==========================================================================
   * DAS IST BEREITS AUTORISIERUNG AUF DATENEBENE
   * ==========================================================================
   * Es gibt hier keinen Guard und keine Rollenpruefung - und trotzdem kann
   * niemand fremde Organisationen sehen. Der Grund: `userId` steht in der
   * BEDINGUNG der Abfrage, nicht in einer Pruefung danach.
   *
   * Das ist das Muster, das den ganzen Sprint traegt. Eine Abfrage ohne
   * Mandantenbedingung ist die Luecke; eine Pruefung nach dem Laden ist zu
   * spaet, weil die Daten dann schon gelesen wurden.
   */
  async findeMeine(nutzerId: string): Promise<OrganisationMitRolle[]> {
    const mitgliedschaften = await this.prisma.membership.findMany({
      where: { userId: nutzerId },
      select: {
        role: true,
        organization: { select: { id: true, name: true, createdAt: true } },
      },
      // Stabile Reihenfolge. Ohne `orderBy` darf PostgreSQL die Zeilen in
      // beliebiger Reihenfolge liefern - meist ist sie stabil, aber garantiert
      // ist sie nicht, und nach einem UPDATE kann sie sich aendern. Eine Liste,
      // die bei jedem Laden anders sortiert ist, wirkt kaputt.
      orderBy: { createdAt: 'asc' },
    });

    // Die Verschachtelung wird hier flach gemacht, damit das Frontend nicht
    // `eintrag.organization.name` schreiben muss. Die HTTP-Antwort soll die
    // Fachlichkeit abbilden ("eine Organisation, in der ich Rolle X habe"),
    // nicht die Tabellenstruktur.
    return mitgliedschaften.map((eintrag) => ({
      id: eintrag.organization.id,
      name: eintrag.organization.name,
      createdAt: eintrag.organization.createdAt,
      role: eintrag.role,
    }));
  }

  /**
   * Liefert eine einzelne Organisation.
   *
   * ==========================================================================
   * WARUM HIER KEIN NUTZERFILTER STEHT - UND WARUM DAS TROTZDEM SICHER IST
   * ==========================================================================
   * Diese Methode laedt allein ueber die `organizationId`. Nach allem, was in
   * diesem Sprint ueber vergessene Mandantenfilter gesagt wurde, sieht das
   * falsch aus. Es ist der eine Fall, in dem es richtig ist:
   *
   * Die `orgId` stammt NICHT aus der Anfrage, sondern aus der Mitgliedschaft,
   * die der MitgliedschaftsGuard bereits geprueft hat. Der Controller reicht
   * `mitgliedschaft.organizationId` herein, nicht den Route-Parameter. Damit
   * ist der Wert selbst schon das Ergebnis der Autorisierung.
   *
   * Das ist eine BEDINGUNG an den Aufrufer und deshalb hier festgehalten. Wer
   * diese Methode einmal mit einer ungeprueften ID aufruft, hebt den Schutz
   * auf - und der Code saehe dabei voellig unauffaellig aus.
   *
   * Die Alternative waere, `userId` sicherheitshalber noch einmal
   * mitzufiltern. Dagegen spricht, dass zwei Stellen dann dieselbe Regel
   * durchsetzen und die zweite bei einer Aenderung leicht vergessen wird -
   * ein Schutz, auf den man sich halb verlaesst, ist schlechter als einer,
   * dessen Ort eindeutig ist.
   */
  async findeEine(
    organizationId: string,
    eigeneRolle: Role,
  ): Promise<OrganisationMitRolle> {
    const organisation = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, createdAt: true },
    });

    if (!organisation) {
      // Kann praktisch nicht auftreten - der Guard hat eine Mitgliedschaft
      // gefunden, und die haengt per Fremdschluessel an einer existierenden
      // Organisation. Denkbar nur, wenn zwischen Guard und Service geloescht
      // wird. Ein 500er waere hier die schlechtere Antwort.
      throw new NotFoundException('Organisation nicht gefunden');
    }

    return { ...organisation, role: eigeneRolle };
  }

  /**
   * Liefert die Mitglieder einer Organisation.
   *
   * Auch hier gilt: `organizationId` kommt aus der geprueften Mitgliedschaft.
   *
   * ==========================================================================
   * WAS VON DEN NUTZERN HERAUSGEGEBEN WIRD - UND WAS NICHT
   * ==========================================================================
   * Kollegen sollen einander erkennen, deshalb Name und E-Mail-Adresse. NICHT
   * dabei: `passwordHash` (versteht sich), aber auch `createdAt` des KONTOS -
   * wann sich jemand bei DevBoard registriert hat, geht seine Kollegen nichts
   * an. Ausgegeben wird stattdessen `createdAt` der MITGLIEDSCHAFT: seit wann
   * er in dieser Organisation ist. Das ist die Angabe, die hier fachlich
   * gemeint ist.
   *
   * `select` statt `include`: `include` holt den ganzen Nutzer samt Hash und
   * ueberlaesst es dem Code, hinterher aufzuraeumen. Wer Felder nachtraeglich
   * entfernt, vergisst irgendwann eines - dieselbe Regel wie im AuthService.
   */
  async findeMitglieder(organizationId: string): Promise<Mitglied[]> {
    const mitgliedschaften = await this.prisma.membership.findMany({
      where: { organizationId },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      // Aeltestes zuerst - der Ersteller steht damit oben. Ohne `orderBy` darf
      // PostgreSQL die Zeilen in beliebiger Reihenfolge liefern.
      orderBy: { createdAt: 'asc' },
    });

    return mitgliedschaften.map((eintrag) => ({
      userId: eintrag.user.id,
      email: eintrag.user.email,
      name: eintrag.user.name,
      role: eintrag.role,
      mitgliedSeit: eintrag.createdAt,
    }));
  }

  /**
   * Benennt eine Organisation um.
   *
   * Wer das darf, entscheidet der @Rollen()-Decorator am Controller, nicht
   * dieser Service. Die Trennung ist bewusst: Rollenpruefung ist eine Frage
   * des ZUGANGS und gehoert damit vor den Controller. Fachliche Regeln, die
   * unabhaengig vom Zugangsweg gelten - "die letzte OWNER-Mitgliedschaft darf
   * nicht verschwinden" - gehoeren in den Service, weil es mehrere Wege gibt,
   * sie zu verletzen. Das kommt in der naechsten Scheibe.
   */
  async benenneUm(
    organizationId: string,
    eigeneRolle: Role,
    daten: UpdateOrganizationDto,
  ): Promise<OrganisationMitRolle> {
    const organisation = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: daten.name },
      select: { id: true, name: true, createdAt: true },
    });

    this.logger.log(`Organisation umbenannt: ${organisation.id}`);

    return { ...organisation, role: eigeneRolle };
  }

  /**
   * Aendert die Rolle eines Mitglieds.
   *
   * Wer das ueberhaupt aufrufen darf - ausschliesslich OWNER -, entscheidet
   * der @Rollen()-Decorator am Controller. Hier steht die fachliche Regel:
   * Die LETZTE OWNER-Mitgliedschaft darf nicht herabgestuft werden.
   */
  async aendereRolle(
    organizationId: string,
    zielNutzerId: string,
    daten: UpdateMemberRoleDto,
  ): Promise<Mitglied> {
    return this.mitGesperrterOrganisation(organizationId, async (tx) => {
      const ziel = await tx.membership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: zielNutzerId },
        },
        select: { role: true },
      });

      if (!ziel) {
        // 404 fuer das MITGLIED, nicht fuer die Organisation - die kennt der
        // Anfragende bereits, sonst waere er nicht durch den Guard gekommen.
        throw new NotFoundException('Mitglied nicht gefunden');
      }

      if (ziel.role === Role.OWNER && daten.role !== Role.OWNER) {
        await this.stelleSicherDassEinOwnerBleibt(tx, organizationId);
      }

      const aktualisiert = await tx.membership.update({
        where: {
          organizationId_userId: { organizationId, userId: zielNutzerId },
        },
        data: { role: daten.role },
        select: {
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      });

      this.logger.log(
        `Rolle geaendert in ${organizationId}: ${zielNutzerId} -> ${daten.role}`,
      );

      return {
        userId: aktualisiert.user.id,
        email: aktualisiert.user.email,
        name: aktualisiert.user.name,
        role: aktualisiert.role,
        mitgliedSeit: aktualisiert.createdAt,
      };
    });
  }

  /**
   * Entfernt ein Mitglied aus der Organisation.
   *
   * ==========================================================================
   * WARUM DIE BERECHTIGUNG HIER STEHT UND NICHT IM GUARD
   * ==========================================================================
   * Die Regel haengt davon ab, WEN es trifft:
   *
   *   - sich selbst entfernen darf jeder, auch MEMBER ("Organisation
   *     verlassen")
   *   - andere entfernen duerfen OWNER und ADMIN
   *   - einen OWNER entfernen darf nur ein OWNER
   *
   * Ein Guard kann das nicht entscheiden. Er weiss, WER anfragt, aber nicht,
   * WEN es trifft - die Zielressource kennt er nicht. Ein
   * @Rollen(OWNER, ADMIN) wuerde einen MEMBER schon abweisen, bevor
   * ueberhaupt klar ist, dass er nur sich selbst meint.
   *
   * Faustregel: Ein Guard entscheidet ueber den ZUGANG, nicht ueber den
   * EINZELFALL. Sobald die Antwort davon abhaengt, welche Ressource betroffen
   * ist, gehoert sie in den Service.
   */
  async entferneMitglied(
    organizationId: string,
    eigeneNutzerId: string,
    eigeneRolle: Role,
    zielNutzerId: string,
  ): Promise<void> {
    await this.mitGesperrterOrganisation(organizationId, async (tx) => {
      const ziel = await tx.membership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: zielNutzerId },
        },
        select: { role: true },
      });

      if (!ziel) {
        throw new NotFoundException('Mitglied nicht gefunden');
      }

      const entferntSichSelbst = zielNutzerId === eigeneNutzerId;

      if (!entferntSichSelbst) {
        if (eigeneRolle !== Role.OWNER && eigeneRolle !== Role.ADMIN) {
          throw new ForbiddenException(
            'Nur OWNER und ADMIN duerfen Mitglieder entfernen',
          );
        }

        // Ohne diese Zeile koennte ein ADMIN alle OWNER entfernen und die
        // Organisation uebernehmen. Die Rangfolge der Rollen waere damit
        // wirkungslos - wer den Hoeherstehenden entfernen kann, steht hoeher.
        if (ziel.role === Role.OWNER && eigeneRolle !== Role.OWNER) {
          throw new ForbiddenException(
            'Nur ein OWNER darf einen anderen OWNER entfernen',
          );
        }
      }

      // Gilt auch fuer den Fall "ich verlasse die Organisation": Der letzte
      // OWNER darf nicht gehen, sonst bleibt sie unverwaltbar zurueck. Das ist
      // der Grund, warum diese Pruefung im Service liegt - es gibt mehrere
      // Wege hierher, und jeder einzelne muss sie durchlaufen.
      if (ziel.role === Role.OWNER) {
        await this.stelleSicherDassEinOwnerBleibt(tx, organizationId);
      }

      await tx.membership.delete({
        where: {
          organizationId_userId: { organizationId, userId: zielNutzerId },
        },
      });

      this.logger.log(
        `Mitglied entfernt aus ${organizationId}: ${zielNutzerId}` +
          (entferntSichSelbst ? ' (selbst)' : ` durch ${eigeneNutzerId}`),
      );
    });
  }

  /**
   * Wirft, wenn die Organisation nur noch EINEN OWNER hat.
   *
   * Aufzurufen INNERHALB der Transaktion und NACH der Sperre - sonst ist das
   * Ergebnis schon beim Lesen veraltet.
   */
  private async stelleSicherDassEinOwnerBleibt(
    tx: TransaktionsClient,
    organizationId: string,
  ): Promise<void> {
    const anzahlOwner = await tx.membership.count({
      where: { organizationId, role: Role.OWNER },
    });

    if (anzahlOwner <= 1) {
      // 409 Conflict, nicht 403: Die Anfrage ist formal in Ordnung und der
      // Anfragende ist berechtigt - sie widerspricht nur dem aktuellen
      // ZUSTAND der Ressource. Mit einem zweiten OWNER waere dieselbe Anfrage
      // erfolgreich. Genau dafuer gibt es 409.
      throw new ConflictException(
        'Die Organisation braucht mindestens einen OWNER. ' +
          'Ernennen Sie zuerst einen anderen Eigentuemer.',
      );
    }
  }

  /**
   * Fuehrt eine Aenderung an den Mitgliedschaften unter einer Zeilensperre aus.
   *
   * ==========================================================================
   * WARUM EINE TRANSAKTION HIER NICHT REICHT
   * ==========================================================================
   * Beide Aufrufer arbeiten nach dem Muster LESEN, ENTSCHEIDEN, SCHREIBEN:
   * "Wie viele OWNER gibt es? Mehr als einer? Dann darf dieser weg."
   *
   * Zwei gleichzeitige Anfragen ergeben dann:
   *
   *     A: zaehlt OWNER -> 2 -> "einer darf weg" -> entfernt Owner 1
   *     B: zaehlt OWNER -> 2 -> "einer darf weg" -> entfernt Owner 2
   *
   * Beide in einer Transaktion. Beide atomar. Danach: NULL Eigentuemer.
   *
   * Der Grund ist die Isolationsstufe. PostgreSQL faehrt standardmaessig READ
   * COMMITTED: Jede Transaktion sieht den Stand, der bei ihrem Beginn
   * festgeschrieben war. Atomaritaet schuetzt gegen HALBE Schreibvorgaenge,
   * nicht gegen eine veraltete Entscheidungsgrundlage.
   *
   * Merksatz: Eine Transaktion macht Schreibvorgaenge unteilbar. Sie macht
   * LESEN UND SCHREIBEN nicht automatisch zu einer Einheit.
   *
   * ==========================================================================
   * DIE LOESUNG: PESSIMISTISCHE SPERRE AUF DER ORGANISATIONSZEILE
   * ==========================================================================
   * `SELECT ... FOR UPDATE` sperrt die Zeile bis zum Ende der Transaktion.
   * Die zweite Anfrage WARTET dort, statt weiterzulaufen - und liest danach
   * den bereits aktualisierten Stand. Aus gleichzeitig wird nacheinander.
   *
   * Gesperrt wird die ORGANISATION, nicht die einzelne Mitgliedschaft. Das
   * ist der Punkt: Die Regel betrifft die Organisation als Ganzes ("wie viele
   * OWNER hat sie?"), also braucht es einen gemeinsamen Punkt, an dem sich
   * konkurrierende Aenderungen begegnen. Zwei Sperren auf zwei verschiedenen
   * Mitgliedschaften wuerden sich nie in die Quere kommen.
   *
   * ALTERNATIVEN, und warum nicht:
   *
   *   Isolationsstufe SERIALIZABLE - PostgreSQL erkennt den Konflikt selbst
   *     und laesst eine Transaktion fehlschlagen. Sauberer und ohne explizite
   *     Sperre, verlangt aber eine Wiederholungslogik fuer den Fehlercode
   *     P2034. Mehr bewegliche Teile fuer denselben Effekt.
   *
   *   Optimistisches Sperren (Versionsspalte) - passt, wenn Konflikte selten
   *     sind und der Nutzer eine Fehlermeldung akzeptiert ("wurde inzwischen
   *     geaendert"). Beim Kanban-Board in Sprint 3 ist das die richtige Wahl.
   *     Hier nicht: Ein verlorener Eigentuemer laesst sich nicht nachtraeglich
   *     durch Neuladen beheben.
   *
   *   Datenbank-Constraint - waere das Robusteste, ist aber in PostgreSQL
   *     nicht direkt ausdrueckbar: "mindestens eine Zeile mit role=OWNER pro
   *     organizationId" braucht einen Trigger oder eine materialisierte
   *     Zaehlspalte. Vermerkt in 06_BACKLOG.md.
   */
  private async mitGesperrterOrganisation<T>(
    organizationId: string,
    arbeit: (tx: TransaktionsClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // $queryRaw mit Template-String: Prisma setzt daraus eine
      // PARAMETRISIERTE Abfrage ($1), keine Zeichenkettenverkettung. Mit
      // `$queryRawUnsafe` und einem zusammengebauten String waere das eine
      // SQL-Injection - hier ist es keine.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      return arbeit(tx);
    });
  }
}
