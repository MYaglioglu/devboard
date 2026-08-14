import { ActivityType } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { TaskStatus } from '../generated/prisma/enums';

/**
 * ============================================================================
 * DIE EREIGNISSE ALS TYPEN - UND WARUM DIESE DATEI NICHTS SCHREIBT
 * ============================================================================
 * `activities.payload` ist `jsonb`. Die Datenbank prueft den Inhalt NICHT: Es
 * gibt kein Constraint, das erzwingt, dass bei TASK_MOVED auch `fromStatus`
 * darin steht. Diese Garantie muss der Code geben - und zwar an genau einer
 * Stelle, sonst gibt er sie gar nicht.
 *
 * Deshalb wird `payload` nirgends als freies Objekt geschrieben. Der einzige
 * Weg zu einem Eintrag fuehrt ueber `Ereignis` unten: eine unterscheidbare
 * Union (discriminated union). Der Compiler weiss dadurch, dass zu
 * 'TASK_MOVED' zwingend `vonStatus` und `nachStatus` gehoeren, und lehnt einen
 * halb gefuellten Eintrag ab, bevor er entsteht.
 *
 * Das ist der bewusste Tausch aus ADR-011: Wir geben die Pruefung der
 * Datenbank auf, um nicht bei jedem neuen Ereignistyp eine Migration zu
 * brauchen - und holen sie uns im Typsystem zurueck. Wer das im Gespraech
 * erklaeren muss, sagt genau diesen Satz.
 *
 * ============================================================================
 * WARUM DIESE DATEI REIN RECHNEND IST
 * ============================================================================
 * Kein Prisma-Aufruf, kein NestJS, kein `await`. Dieselbe Trennung wie bei
 * `positionen.ts` und `board-logik.ts` in Sprint 3 - nicht wegen der
 * Architekturlehre, sondern weil die Testkosten um eine Groessenordnung
 * auseinanderliegen: Die Abbildung Ereignis -> Datenbankzeile laesst sich ohne
 * laufende Datenbank vollstaendig pruefen.
 */

/**
 * Ein Ereignis, so wie der Fachcode es meldet.
 *
 * Die Felder heissen hier deutsch (`titel`, `vonStatus`), weil sie von den
 * Services gefuellt werden. In der Datenbank landen sie unter englischen
 * Schluesseln - dieselbe Sprache wie die Spaltennamen. Die Uebersetzung
 * passiert unten in `zuZeile`, an einer Stelle.
 */
export type Ereignis =
  | { typ: 'PROJEKT_ANGELEGT'; projektId: string; name: string }
  | {
      typ: 'PROJEKT_GEAENDERT';
      projektId: string;
      name: string;
      /**
       * Welche Felder sich geaendert haben - nicht ihre Werte.
       *
       * Ein Feed sagt "Murat hat die Beschreibung geaendert", nicht "von X
       * nach Y". Die alten Werte mitzuschreiben waere der Anfang einer
       * vollstaendigen Aenderungshistorie: deutlich mehr Daten, und bei
       * Freitextfeldern landen damit Inhalte im Protokoll, die spaeter
       * geloescht wurden. Vermerkt in 06_BACKLOG.md.
       */
      geaenderteFelder: string[];
    }
  | { typ: 'PROJEKT_ARCHIVIERT'; projektId: string; name: string }
  | {
      typ: 'AUFGABE_ANGELEGT';
      projektId: string;
      aufgabenId: string;
      titel: string;
      status: TaskStatus;
    }
  | {
      typ: 'AUFGABE_GEAENDERT';
      projektId: string;
      aufgabenId: string;
      titel: string;
      geaenderteFelder: string[];
    }
  | {
      typ: 'AUFGABE_VERSCHOBEN';
      projektId: string;
      aufgabenId: string;
      titel: string;
      vonStatus: TaskStatus;
      nachStatus: TaskStatus;
    }
  /**
   * ==========================================================================
   * DER EINZIGE FALL OHNE `aufgabenId` - UND DAS IST KEIN VERSEHEN
   * ==========================================================================
   * Die Aufgabe wird in derselben Transaktion geloescht. Eine gesetzte ID
   * wuerde durch `ON DELETE SET NULL` unmittelbar wieder auf NULL fallen - wir
   * schrieben also einen Wert, dessen Verschwinden wir bereits kennen.
   *
   * Ihn wegzulassen ist ehrlicher: Der Eintrag behauptet gar nicht erst, auf
   * eine Zeile zu zeigen, die es nicht mehr gibt. Genau deshalb steht der
   * Titel in `payload` und nicht nur hinter der Verbindung - sonst waere im
   * Feed nur zu lesen, dass IRGENDEINE Aufgabe geloescht wurde.
   *
   * Der Compiler erzwingt das mit: Wer hier `aufgabenId` uebergeben will,
   * bekommt einen Fehler.
   */
  | { typ: 'AUFGABE_GELOESCHT'; projektId: string; titel: string };

/**
 * Die Spalten einer Aktivitaets-Zeile, die aus dem Ereignis stammen.
 *
 * `organizationId`, `actorId` und `createdAt` fehlen hier absichtlich: Sie
 * kommen nicht aus dem Ereignis, sondern aus dem Aufrufkontext bzw. von der
 * Datenbank. Eine Funktion, die nur die Haelfte kennt, sollte auch nur die
 * Haelfte liefern - sonst muesste sie Werte durchreichen, die sie nicht
 * beurteilen kann.
 */
export interface AktivitaetsZeile {
  type: ActivityType;
  projectId: string;
  taskId: string | null;
  payload: Prisma.InputJsonValue;
}

/**
 * Uebersetzt ein Ereignis in die Spalten seiner Zeile.
 *
 * ============================================================================
 * WARUM HIER EIN `switch` UND KEINE NACHSCHLAGETABELLE STEHT
 * ============================================================================
 * Ein Objekt `{ AUFGABE_VERSCHOBEN: (e) => ... }` waere kuerzer. Der `switch`
 * ueber das Unterscheidungsfeld hat aber eine Eigenschaft, auf die es hier
 * ankommt: TypeScript engt den Typ in jedem Zweig ein (`narrowing`). Im Zweig
 * 'AUFGABE_VERSCHOBEN' existiert `ereignis.vonStatus`, in allen anderen nicht -
 * ein Tippfehler ist ein Compilerfehler, kein stiller `undefined`-Wert im
 * `payload`.
 *
 * Dazu kommt die Vollstaendigkeitspruefung am Ende: Kommt ein neuer
 * Ereignistyp zur Union hinzu und wird hier vergessen, schlaegt die Zuweisung
 * an `niemals` fehl. Der Compiler erinnert daran - nicht ein Feed, in dem der
 * Eintrag spaeter fehlt.
 */
export const zuZeile = (ereignis: Ereignis): AktivitaetsZeile => {
  switch (ereignis.typ) {
    case 'PROJEKT_ANGELEGT':
      return {
        type: ActivityType.PROJECT_CREATED,
        projectId: ereignis.projektId,
        taskId: null,
        payload: { name: ereignis.name },
      };

    case 'PROJEKT_GEAENDERT':
      return {
        type: ActivityType.PROJECT_UPDATED,
        projectId: ereignis.projektId,
        taskId: null,
        payload: {
          name: ereignis.name,
          changedFields: ereignis.geaenderteFelder,
        },
      };

    case 'PROJEKT_ARCHIVIERT':
      return {
        type: ActivityType.PROJECT_ARCHIVED,
        projectId: ereignis.projektId,
        taskId: null,
        payload: { name: ereignis.name },
      };

    case 'AUFGABE_ANGELEGT':
      return {
        type: ActivityType.TASK_CREATED,
        projectId: ereignis.projektId,
        taskId: ereignis.aufgabenId,
        payload: { title: ereignis.titel, status: ereignis.status },
      };

    case 'AUFGABE_GEAENDERT':
      return {
        type: ActivityType.TASK_UPDATED,
        projectId: ereignis.projektId,
        taskId: ereignis.aufgabenId,
        payload: {
          title: ereignis.titel,
          changedFields: ereignis.geaenderteFelder,
        },
      };

    case 'AUFGABE_VERSCHOBEN':
      return {
        type: ActivityType.TASK_MOVED,
        projectId: ereignis.projektId,
        taskId: ereignis.aufgabenId,
        payload: {
          title: ereignis.titel,
          fromStatus: ereignis.vonStatus,
          toStatus: ereignis.nachStatus,
        },
      };

    case 'AUFGABE_GELOESCHT':
      return {
        type: ActivityType.TASK_DELETED,
        projectId: ereignis.projektId,
        // Siehe Kommentar an der Union: Die Zeile ist gleich weg, eine ID
        // waere unmittelbar nach dem Schreiben wieder NULL.
        taskId: null,
        payload: { title: ereignis.titel },
      };
  }

  // ==========================================================================
  // DIE VOLLSTAENDIGKEITSPRUEFUNG
  // ==========================================================================
  // Sind oben alle Faelle behandelt, hat `ereignis` hier den Typ `never` -
  // "kann nicht vorkommen". Die Zuweisung ist dann gueltig und diese Zeile
  // toter Code.
  //
  // Fehlt ein Fall, ist `ereignis` hier NICHT `never`, sondern der vergessene
  // Typ - und die Zuweisung schlaegt fehl. Das ist der Trick: Der Fehler
  // erscheint beim Kompilieren an dieser Stelle, statt zur Laufzeit als
  // fehlender Feed-Eintrag, den niemand vermisst, weil man nicht sieht, was
  // nicht da ist.
  const niemals: never = ereignis;
  throw new Error(`Unbekanntes Ereignis: ${JSON.stringify(niemals)}`);
};
