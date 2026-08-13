import { z } from 'zod';

import { TaskStatus } from '../../generated/prisma/enums';

/**
 * Eingabe fuer PATCH .../tasks/:taskId/move.
 *
 * ============================================================================
 * WARUM DER CLIENT NACHBARN SCHICKT UND KEINE POSITION
 * ============================================================================
 * Naheliegend waere `{ "position": "1500" }` - der Client rechnet, der Server
 * speichert. Das waere aus drei Gruenden falsch:
 *
 *   1. Der Client muesste die Rechenregel kennen. Damit waere sie Teil der
 *      Schnittstelle, und eine spaetere Aenderung (etwa auf String-basierte
 *      Raenge) braeche jeden Client.
 *   2. Er muesste in JavaScript rechnen - also in `float64`, das genau die
 *      Praezision nicht hat, wegen der die Spalte `numeric` ist.
 *   3. Zwei Clients koennten dieselbe Position berechnen und einander
 *      ueberschreiben, ohne dass der Server es bemerkt.
 *
 * Stattdessen sagt der Client, was er tatsaechlich WEISS, weil der Nutzer es
 * getan hat: "diese Karte liegt jetzt zwischen jener und jener". Die Rechnung
 * bleibt auf dem Server, wo auch die Daten liegen.
 *
 * `null` bedeutet Rand: kein Vorgaenger heisst ganz oben, kein Nachfolger
 * heisst ganz unten. Beide `null` heisst leere Spalte.
 */
export const moveTaskSchema = z.object({
  /**
   * Die Zielspalte - auch dann anzugeben, wenn sie sich nicht aendert.
   *
   * Ausdruecklich statt optional: Der Client weiss immer, in welche Spalte er
   * ablegt; das ist die Stelle, an der der Nutzer losgelassen hat. Waere das
   * Feld optional, muesste der Server "unveraendert" annehmen - und ein Client
   * mit einem Fehler im Zustand wuerde still in der alten Spalte landen,
   * statt eine klare Antwort zu bekommen.
   */
  status: z.enum(TaskStatus),

  /** Die Karte, die kuenftig DAVOR liegt. `null` = ganz oben. */
  previousId: z.uuid('Ungültige Aufgaben-ID').nullable().default(null),

  /** Die Karte, die kuenftig DANACH liegt. `null` = ganz unten. */
  nextId: z.uuid('Ungültige Aufgaben-ID').nullable().default(null),

  /**
   * ==========================================================================
   * DER STAND, DEN DER CLIENT GELESEN HAT - PFLICHTFELD
   * ==========================================================================
   * Das ist das optimistische Sperren. Der Server aendert die Karte nur, wenn
   * ihre Version noch die ist, die der Client gesehen hat. Sonst: 409.
   *
   * Warum Pflicht und nicht optional: Ein optionales Feld waere ein Angebot,
   * und wer es weglaesst, bekaeme das Verschieben OHNE Konfliktschutz. Damit
   * gaebe es zwei Verhalten am selben Endpoint - und benutzt wuerde das
   * bequemere. Ein Schutz, den man weglassen kann, ist keiner.
   *
   * `int().min(0)`, weil die Spalte bei 0 beginnt und nur hochzaehlt. Eine
   * negative oder gebrochene Version kann nur ein Fehler des Clients sein.
   */
  version: z.number().int('Die Version muss ganzzahlig sein').min(0),
});

export type MoveTaskDto = z.infer<typeof moveTaskSchema>;
