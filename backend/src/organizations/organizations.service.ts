import { Injectable, Logger } from '@nestjs/common';

import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';

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
}
