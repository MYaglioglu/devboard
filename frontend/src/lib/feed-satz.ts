import { SPALTEN } from './board-logik';
import type { FeedEintrag } from './aktivitaeten';

/**
 * ============================================================================
 * AUS EINEM EREIGNIS EINEN SATZ MACHEN - OHNE REACT
 * ============================================================================
 * Reine Rechnung, in einer eigenen Datei, ohne Komponenten und ohne Netzwerk -
 * dieselbe Trennung wie bei `board-logik.ts` und `positionen.ts` im Backend.
 * Nicht wegen der Architekturlehre, sondern weil die Testkosten um eine
 * Groessenordnung auseinanderliegen: Alle Ereignistypen und alle Ausfaelle
 * lassen sich hier ohne einen einzigen gerenderten Knoten pruefen.
 *
 * ============================================================================
 * DER GRUND, WARUM DIESE DATEI SO VORSICHTIG MIT `payload` UMGEHT
 * ============================================================================
 * `payload` ist im Backend `jsonb` und von der Datenbank NICHT geprueft. Was
 * hier ankommt, ist JSON aus dem Netz - also `unknown`. Ein Zugriff wie
 * `eintrag.payload.title` waere ein Absturz, sobald ein alter Eintrag aus
 * einer frueheren Version das Feld nicht hat.
 *
 * Und der Fall ist real: Der Feed ist ein PROTOKOLL. Seine Eintraege sind
 * unveraenderlich und ueberdauern jede Aenderung am Format - Zeilen von heute
 * werden in einem Jahr noch angezeigt, mit dem Aufbau von heute. Ein Frontend,
 * das den aktuellen Aufbau voraussetzt, bricht genau dann, wenn der Feed
 * seinen Zweck erfuellt.
 *
 * Deshalb: lesen, was da ist, und sonst einen allgemeineren Satz zeigen. Ein
 * Eintrag ohne Titel ist immer noch die Auskunft "hier ist etwas passiert".
 */

/** Liest ein Textfeld aus dem `payload` - oder `null`, wenn es fehlt. */
const text = (payload: unknown, feld: string): string | null => {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const wert = (payload as Record<string, unknown>)[feld];

  // Auch ein leerer Text zaehlt als "nicht da": Ein Satz wie
  // "hat die Aufgabe >>>><<<< verschoben" ist schlechter als der allgemeine.
  return typeof wert === 'string' && wert.length > 0 ? wert : null;
};

/**
 * Uebersetzt einen Status in seine Spaltenbezeichnung.
 *
 * `SPALTEN` aus `board-logik.ts` und keine eigene Liste: Sonst hiesse dieselbe
 * Spalte auf dem Board "Offen" und im Feed vielleicht "Zu erledigen" - und
 * niemand merkt es, weil beide Stellen fuer sich stimmig sind.
 *
 * Ein unbekannter Wert wird durchgereicht statt ersetzt: Kommt ein vierter
 * Status dazu, steht im Feed voruebergehend der Enum-Wert. Das ist haesslich
 * und ehrlich - besser als ein erfundener Name oder eine leere Stelle.
 */
const spaltenName = (status: string | null): string | null =>
  status === null
    ? null
    : (SPALTEN.find((spalte) => spalte.status === status)?.titel ?? status);

/** Wer gehandelt hat - fuer die Anzeige. */
export const akteurName = (eintrag: FeedEintrag): string =>
  eintrag.actor?.name ??
  eintrag.actor?.email ??
  // ==========================================================================
  // GITHUB-EREIGNISSE HABEN NIE EINEN AKTEUR - UND DAS IST KEIN VERLUST
  // ==========================================================================
  // Ohne diesen Zweig liefe ein Push in den Satz darunter und der Feed
  // behauptete, ein ausgetretener Kollege habe ihn gemacht. `actor: null` hat
  // seit Sprint 5 zwei Ursachen, und nur `source` unterscheidet sie.
  //
  // Der GitHub-Anmeldename steht im `payload` und wird wie alles dort
  // vorsichtig gelesen: Fehlt er, bleibt es beim allgemeinen "Jemand auf
  // GitHub" - ein Satz, der stimmt, statt eines, der genauer klingt.
  (eintrag.source === 'GITHUB'
    ? (text(eintrag.payload, 'githubLogin') ?? 'Jemand auf GitHub')
    : null) ??
  // `actor: null` ist kein Fehler, sondern der Normalfall nach einer
  // Kontoloeschung: Das Backend setzt die Verbindung auf NULL und laesst das
  // Ereignis stehen. Der Verlauf des Teams soll nicht verschwinden, nur weil
  // jemand gegangen ist.
  'Ein entferntes Mitglied';

/**
 * Der Satz zu einem Ereignis - ohne den Akteur, der davorsteht.
 *
 * Rueckgabe ist bewusst nur der Text und kein JSX: Damit bleibt die Funktion
 * ohne React pruefbar. Die Hervorhebung des Titels macht die Komponente.
 */
export function ereignisSatz(eintrag: FeedEintrag): string {
  const titel = text(eintrag.payload, 'title');
  const name = text(eintrag.payload, 'name');

  switch (eintrag.type) {
    case 'PROJECT_CREATED':
      return name
        ? `hat das Projekt „${name}" angelegt`
        : 'hat ein Projekt angelegt';

    case 'PROJECT_UPDATED':
      return name
        ? `hat das Projekt „${name}" geändert`
        : 'hat ein Projekt geändert';

    case 'PROJECT_ARCHIVED':
      return name
        ? `hat das Projekt „${name}" archiviert`
        : 'hat ein Projekt archiviert';

    case 'TASK_CREATED':
      return titel ? `hat „${titel}" angelegt` : 'hat eine Aufgabe angelegt';

    case 'TASK_UPDATED':
      return titel ? `hat „${titel}" geändert` : 'hat eine Aufgabe geändert';

    case 'TASK_DELETED':
      return titel ? `hat „${titel}" gelöscht` : 'hat eine Aufgabe gelöscht';

    case 'TASK_MOVED': {
      const von = spaltenName(text(eintrag.payload, 'fromStatus'));
      const nach = spaltenName(text(eintrag.payload, 'toStatus'));
      const was = titel ? `„${titel}"` : 'eine Aufgabe';

      // ====================================================================
      // DER FALL, DEN DAS BACKEND AUSDRUECKLICH ZULAESST
      // ====================================================================
      // Gleicher Von- und Nach-Status heisst: umsortiert INNERHALB einer
      // Spalte. Das ist ein gueltiges Ereignis (siehe ereignisse.ts im
      // Backend), und "hat X von Offen nach Offen verschoben" waere Unsinn.
      //
      // Genau deshalb entscheidet das Frontend ueber den Satz und nicht das
      // Backend ueber das Ereignis: Die Daten sind in beiden Faellen dieselbe
      // Tatsache, nur die Formulierung unterscheidet sich.
      if (von && nach && von === nach) {
        return `hat ${was} in „${von}" umsortiert`;
      }

      if (von && nach) {
        return `hat ${was} von „${von}" nach „${nach}" verschoben`;
      }

      return `hat ${was} verschoben`;
    }
  }

  // Ein Ereignistyp, den diese Version noch nicht kennt. Kein Absturz und
  // keine leere Zeile - der Feed sagt dann eben nur, DASS etwas war.
  //
  // Anders als im Backend gibt es hier bewusst KEINE `never`-Pruefung: Dort
  // erzeugen wir die Ereignisse selbst, hier empfangen wir sie. Ein Frontend,
  // das aeltere oder neuere Serverstaende nicht ertraegt, ist waehrend jedes
  // Deployments kaputt.
  return 'hat etwas geändert';
}
