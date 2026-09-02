import { z } from 'zod';

/**
 * Der laengste Zeitraum, den eine einzelne Kalenderabfrage umfassen darf.
 *
 * ============================================================================
 * WARUM DIE OBERGRENZE HIER STEHT UND NICHT IM SERVICE
 * ============================================================================
 * Sie ist kein fachliches Detail der Abfrage, sondern eine Aussage ueber die
 * Schnittstelle: "So viel darfst du auf einmal verlangen." Genau dieselbe
 * Rolle wie `limit.max(100)` beim Feed - dort begrenzt die Anzahl der Zeilen
 * die Arbeit, hier tut es die Breite des Fensters.
 *
 * Warum 92 und nicht 31: Die Monatsansicht des Kalenders zeigt Vor- und
 * Nachlauftage, sie fragt also mehr als einen Monat. Und ein Nutzer, der
 * schnell durch die Monate blaettert, soll nicht bei jedem Klick warten -
 * ein Quartal am Stueck erlaubt dem Frontend, den Nachbarmonat mitzuladen.
 *
 * Warum ueberhaupt eine Grenze: Ohne sie waere `?von=0001-01-01&bis=9999-12-31`
 * eine gueltige Anfrage - ein Weg, mit einer einzigen Zeile Aufwand die
 * gesamte Aufgabentabelle des Mandanten zu lesen. Dieselbe Ueberlegung wie
 * beim Feed, nur ist die Falle hier weniger offensichtlich, weil ein Datum
 * harmlos aussieht.
 */
export const KALENDER_MAX_TAGE = 92;

const TAG_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Die Query-Parameter von GET /organizations/:orgId/calendar.
 *
 * ============================================================================
 * WARUM BEIDE PARAMETER PFLICHT SIND
 * ============================================================================
 * Naheliegend waere ein Vorgabewert: kein Zeitraum angegeben ⇒ aktueller
 * Monat. Bequem - und genau deshalb falsch. Ein Vorgabewert macht die TEUERSTE
 * Variante zur einfachsten: Wer den Parameter vergisst, bekommt trotzdem eine
 * Antwort und merkt seinen Fehler nie. Bei `limit` im Feed ist ein Vorgabewert
 * richtig, weil er die Arbeit BEGRENZT; hier wuerde er sie erst erzeugen.
 *
 * Der Kalender weiss immer, welchen Monat er zeigt. Ihn danach zu fragen
 * kostet nichts.
 *
 * ============================================================================
 * `von` GEHOERT DAZU, `bis` NICHT - WARUM DAS ENDE OFFEN IST
 * ============================================================================
 * Der Zeitraum ist halboffen: `von <= dueDate < bis`.
 *
 * Bei einem geschlossenen Ende (`<=`) muesste der September als
 * `von=01.09. 00:00` bis `bis=30.09. 23:59:59.999` angefragt werden - und
 * eine Aufgabe, die auf 30.09. 23:59:59.9995 faellt, fiele durch das Raster.
 * Schlimmer: Fragt der Client stattdessen bis `01.10. 00:00`, taucht eine
 * Aufgabe um Mitternacht in ZWEI Monaten auf.
 *
 * Mit einem offenen Ende stossen zwei aufeinanderfolgende Monate exakt
 * aneinander, ohne Ueberlappung und ohne Luecke. Das ist derselbe Grund,
 * aus dem `slice(0, 3)` in fast jeder Sprache das dritte Element auslaesst.
 */
export const kalenderQuerySchema = z
  .object({
    /**
     * `z.coerce.date()` nimmt sowohl `2026-09-01` als auch
     * `2026-09-01T00:00:00.000Z` an - Query-Parameter sind immer
     * Zeichenketten, und die Umwandlung gehoert an den Rand.
     *
     * Was dabei zu wissen ist und in K.6 eine ADR bekommt: `new Date(...)`
     * liest ein reines Datum als MITTERNACHT UTC. Der Client muss den
     * Zeitraum deshalb in UTC angeben, den er in seiner eigenen Zone meint -
     * ein Berliner September beginnt am 31.08. um 22:00 UTC. Der Server
     * rechnet keine Zeitzonen um; er kennt die des Betrachters gar nicht.
     */
    von: z.coerce.date({ error: 'Ungültiges Startdatum' }),
    bis: z.coerce.date({ error: 'Ungültiges Enddatum' }),
  })
  /**
   * Zwei Pruefungen, die ein Feld allein nicht leisten kann - sie betreffen
   * das VERHAELTNIS der beiden Werte. Deshalb `.refine()` auf dem Objekt und
   * nicht auf dem einzelnen Feld.
   *
   * `path` zeigt jeweils auf `bis`: Die Meldung soll an dem Feld erscheinen,
   * das der Nutzer aendern muss.
   */
  .refine((werte) => werte.von < werte.bis, {
    error: 'Das Ende muss nach dem Anfang liegen',
    path: ['bis'],
  })
  .refine(
    (werte) =>
      werte.bis.getTime() - werte.von.getTime() <=
      KALENDER_MAX_TAGE * TAG_IN_MS,
    {
      error: `Der Zeitraum darf höchstens ${KALENDER_MAX_TAGE} Tage umfassen`,
      path: ['bis'],
    },
  );

export type KalenderQueryDto = z.infer<typeof kalenderQuerySchema>;
