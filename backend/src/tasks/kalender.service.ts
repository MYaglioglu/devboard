import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { TaskStatus } from '../generated/prisma/enums';
import type { KalenderQueryDto } from './dto/kalender-query.dto';
import type { Zustaendiger } from './tasks.service';

/**
 * Ein Termin im Kalender - eine Aufgabe mit Faelligkeitsdatum.
 *
 * ============================================================================
 * WARUM DAS NICHT `Aufgabe` AUS tasks.service.ts IST
 * ============================================================================
 * Zwei Unterschiede, und beide folgen aus derselben Ursache: Der Kalender
 * blickt ueber die ganze ORGANISATION, das Board nur in EIN Projekt.
 *
 *   1. `project` ist dabei. Bei `Aufgabe` fehlt es ausdruecklich, weil der
 *      Client das Projekt schon kennt - es steht in dem Pfad, den er
 *      aufgerufen hat. Hier kennt er es nicht: Auf demselben Dienstag liegen
 *      Aufgaben aus drei verschiedenen Projekten, und ohne Namen sind sie
 *      nicht auseinanderzuhalten und ohne ID nicht verlinkbar.
 *
 *   2. `position` fehlt. Sie ist die Reihenfolge INNERHALB einer Board-Spalte
 *      und hat im Kalender keine Bedeutung - dort sortiert die Uhrzeit.
 *      Sie trotzdem mitzuschicken waere eine Einladung, sie zu benutzen.
 *
 * `version` bleibt drin: In K.4 wird ein Termin per Drag auf einen anderen Tag
 * gezogen, und dafuer braucht der Client den Stand, gegen den der Server
 * prueft.
 *
 * `dueDate` ist hier NICHT optional. Ein Eintrag ohne Datum ist kein Termin;
 * die Abfrage liefert ihn gar nicht erst.
 */
export interface Kalendereintrag {
  id: string;
  title: string;
  status: TaskStatus;
  version: number;
  dueDate: Date;
  assignee: Zustaendiger | null;
  project: { id: string; name: string };
}

@Injectable()
export class KalenderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alle Termine einer Organisation in einem Zeitraum.
   *
   * ==========================================================================
   * DER MANDANTENFILTER - DIREKT AUF `tasks`
   * ==========================================================================
   * Er steht in der WHERE-Bedingung, nicht in einer Pruefung nach dem Laden.
   * Das ist die Regel, die im Projekt inzwischen an sechs Stellen steht, und
   * ein vergessener Filter faellt im Erfolgspfad nicht auf - deshalb gibt es
   * dazu einen negativen Test und eine Mutationsprobe (12_TESTING.md).
   *
   * Neu gegenueber allen anderen Task-Abfragen ist die STELLE: `organizationId`
   * kommt von der Aufgabe selbst, nicht ueber `project: { organizationId }`.
   * Genau dafuer wurde die Spalte am 02.09.2026 eingefuehrt - die Fassung mit
   * dem Verbund las bei zehn Mandanten 6740 Zeilen, um 674 zurueckzugeben.
   * Der Ausfuehrungsplan steht in 12_TESTING.md.
   *
   * Sicherheitlich sind beide Fassungen gleichwertig: Der zusammengesetzte
   * Fremdschluessel garantiert, dass die Mandanten-ID der Aufgabe mit der
   * ihres Projekts uebereinstimmt. Ohne diese Garantie waere die Abkuerzung
   * nicht erlaubt, sondern eine zweite Wahrheit im Sicherheitsfilter.
   *
   * ==========================================================================
   * WARUM ARCHIVIERTE PROJEKTE NICHT VORKOMMEN
   * ==========================================================================
   * Ein archiviertes Projekt ist aus der Projektliste verschwunden, seine
   * Aufgaben bleiben aber als Verlauf erhalten (schema.prisma bei
   * `Project.archivedAt`). Ein Kalender zeigt, was ZU TUN ist - Fristen eines
   * abgeschlossenen Projekts sind kein offener Termin mehr, sondern Historie.
   *
   * Wer sie sehen will, findet sie im Feed. Das ist die Stelle fuer
   * Vergangenes.
   *
   * ==========================================================================
   * WAS HIER NICHT PASSIERT: ZEITZONEN
   * ==========================================================================
   * Der Server bekommt zwei Zeitpunkte und vergleicht sie mit einem
   * gespeicherten Zeitpunkt. Alle drei sind UTC, der Vergleich ist damit
   * eindeutig. Welcher KALENDERTAG das ist, entscheidet die Zone des
   * Betrachters - und die kennt der Server nicht.
   *
   * Diese Aufteilung ist Absicht: Sobald der Server anfinge, "den 15."
   * auszurechnen, muesste er eine Zone raten. Er rechnet stattdessen gar
   * nicht, und das Frontend formatiert. Ausfuehrlich in der ADR aus K.6.
   */
  async findeZeitraum(
    organizationId: string,
    zeitraum: KalenderQueryDto,
  ): Promise<Kalendereintrag[]> {
    const zeilen = await this.prisma.task.findMany({
      where: {
        // Halboffen: `von` gehoert dazu, `bis` nicht. Warum, steht im
        // Query-DTO - dort ist die Entscheidung getroffen worden.
        organizationId,
        dueDate: { gte: zeitraum.von, lt: zeitraum.bis },
        // Der Verbund bleibt - aber nur noch fuer das Archiv-Kennzeichen, das
        // es auf `tasks` nicht gibt und aus gutem Grund auch nicht geben soll:
        // Anders als der Mandant AENDERT es sich (ein Projekt wird
        // archiviert), und eine veraenderliche Kopie ist genau die zweite
        // Wahrheit, die man nicht will.
        project: { archivedAt: null },
      },
      orderBy: [
        { dueDate: 'asc' },
        // Gleichstand-Aufloesung. Ohne sie waere die Reihenfolge zweier
        // Aufgaben mit derselben Uhrzeit von Lauf zu Lauf verschieden, und
        // der Kalender "zappelt" beim Neuladen - dieselbe Ueberlegung wie
        // beim Board.
        { id: 'asc' },
      ],
      select: {
        id: true,
        title: true,
        status: true,
        version: true,
        dueDate: true,
        // Ein einziges `select` mit verschachtelter Beziehung - Prisma macht
        // daraus EINE Abfrage plus je eine pro Beziehungsebene, nicht eine
        // pro Zeile. Das ist der Unterschied, der in Sprint 4 gemessen wurde:
        // keine N+1, weil nicht in einer Schleife nachgeladen wird.
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    return zeilen.map((zeile) => ({
      id: zeile.id,
      title: zeile.title,
      status: zeile.status,
      version: zeile.version,
      // Der Filter `dueDate: { gte, lt }` schliesst NULL aus - Prisma
      // uebersetzt das nach SQL, und in SQL ist jeder Vergleich mit NULL
      // unbekannt, also nicht wahr. TypeScript sieht dem Typ das nicht an,
      // deshalb steht die Zusicherung hier mit dieser Begruendung statt
      // wortlos.
      dueDate: zeile.dueDate as Date,
      assignee: zeile.assignee
        ? {
            userId: zeile.assignee.userId,
            name: zeile.assignee.user.name,
            email: zeile.assignee.user.email,
          }
        : null,
      project: zeile.project,
    }));
  }
}
