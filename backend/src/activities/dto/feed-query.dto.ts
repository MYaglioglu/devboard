import { z } from 'zod';

/**
 * Die Query-Parameter von GET /organizations/:orgId/activity.
 *
 * ============================================================================
 * QUERY-PARAMETER SIND IMMER ZEICHENKETTEN
 * ============================================================================
 * `?limit=20` kommt als `'20'` an, nicht als `20`. Deshalb steht hier
 * ueberall `z.coerce` bzw. eine ausdrueckliche Umwandlung - dieselbe Falle wie
 * bei `?includeArchived=true` im ProjectsController, wo `Boolean('false')`
 * ausgerechnet `true` ergeben haette.
 */
export const feedQuerySchema = z.object({
  /**
   * ==========================================================================
   * WARUM `limit` EINE OBERGRENZE HAT UND NICHT NUR EINE VOREINSTELLUNG
   * ==========================================================================
   * Ohne `.max()` waere `?limit=1000000` eine gueltige Anfrage - und damit ein
   * Weg, den Server mit einer einzigen Zeile Aufwand beliebig zu belasten.
   * Das ist kein theoretischer Angriff, sondern der haeufigste Weg, wie eine
   * Paginierung unter Last zusammenbricht: nicht durch viele Anfragen, sondern
   * durch eine sehr grosse.
   *
   * 100 ist grosszuegig genug, dass niemand sie in der Praxis braucht, und
   * klein genug, dass die Antwort in einem Netzwerkpaket-Bereich bleibt.
   *
   * `.catch()` gibt es hier ABSICHTLICH nicht - anders als bei
   * `?includeArchived`. Dort ist ein unsinniger Wert ein Filter, und die
   * sichere Voreinstellung ist harmlos. Hier bestimmt der Wert die MENGE der
   * Arbeit: `?limit=abc` still als 20 zu lesen, wuerde einen Programmierfehler
   * im Client verstecken, statt ihn zu melden.
   */
  limit: z.coerce.number().int().min(1).max(100).default(20),

  /**
   * Die Stelle, ab der weitergelesen wird. Fehlt sie, beginnt der Feed oben.
   *
   * Der Inhalt wird hier NICHT geprueft - das kann Zod nicht, weil das Format
   * eine Entscheidung von `cursor.ts` ist und sich dort aendern darf, ohne
   * dass jemand dieses Schema anfasst. Geprueft wird beim Dekodieren.
   */
  cursor: z.string().min(1).optional(),

  /**
   * Optionaler Filter auf ein Projekt.
   *
   * Als UUID validiert, damit "abc" nicht bis zur Datenbank durchgeht und dort
   * als Syntaxfehler zu einem 500er wird - dieselbe Ueberlegung wie beim
   * `projectId`-Pfadparameter.
   *
   * Wichtig, und im Service umgesetzt: Diese ID entscheidet NICHT ueber die
   * Sichtbarkeit. Sie ist ein Filter INNERHALB des Mandanten, der ohnehin in
   * der WHERE-Bedingung steht. Ein fremdes Projekt liefert deshalb kein
   * fremdes Ergebnis - es liefert 404.
   */
  projectId: z.uuid('Ungültige Projekt-ID').optional(),
});

export type FeedQueryDto = z.infer<typeof feedQuerySchema>;
