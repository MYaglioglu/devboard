import { istKonflikt } from './aufgaben';
import type { Aufgabe, AufgabenStatus } from './aufgaben';

/**
 * ============================================================================
 * DIE BOARD-LOGIK - OHNE REACT, OHNE DND-KIT, OHNE NETZWERK
 * ============================================================================
 * Eine eigene Datei aus demselben Grund wie `positionen.ts` im Backend: Der
 * fachlich heikelste Teil ist ohne Umgebung pruefbar, sobald er nichts anderes
 * mehr braucht.
 *
 * Drag & Drop ueber Testereignisse nachzustellen ist aufwendig und
 * bruechig - die Bibliothek dazwischen aendert ihr Verhalten von Version zu
 * Version. Die Rechnung, die dabei herauskommt, ist dagegen reine
 * Listenarithmetik. Genau die steht hier und wird in board-logik.spec.ts
 * geprueft.
 */

/**
 * Die Spalten des Boards - Reihenfolge und Beschriftung.
 *
 * Sie stehen im FRONTEND, nicht in der API-Antwort. Das Backend liefert
 * bewusst eine flache Liste: Eine leere Spalte kaeme in gruppierten Daten gar
 * nicht vor, und der Client muesste die vollstaendige Liste ohnehin kennen.
 * Die Spalten sind eine Eigenschaft des BOARDS, nicht der Daten.
 */
export const SPALTEN = [
  { status: 'TODO', titel: 'Offen' },
  { status: 'IN_PROGRESS', titel: 'In Arbeit' },
  { status: 'DONE', titel: 'Erledigt' },
] as const satisfies readonly { status: AufgabenStatus; titel: string }[];

/**
 * Sortiert die flache Liste in Spalten.
 *
 * Die Reihenfolge INNERHALB einer Spalte kommt vom Server (Position, dann
 * `createdAt`, dann `id`) und wird hier nicht angetastet - `filter` erhaelt
 * die Reihenfolge. Ein eigenes Sortieren waere eine zweite Wahrheit ueber die
 * Reihenfolge, und die beiden liefen bei gleichen Positionen auseinander.
 */
export function gruppiere(
  aufgaben: Aufgabe[],
): Record<AufgabenStatus, Aufgabe[]> {
  return {
    TODO: aufgaben.filter((a) => a.status === 'TODO'),
    IN_PROGRESS: aufgaben.filter((a) => a.status === 'IN_PROGRESS'),
    DONE: aufgaben.filter((a) => a.status === 'DONE'),
  };
}

/**
 * Welche Meldung gehoert zu einem fehlgeschlagenen Verschieben?
 *
 * ============================================================================
 * WARUM DAS EINE EIGENE FUNKTION IST
 * ============================================================================
 * Weil hier eine ENTSCHEIDUNG steckt, und Entscheidungen gehoeren geprueft.
 * Im Bauch einer Komponente waere sie nur ueber eine echte Ziehbewegung
 * erreichbar - und die laesst sich im Test kaum zuverlaessig nachstellen.
 *
 * Die Unterscheidung selbst ist der Punkt: Ein 409 ist KEINE Stoerung. Er
 * sagt, dass jemand anderes schneller war. Die Anzeige ist durch das Rollback
 * bereits zurueckgesetzt, der echte Stand wird nachgeladen - es ist also alles
 * richtig gelaufen, nur nicht so, wie der Nutzer es sich gedacht hat.
 *
 * "Etwas ist schiefgelaufen" waere an dieser Stelle schlicht unwahr.
 */
export function verschiebeMeldung(fehler: unknown): string {
  return istKonflikt(fehler)
    ? 'Diese Karte wurde inzwischen von jemand anderem verschoben. Das Board wurde neu geladen.'
    : 'Die Karte konnte nicht verschoben werden.';
}

/**
 * Uebersetzt das Ziel einer Ablage in einen Index.
 *
 * dnd-kit meldet beim Loslassen, WORUEBER die Karte haengt: entweder ueber
 * einer anderen Karte oder ueber der Spalte selbst (dann liegt sie unter der
 * letzten Karte oder die Spalte ist leer).
 *
 * Gerechnet wird auf der Spalte OHNE die bewegte Karte - aus demselben Grund
 * wie bei `planeVerschiebung`: Sonst zaehlt sich die Karte selbst mit, und der
 * Index stimmt nur in eine Richtung.
 */
export function zielIndexFuer(
  aufgaben: Aufgabe[],
  bewegteId: string,
  zielStatus: AufgabenStatus,
  ueberId: string | null,
): number {
  const zielspalte = aufgaben.filter(
    (a) => a.status === zielStatus && a.id !== bewegteId,
  );

  if (!ueberId) {
    return zielspalte.length;
  }

  const index = zielspalte.findIndex((a) => a.id === ueberId);

  // Kein Treffer heisst: abgelegt ueber der Spalte, nicht ueber einer Karte -
  // also ans Ende.
  return index === -1 ? zielspalte.length : index;
}

/** Was der Server zum Verschieben braucht. */
export interface Verschiebung {
  previousId: string | null;
  nextId: string | null;
  status: AufgabenStatus;
  version: number;
}

/**
 * Bestimmt Nachbarn und neue Liste fuer eine Verschiebung.
 *
 * ============================================================================
 * WARUM DIE KARTE ZUERST ENTFERNT WIRD
 * ============================================================================
 * Der schwierige Fall ist das Verschieben INNERHALB einer Spalte. Nimmt man
 * die Nachbarn aus der unveraenderten Liste, zaehlt die Karte sich selbst mit:
 *
 *     [A, B, C],  C soll an Position 1
 *     Nachbarn aus der alten Liste: A (Index 0) und B (Index 1)  -> richtig
 *
 *     [A, B, C],  A soll an Position 2
 *     Nachbarn aus der alten Liste: B (Index 1) und C (Index 2)  -> FALSCH,
 *     denn nach dem Entfernen von A ist Index 2 das Ende der Liste.
 *
 * Der Fehler faellt nicht auf, solange man nur nach unten oder nur nach oben
 * schiebt - er kippt genau in eine Richtung. Deshalb: erst entfernen, dann den
 * Zielindex auf der VERKUERZTEN Liste lesen. Dieselbe Regel gilt in jeder
 * Sortier-Bibliothek; `arrayMove` von dnd-kit macht intern nichts anderes.
 *
 * Gibt `null` zurueck, wenn die Karte nicht gefunden wurde - dann ist die
 * Anzeige veraltet, und der Aufrufer soll neu laden statt zu raten.
 */
export function planeVerschiebung(
  aufgaben: Aufgabe[],
  bewegteId: string,
  zielStatus: AufgabenStatus,
  zielIndex: number,
): { verschiebung: Verschiebung; vorschau: Aufgabe[] } | null {
  const bewegte = aufgaben.find((a) => a.id === bewegteId);

  if (!bewegte) {
    return null;
  }

  const zielspalte = aufgaben.filter(
    (a) => a.status === zielStatus && a.id !== bewegteId,
  );

  // Der Index wird eingegrenzt, statt ihm zu vertrauen: dnd-kit meldet beim
  // Ablegen auf einer leeren Spalte oder unterhalb der letzten Karte einen
  // Index, der ueber das Ende hinausgeht.
  const index = Math.max(0, Math.min(zielIndex, zielspalte.length));

  const verschiebung: Verschiebung = {
    previousId: index > 0 ? zielspalte[index - 1].id : null,
    nextId: index < zielspalte.length ? zielspalte[index].id : null,
    status: zielStatus,
    version: bewegte.version,
  };

  /**
   * Die Vorschau fuer das optimistische Update.
   *
   * Die Karte bekommt den neuen Status, aber KEINE neue Position - die
   * berechnet der Server, und eine erfundene waere eine Behauptung ueber
   * etwas, das wir nicht wissen. Stattdessen wird sie an der richtigen Stelle
   * der Liste EINSORTIERT; die Anzeige liest die Reihenfolge aus der Liste,
   * nicht aus dem Positionswert.
   *
   * Das ist der Grund, warum `position` fuer das Frontend eine
   * undurchsichtige Kennung sein darf: Es rechnet nie damit.
   */
  const ohneBewegte = aufgaben.filter((a) => a.id !== bewegteId);
  const neueKarte: Aufgabe = { ...bewegte, status: zielStatus };

  const vorschau: Aufgabe[] = [];
  let eingefuegt = false;
  let zaehler = 0;

  for (const aufgabe of ohneBewegte) {
    if (aufgabe.status === zielStatus) {
      if (zaehler === index) {
        vorschau.push(neueKarte);
        eingefuegt = true;
      }
      zaehler++;
    }
    vorschau.push(aufgabe);
  }

  if (!eingefuegt) {
    vorschau.push(neueKarte);
  }

  return { verschiebung, vorschau };
}
