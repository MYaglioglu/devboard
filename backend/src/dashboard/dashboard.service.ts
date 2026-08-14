import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '../generated/prisma/enums';

/**
 * Die Kennzahlen einer Organisation.
 *
 * Bewusst FLACH und ohne Prozentwerte: Ein Anteil "60 % offen" laesst sich aus
 * zwei Zahlen jederzeit ausrechnen, aber aus einem gerundeten Prozentwert
 * bekommt man die Zahlen nie zurueck. Was der Server herausgibt, sollte die
 * kleinste Form sein, aus der sich alles andere ableiten laesst.
 */
export interface Kennzahlen {
  projects: { active: number; archived: number };
  tasks: { todo: number; inProgress: number; done: number; open: number };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ==========================================================================
   * DIE ABFRAGE, UM DIE ES IN SCHEIBE 4.4 GEHT
   * ==========================================================================
   * Der naheliegende Weg waere: Projekte laden, je Projekt die Aufgaben
   * zaehlen. Der Code liest sich harmlos - "hole die Projekte, zaehle je
   * Projekt" - und setzt zwei Abfragen JE PROJEKT ab.
   *
   * Gemessen wurde beides (`scripts/messung-dashboard.ts`):
   *
   *    20 Projekte:   42 Abfragen,  68 ms   ->  4 Abfragen, 17 ms
   *   100 Projekte:  202 Abfragen, 276 ms   ->  4 Abfragen, 16 ms
   *
   * Die Aussage ist nicht "4 ist weniger als 202". Sie ist: Die eine Zahl
   * WAECHST mit den Daten, die andere nicht. Genau das macht N+1 so teuer -
   * in der Entwicklung mit drei Testprojekten faellt es niemandem auf.
   *
   * Die Arbeit verschwindet dabei nicht, sie WANDERT: Statt der Anwendung
   * zaehlt die Datenbank, dort wo die Daten liegen. Sie braucht dafuer einen
   * Durchgang durch den Index statt N Umlaeufe ueber das Netzwerk - und der
   * teure Teil an N+1 sind selten die Rechenzeiten, sondern die Wartezeiten.
   */
  async berechne(organizationId: string): Promise<Kennzahlen> {
    const { aktiv, archiviert, nachStatus } = await this.prisma.$transaction(
      async (tx) => ({
        aktiv: await tx.project.count({
          where: { organizationId, archivedAt: null },
        }),
        archiviert: await tx.project.count({
          where: { organizationId, archivedAt: { not: null } },
        }),
        // ==================================================================
        // EINE ABFRAGE FUER ALLE DREI SPALTEN
        // ==================================================================
        // `groupBy` wird zu `GROUP BY status` - die Datenbank liest die
        // Aufgaben EINMAL und zaehlt dabei je Status. Drei einzelne
        // `count`-Abfragen waeren die kleinere Version desselben Fehlers:
        // dreimal dieselben Zeilen lesen, um jedes Mal etwas anderes zu
        // zaehlen.
        //
        // Der Mandant steht ueber die BEZIEHUNG in der Bedingung
        // (`project: { organizationId }`) - Tasks haben keine eigene
        // `organizationId`, und daran aendert sich hier nichts. In SQL wird
        // daraus ein Join auf `projects`.
        //
        // `archivedAt: null` ist eine fachliche Entscheidung und keine
        // technische: Die Kennzahlen beschreiben die LAUFENDE Arbeit.
        // Aufgaben aus archivierten Projekten wuerden die Zahl offener
        // Aufgaben dauerhaft aufblaehen, ohne dass jemand daran noch
        // arbeitet.
        nachStatus: await tx.task.groupBy({
          by: ['status'],
          where: { project: { organizationId, archivedAt: null } },
          // Pflichtangabe bei `groupBy`, auch wenn die Reihenfolge hier egal
          // ist - nachgeschlagen wird ohnehin gezielt.
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
      }),
      // ====================================================================
      // WARUM DIE ISOLATIONSSTUFE HIER STEHT
      // ====================================================================
      // Eine Transaktion allein macht die drei Zahlen NICHT konsistent. Bei
      // der Voreinstellung READ COMMITTED bekommt JEDE Anweisung ihren
      // eigenen Schnappschuss. Wird zwischen der zweiten und der dritten eine
      // Aufgabe angelegt, beschreiben sie verschiedene Staende - das
      // Dashboard zeigte Zahlen, die zusammen nie gegolten haben.
      //
      // REPEATABLE READ friert den Schnappschuss beim ERSTEN Lesen ein. Alle
      // drei Zahlen beschreiben denselben Augenblick.
      //
      // Der Preis ist hier gering, weil nur gelesen wird: Es gibt keine
      // Schreibkonflikte, die einen Serialisierungsfehler ausloesen koennten.
      // Bei einer schreibenden Transaktion waere das eine andere Abwaegung -
      // dort muesste der Aufrufer mit Wiederholungen rechnen.
      { isolationLevel: 'RepeatableRead' },
    );

    // Fehlt ein Status ganz (keine einzige erledigte Aufgabe), liefert
    // `groupBy` dafuer KEINE Zeile - nicht etwa eine mit 0. Ohne den
    // Rueckfall auf 0 waere die Antwort dann `undefined`, und das Frontend
    // zeigte eine leere Kachel statt einer Null.
    const zaehle = (status: TaskStatus) =>
      nachStatus.find((zeile) => zeile.status === status)?._count._all ?? 0;

    const todo = zaehle(TaskStatus.TODO);
    const inProgress = zaehle(TaskStatus.IN_PROGRESS);

    return {
      projects: { active: aktiv, archived: archiviert },
      tasks: {
        todo,
        inProgress,
        done: zaehle(TaskStatus.DONE),
        // `open` ist abgeleitet und wird trotzdem mitgeliefert: Es ist die
        // Zahl, die auf dem Dashboard gross dasteht. Sie im Frontend zu
        // addieren waere dieselbe Rechnung an einer zweiten Stelle - und die
        // zweite Stelle vergisst man, wenn ein vierter Status dazukommt.
        open: todo + inProgress,
      },
    };
  }
}
