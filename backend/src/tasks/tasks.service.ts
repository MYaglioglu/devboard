import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Genau,
  POSITIONS_ABSTAND,
  berechnePosition,
  brauchtNeuverteilung,
  neueVerteilung,
} from './positionen';
import type { TaskStatus } from '../generated/prisma/enums';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { MoveTaskDto } from './dto/move-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Die Sortierarithmetik steht in positionen.ts - eine eigene Datei ohne
 * Abhaengigkeit zu Prisma-Abfragen oder NestJS. Der fachlich heikelste Teil
 * dieses Sprints ist damit ohne Datenbank pruefbar (positionen.spec.ts).
 */

/** Der Zustaendige einer Aufgabe, wie ihn die API herausgibt. */
export interface Zustaendiger {
  userId: string;
  name: string | null;
  email: string;
}

/**
 * Eine Aufgabe, wie sie die API herausgibt.
 *
 * ============================================================================
 * WARUM `position` EINE ZEICHENKETTE IST
 * ============================================================================
 * In der Datenbank ist die Position `numeric(65,30)` - beliebig genau. JSON
 * kennt aber nur EINEN Zahlentyp, und der ist `float64`. Eine Position wie
 * 1500.000000000000000000000000000001 kaeme im Browser gerundet an.
 *
 * Damit waere genau der Praezisionsverlust wieder da, gegen den `numeric`
 * ueberhaupt gewaehlt wurde - nur diesmal auf dem Transportweg statt in der
 * Datenbank. Als Zeichenkette bleibt der Wert unversehrt.
 *
 * Das Frontend rechnet ohnehin nicht mit Positionen: Es schickt beim
 * Verschieben die IDs der Nachbarn, und der Server bildet den Mittelwert
 * (Scheibe 3.4). Der Wert ist fuer den Client eine undurchsichtige Kennung,
 * keine Zahl.
 */
export interface Aufgabe {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: string;
  version: number;
  assignee: Zustaendiger | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Die Felder, die aus der Datenbank gelesen werden - an einer Stelle.
 *
 * `organizationId` gibt es auf `tasks` gar nicht; der Mandant haengt am
 * Projekt. Was hier fehlt, ist trotzdem Absicht: `projectId` steht nicht in
 * der Antwort, weil der Client das Projekt bereits kennt - es steht in dem
 * Pfad, den er aufgerufen hat.
 */
const AUFGABE_FELDER = {
  id: true,
  title: true,
  description: true,
  status: true,
  position: true,
  version: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: {
      userId: true,
      user: { select: { name: true, email: true } },
    },
  },
} as const;

/** Die Zeile, wie Prisma sie mit AUFGABE_FELDER liefert. */
interface AufgabeZeile {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: Prisma.Decimal;
  version: number;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: {
    userId: string;
    user: { name: string | null; email: string };
  } | null;
}

/**
 * Uebersetzt die Datenbankzeile in die Antwort.
 *
 * Die Verschachtelung `assignee.user.name` ist der Preis dafuer, dass die
 * Zuweisung an der MITGLIEDSCHAFT haengt und nicht am Nutzer (siehe
 * schema.prisma). Nach aussen wird sie eingeebnet - der Client soll von
 * Mitgliedschaften nichts wissen muessen.
 */
const zuAufgabe = (zeile: AufgabeZeile): Aufgabe => ({
  id: zeile.id,
  title: zeile.title,
  description: zeile.description,
  status: zeile.status,
  position: zeile.position.toString(),
  version: zeile.version,
  assignee: zeile.assignee
    ? {
        userId: zeile.assignee.userId,
        name: zeile.assignee.user.name,
        email: zeile.assignee.user.email,
      }
    : null,
  dueDate: zeile.dueDate,
  createdAt: zeile.createdAt,
  updatedAt: zeile.updatedAt,
});

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Legt eine Aufgabe an - ganz unten in ihrer Spalte.
   *
   * ==========================================================================
   * WARUM DAS EINE TRANSAKTION IST
   * ==========================================================================
   * Es wird GELESEN und daraufhin ENTSCHIEDEN: die letzte Position der Spalte
   * lesen, darauf den Abstand addieren, schreiben. Genau dafuer reicht ein
   * verschachtelter Schreibvorgang nicht (vgl. OrganizationsService.erstelle) -
   * zwischen Lesen und Schreiben liegt eine Luecke.
   *
   * Ehrlich bleibt trotzdem: Zwei gleichzeitige Anlagen in derselben Spalte
   * koennen dieselbe letzte Position lesen und damit dieselbe neue Position
   * bekommen. Die Transaktion verhindert das nicht - dafuer braeuchte es eine
   * Sperre auf der Spalte, und die waere fuer diesen Fall zu teuer.
   *
   * Warum das vertretbar ist: Zwei Karten mit gleicher Position sind kein
   * kaputter Zustand, nur eine unbestimmte Reihenfolge zwischen genau diesen
   * beiden. `orderBy` bricht den Gleichstand deshalb ueber `createdAt` und
   * zuletzt ueber die `id` - das Ergebnis ist stabil, auch wenn es nicht
   * vorhersagbar ist. Beim VERSCHIEBEN ist die Lage anders; dort geht es um
   * einen Wert, den ein Nutzer bewusst gesetzt hat, und dort steht in
   * Scheibe 3.4 das optimistische Sperren.
   */
  async erstelle(
    organizationId: string,
    projektId: string,
    daten: CreateTaskDto,
  ): Promise<Aufgabe> {
    return this.prisma.$transaction(async (tx) => {
      // Der Mandantenfilter fuer diese ganze Methode: Gehoert das Projekt
      // nicht zu dieser Organisation, gibt es hier 404 - und alles Weitere
      // findet nicht statt.
      //
      // `archivedAt: null` steht mit in der Bedingung: In ein archiviertes
      // Projekt gehoert keine neue Aufgabe. Es waere sonst moeglich, ueber die
      // Task-Schnittstelle in etwas hineinzuschreiben, das in der Oberflaeche
      // gar nicht mehr auftaucht.
      const projekt = await tx.project.findFirst({
        where: { id: projektId, organizationId, archivedAt: null },
        select: { id: true },
      });

      if (!projekt) {
        throw new NotFoundException('Projekt nicht gefunden');
      }

      const assigneeId = await this.loeseZustaendigenAuf(
        tx,
        organizationId,
        daten.assigneeId,
      );

      // Die letzte Karte DIESER Spalte. `projectId` genuegt hier als Filter,
      // weil das Projekt eine Zeile darueber schon gegen die Organisation
      // geprueft wurde.
      const letzte = await tx.task.findFirst({
        where: { projectId: projektId, status: daten.status },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      // Zwei Dinge auf einmal, beide wegen der Genauigkeit:
      //
      // `.plus()` statt `+` - `position` ist ein Decimal-Objekt, kein
      // `number`. Mit `+` wuerde JavaScript beide in Gleitkomma umwandeln und
      // genau die Praezision zerstoeren, wegen der die Spalte `numeric` ist.
      //
      // `new Genau(...)` um den gelesenen Wert - Prisma liefert ihn als
      // Decimal mit der VOREINGESTELLTEN Genauigkeit von 20 Stellen, und die
      // Rechnung uebernimmt die Einstellung des linken Operanden. Ohne die
      // Umhuellung wuerde also gerundet, obwohl `Genau` existiert.
      const position = letzte
        ? new Genau(letzte.position).plus(POSITIONS_ABSTAND)
        : POSITIONS_ABSTAND;

      const zeile = await tx.task.create({
        data: {
          projectId: projektId,
          title: daten.title,
          description: daten.description,
          status: daten.status,
          position,
          assigneeId,
          dueDate: daten.dueDate,
        },
        select: AUFGABE_FELDER,
      });

      return zuAufgabe(zeile);
    });
  }

  /**
   * Alle Aufgaben eines Projekts - die Board-Abfrage.
   *
   * ==========================================================================
   * WARUM EINE FLACHE LISTE UND KEINE GRUPPIERUNG NACH SPALTEN
   * ==========================================================================
   * Serverseitig nach Status gruppiert zurueckzugeben (`{ TODO: [...], ... }`)
   * waere bequem fuer das Frontend - und falsch: Eine Spalte ohne Karten
   * fehlte dann im Ergebnis, und der Client muesste die leeren Spalten doch
   * wieder selbst kennen. Die Spaltenliste ist eine Eigenschaft des BOARDS,
   * nicht der Daten.
   *
   * Sortiert wird genau so, wie der Index es hergibt: `status`, dann
   * `position`. Damit liest PostgreSQL die Zeilen in der Reihenfolge, in der
   * sie im Index liegen - ohne Sortierschritt.
   */
  async findeAlle(
    organizationId: string,
    projektId: string,
  ): Promise<Aufgabe[]> {
    // Auch hier ueber die BEZIEHUNG gefiltert. Ein Task hat keine eigene
    // organizationId - sie zusaetzlich zu speichern waere eine zweite
    // Wahrheit, siehe 08_DATABASE.md.
    const zeilen = await this.prisma.task.findMany({
      where: { projectId: projektId, project: { organizationId } },
      orderBy: [
        { status: 'asc' },
        { position: 'asc' },
        // Gleichstand-Aufloesung, siehe Kommentar bei `erstelle`. Ohne diese
        // beiden waere die Reihenfolge zweier gleich positionierter Karten
        // von Lauf zu Lauf verschieden - und das Board "zappelt" beim Neuladen.
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: AUFGABE_FELDER,
    });

    // Leeres Ergebnis heisst hier NICHT "Projekt nicht gefunden" - ein neues
    // Projekt hat schlicht keine Aufgaben. Wer wissen will, ob es das Projekt
    // gibt, fragt den Projekt-Endpoint. Aus einer leeren Liste eine 404 zu
    // machen, waere eine erfundene Fehlermeldung.
    return zeilen.map(zuAufgabe);
  }

  /** Eine einzelne Aufgabe. */
  async findeEine(
    organizationId: string,
    projektId: string,
    aufgabenId: string,
  ): Promise<Aufgabe> {
    const zeile = await this.prisma.task.findFirst({
      where: {
        id: aufgabenId,
        projectId: projektId,
        project: { organizationId },
      },
      select: AUFGABE_FELDER,
    });

    if (!zeile) {
      throw new NotFoundException('Aufgabe nicht gefunden');
    }

    return zuAufgabe(zeile);
  }

  /**
   * Aendert Titel, Beschreibung, Zustaendigen oder Faelligkeit.
   *
   * NICHT Status und Position - die gehoeren zusammen und haben in Scheibe 3.4
   * einen eigenen Endpoint. Begruendung in update-task.dto.ts.
   *
   * ==========================================================================
   * WARUM HIER `updateMany` UND NICHT `update` STEHT
   * ==========================================================================
   * Beim Projekt ging `update({ where: { id, organizationId } })`, weil
   * `organizationId` eine Spalte DERSELBEN Tabelle ist. Beim Task liegt der
   * Mandant eine Ebene weiter (ueber `project`), und dafuer laesst Prisma im
   * `where` eines `update` keinen Beziehungsfilter zu.
   *
   * `updateMany` kann es - liefert aber nur die Anzahl. Deshalb steht beides
   * in einer Transaktion: aendern, und bei Erfolg die geaenderte Zeile lesen.
   * Ohne die Transaktion koennte zwischen beiden Schritten jemand anderes
   * schreiben, und wir gaeben einen Stand zurueck, den wir nie erzeugt haben.
   */
  async aendere(
    organizationId: string,
    projektId: string,
    aufgabenId: string,
    daten: UpdateTaskDto,
  ): Promise<Aufgabe> {
    return this.prisma.$transaction(async (tx) => {
      // `undefined` heisst "Feld nicht mitgeschickt" - dann bleibt die
      // Zuweisung unangetastet. `null` heisst "Zuweisung entfernen".
      const assigneeId =
        daten.assigneeId === undefined
          ? undefined
          : await this.loeseZustaendigenAuf(
              tx,
              organizationId,
              daten.assigneeId,
            );

      const ergebnis = await tx.task.updateMany({
        where: {
          id: aufgabenId,
          projectId: projektId,
          project: { organizationId },
        },
        data: {
          title: daten.title,
          description: daten.description,
          assigneeId,
          dueDate: daten.dueDate,
        },
      });

      if (ergebnis.count === 0) {
        throw new NotFoundException('Aufgabe nicht gefunden');
      }

      // Der Mandantenfilter steht hier noch einmal vollstaendig, obwohl die
      // Zeile darueber bereits geprueft wurde. Das kostet nichts und haelt die
      // Regel geschlossen: In dieser Datei gibt es KEINE Abfrage auf `task`
      // ohne Mandantenbedingung. Eine Ausnahme "die ist ja schon geprueft"
      // muesste jeder spaetere Leser erst nachvollziehen.
      const zeile = await tx.task.findFirstOrThrow({
        where: {
          id: aufgabenId,
          projectId: projektId,
          project: { organizationId },
        },
        select: AUFGABE_FELDER,
      });

      return zuAufgabe(zeile);
    });
  }

  /**
   * Loescht eine Aufgabe - hier wirklich, nicht wie beim Projekt.
   *
   * ==========================================================================
   * WARUM TASKS GELOESCHT UND PROJEKTE ARCHIVIERT WERDEN
   * ==========================================================================
   * Ein Projekt ist ein BEHAELTER: Was darin passiert ist, bleibt
   * interessant - Sprint 4 zieht daraus Kennzahlen, und ein archiviertes
   * Projekt kann man nachschlagen.
   *
   * Eine einzelne Karte ist das nicht. "Falsch angelegt, weg damit" ist der
   * haeufigste Grund fuer ein DELETE auf einer Aufgabe. Sie stattdessen
   * unsichtbar aufzubewahren, fuellt die Tabelle mit Zeilen, die niemand mehr
   * sehen will - und jede kuenftige Abfrage muesste an den Filter denken.
   *
   * Der Preis, ehrlich benannt: Wer eine Aufgabe versehentlich loescht, kann
   * sie nicht zurueckholen. Sobald der Aktivitaets-Feed aus Sprint 4 steht,
   * waere ein "geloescht"-Ereignis die passende Ergaenzung.
   *
   * ==========================================================================
   * WARUM DER ZWEITE AUFRUF HIER 404 GIBT UND BEIM PROJEKT 204
   * ==========================================================================
   * Das sieht nach einem Widerspruch aus, ist aber der Unterschied zwischen
   * zwei Zustaenden. Ein archiviertes Projekt EXISTIERT noch - "archiviere
   * es" ist bereits erfuellt, also gibt es nichts zu melden. Eine geloeschte
   * Aufgabe existiert nicht mehr; auf eine Ressource, die es nicht gibt, ist
   * 404 die richtige Antwort.
   *
   * Idempotenz im Sinne der HTTP-Spezifikation betrifft den ZUSTAND auf dem
   * Server, nicht den Statuscode: Nach dem zweiten DELETE ist der Zustand
   * derselbe wie nach dem ersten. Das ist erfuellt.
   *
   * Der Ausschlag gibt am Ende die Mandantenregel: Eine fremde Aufgabe muss
   * sich wie eine nicht existierende verhalten - also 404. Gaebe es hier 204,
   * waere "geloescht" und "gehoert dir nicht" von aussen dasselbe, und der
   * Aufrufer glaubte, etwas bewirkt zu haben.
   */
  async loesche(
    organizationId: string,
    projektId: string,
    aufgabenId: string,
  ): Promise<void> {
    const ergebnis = await this.prisma.task.deleteMany({
      where: {
        id: aufgabenId,
        projectId: projektId,
        project: { organizationId },
      },
    });

    if (ergebnis.count === 0) {
      throw new NotFoundException('Aufgabe nicht gefunden');
    }
  }

  /**
   * Verschiebt eine Karte: neue Spalte, neue Position - in einem Schritt.
   *
   * ==========================================================================
   * DER ENDPOINT, UM DEN ES IN SPRINT 3 GEHT
   * ==========================================================================
   * Der Client schickt nicht die Position, sondern die beiden NACHBARN, und
   * dazu die Version, die er gelesen hat. Warum keine Position: siehe
   * move-task.dto.ts.
   *
   * Der Ablauf, und jeder Schritt hat einen Grund:
   *
   *   1. Aufgabe laden - mit Mandantenfilter. Kein Treffer: 404.
   *   2. Nachbarn laden - beide muessen in der ZIELSPALTE dieses Projekts
   *      liegen. Sonst waere die berechnete Position bedeutungslos.
   *   3. Position berechnen (Mittelwert bzw. Rand).
   *   4. Reicht die Genauigkeit nicht mehr: Spalte neu verteilen, Nachbarn
   *      neu lesen, erneut rechnen.
   *   5. Schreiben - aber nur, wenn die Version noch stimmt. Sonst: 409.
   *
   * Alles in EINER Transaktion, weil zwischen Lesen und Schreiben entschieden
   * wird. Ohne sie koennte die Neuverteilung halb geschrieben liegenbleiben -
   * und eine halb neu verteilte Spalte ist schlimmer als eine erschoepfte.
   */
  async verschiebe(
    organizationId: string,
    projektId: string,
    aufgabenId: string,
    daten: MoveTaskDto,
  ): Promise<Aufgabe> {
    return this.prisma.$transaction(async (tx) => {
      const aufgabe = await tx.task.findFirst({
        where: {
          id: aufgabenId,
          projectId: projektId,
          project: { organizationId },
        },
        select: { id: true },
      });

      if (!aufgabe) {
        throw new NotFoundException('Aufgabe nicht gefunden');
      }

      // Eine Karte kann nicht ihr eigener Nachbar sein. Ohne diese Pruefung
      // wuerde die Rechnung mit der ALTEN Position derselben Karte arbeiten -
      // das Ergebnis waere kein Fehler, sondern eine stille Verschiebung an
      // eine Stelle, die niemand gemeint hat.
      if (daten.previousId === aufgabenId || daten.nextId === aufgabenId) {
        throw new BadRequestException(
          'Eine Aufgabe kann nicht ihr eigener Nachbar sein',
        );
      }

      const nachbarn = () => this.ladeNachbarn(tx, projektId, daten);

      let { vorgaenger, nachfolger } = await nachbarn();
      let position = berechnePosition(vorgaenger, nachfolger);

      // ======================================================================
      // DIE ERSCHOEPFTE SPALTE
      // ======================================================================
      // Nach rund 30 Halbierungen an derselben Stelle passt die Position nicht
      // mehr in numeric(65,30). PostgreSQL wuerde runden, und zwei Karten
      // haetten dieselbe Position - die Reihenfolge waere ab da unbestimmt.
      //
      // Deshalb hier: Spalte neu verteilen (1000, 2000, 3000 ...), Nachbarn
      // neu lesen, erneut rechnen. Der zweite Durchgang kann nicht wieder
      // anschlagen, weil nach der Neuverteilung ganze Zahlen mit grossem
      // Abstand dastehen.
      if (brauchtNeuverteilung(position)) {
        await this.verteileNeu(tx, projektId, daten.status);

        ({ vorgaenger, nachfolger } = await nachbarn());
        position = berechnePosition(vorgaenger, nachfolger);
      }

      // ======================================================================
      // OPTIMISTISCHES SPERREN - DIE EIGENTLICHE ZEILE
      // ======================================================================
      // `version` steht im WHERE, nicht in einer Pruefung davor. Genau darin
      // liegt der Unterschied: Zwischen einem `if (aufgabe.version === ...)`
      // und dem folgenden UPDATE laege eine Luecke, in der ein anderer
      // schreiben koennte. Hier entscheidet die DATENBANK in einem Schritt.
      //
      // `increment: 1` statt eines gelesenen Werts, damit auch der Zaehler
      // selbst nicht aus einem veralteten Stand stammt.
      const ergebnis = await tx.task.updateMany({
        where: {
          id: aufgabenId,
          projectId: projektId,
          project: { organizationId },
          version: daten.version,
        },
        data: {
          status: daten.status,
          position,
          version: { increment: 1 },
        },
      });

      if (ergebnis.count === 0) {
        // Die Aufgabe gibt es (Schritt 1 in derselben Transaktion), also kann
        // nur die Version nicht mehr passen: Jemand war schneller.
        //
        // 409 und nicht 412 (Precondition Failed): 412 gehoert zu den
        // HTTP-Vorbedingungen ueber `If-Match`/ETag. Wir tragen die Version im
        // Koerper, nicht in einer Kopfzeile - dann ist 409 die ehrlichere
        // Antwort. Der Konflikt ist fachlich, nicht protokollarisch.
        throw new ConflictException(
          'Die Aufgabe wurde inzwischen geändert. Bitte neu laden.',
        );
      }

      const zeile = await tx.task.findFirstOrThrow({
        where: { id: aufgabenId },
        select: AUFGABE_FELDER,
      });

      return zuAufgabe(zeile);
    });
  }

  /**
   * Laedt die beiden angegebenen Nachbarn - und prueft dabei, dass sie
   * ueberhaupt dort liegen, wo der Client sie vermutet.
   *
   * ==========================================================================
   * WARUM DIE ZIELSPALTE IM WHERE STEHT
   * ==========================================================================
   * Ein Nachbar aus einer ANDEREN Spalte (oder einem anderen Projekt) hat eine
   * Position, die mit der Zielspalte nichts zu tun hat. Der Mittelwert waere
   * eine Zahl ohne Bedeutung, und die Karte landete an einer zufaelligen
   * Stelle - ohne Fehlermeldung.
   *
   * Der Fall ist nicht theoretisch: Genau so sieht es aus, wenn das Board des
   * Clients veraltet ist. Die Antwort darauf ist 400 und nicht etwa ein
   * stilles Zurechtruecken - der Client soll neu laden.
   */
  private async ladeNachbarn(
    tx: Prisma.TransactionClient,
    projektId: string,
    daten: MoveTaskDto,
  ): Promise<{
    vorgaenger: Prisma.Decimal | null;
    nachfolger: Prisma.Decimal | null;
  }> {
    const lade = async (id: string | null) => {
      if (!id) {
        return null;
      }

      const nachbar = await tx.task.findFirst({
        where: { id, projectId: projektId, status: daten.status },
        select: { position: true },
      });

      if (!nachbar) {
        throw new BadRequestException(
          'Die angegebene Nachbarkarte liegt nicht in dieser Spalte',
        );
      }

      return nachbar.position;
    };

    const vorgaenger = await lade(daten.previousId);
    const nachfolger = await lade(daten.nextId);

    // Die beiden muessen in der behaupteten Reihenfolge stehen. Sonst ist der
    // Mittelwert kein Wert ZWISCHEN ihnen, sondern ausserhalb - die Karte
    // landete irgendwo, und die Reihenfolge waere hinterher eine andere als
    // die, die der Nutzer gesehen hat.
    //
    // Gleichheit ist ebenfalls unzulaessig: Zwischen zwei gleichen Werten gibt
    // es keinen Platz. Dass es sie geben kann, steht im Kommentar bei
    // `erstelle` - hier faellt es auf, statt still falsch zu werden.
    if (vorgaenger && nachfolger && !vorgaenger.lessThan(nachfolger)) {
      throw new BadRequestException(
        'Die angegebenen Nachbarkarten stehen nicht in dieser Reihenfolge',
      );
    }

    return { vorgaenger, nachfolger };
  }

  /**
   * Verteilt die Positionen einer Spalte neu: 1000, 2000, 3000 ...
   *
   * Laeuft nur, wenn die Genauigkeit erschoepft ist - also selten. Dann aber
   * schreibt sie N Zeilen, und genau deshalb ist sie NICHT der Normalfall:
   * Waere das jede Verschiebung, haette man die Nachteile der
   * Integer-Nummerierung wieder eingekauft, die zu vermeiden der ganze Zweck
   * von `numeric` war.
   *
   * Die Reihenfolge beim Neuverteilen ist dieselbe wie beim Lesen des Boards
   * (Position, dann `createdAt`, dann `id`) - sonst koennte die Neuverteilung
   * die sichtbare Reihenfolge veraendern, und aus einer internen
   * Aufraeumarbeit wuerde eine fuer den Nutzer sichtbare Umsortierung.
   */
  private async verteileNeu(
    tx: Prisma.TransactionClient,
    projektId: string,
    status: TaskStatus,
  ): Promise<void> {
    const spalte = await tx.task.findMany({
      where: { projectId: projektId, status },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const positionen = neueVerteilung(spalte.length);

    // Nacheinander statt `Promise.all`: In EINER Transaktion laufen die
    // Anweisungen ohnehin seriell ueber dieselbe Verbindung. Parallel
    // abzuschicken brächte nichts und macht die Reihenfolge unklar.
    for (const [index, karte] of spalte.entries()) {
      await tx.task.update({
        where: { id: karte.id },
        data: { position: positionen[index] },
      });
    }
  }

  /**
   * Uebersetzt eine Nutzer-ID in die Mitgliedschaft dieses Nutzers in dieser
   * Organisation.
   *
   * ==========================================================================
   * HIER STECKT DIE REGEL "NUR AN MITGLIEDER DERSELBEN ORGANISATION"
   * ==========================================================================
   * Und zwar nicht als zusaetzliche Pruefung, sondern als NACHSCHLAG: Gesucht
   * wird die Mitgliedschaft ueber `(organizationId, userId)`. Ist der Nutzer
   * kein Mitglied, gibt es keine Zeile - und damit keine Zuweisung.
   *
   * Der Unterschied zu einer Pruefung ist wichtig: Eine Pruefung kann man
   * vergessen oder umgehen. Dieser Nachschlag ist der einzige Weg, ueberhaupt
   * an eine `assigneeId` zu kommen. Was es nicht gibt, kann man nicht
   * versehentlich durchlassen.
   *
   * 400 und nicht 404: Der Client hat etwas Ungueltiges GESCHICKT. Die
   * angesprochene Ressource (die Aufgabe) existiert sehr wohl.
   *
   * Was die Meldung bewusst NICHT sagt: ob es den Nutzer ueberhaupt gibt.
   * Sonst waere das ein Dienst, mit dem sich pruefen laesst, wer bei DevBoard
   * ein Konto hat - dieselbe Ueberlegung wie bei den Einladungen.
   */
  private async loeseZustaendigenAuf(
    tx: Prisma.TransactionClient,
    organizationId: string,
    nutzerId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (nutzerId === undefined) {
      return undefined;
    }

    if (nutzerId === null) {
      return null;
    }

    const mitgliedschaft = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: nutzerId } },
      select: { id: true },
    });

    if (!mitgliedschaft) {
      throw new BadRequestException(
        'Der Zuständige ist kein Mitglied dieser Organisation',
      );
    }

    return mitgliedschaft.id;
  }
}
