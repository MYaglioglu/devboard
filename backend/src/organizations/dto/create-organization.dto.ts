import { z } from 'zod';

/**
 * Eingabe fuer POST /organizations.
 *
 * ============================================================================
 * WARUM `trim()` VOR DER LAENGENPRUEFUNG STEHT
 * ============================================================================
 * Die Reihenfolge in einer Zod-Kette ist keine Kosmetik. Stuende `min(2)`
 * zuerst, kaeme der Name "  " (zwei Leerzeichen) durch die Pruefung und wuerde
 * ERST DANACH zu einer leeren Zeichenkette getrimmt - eine Organisation ohne
 * Namen in der Datenbank.
 *
 * Merksatz: erst normalisieren, dann validieren. Sonst validiert man etwas
 * anderes, als man speichert.
 *
 * ============================================================================
 * WARUM EINE OBERGRENZE
 * ============================================================================
 * Ohne sie akzeptiert die Spalte `text` in PostgreSQL Namen von einem Gigabyte.
 * Das ist kein theoretisches Problem: Speicherplatz, Antwortgroesse und jede
 * Darstellung im Frontend haengen daran. 100 Zeichen sind fuer jeden echten
 * Firmennamen mehr als genug.
 *
 * ============================================================================
 * WAS HIER BEWUSST NICHT GEPRUEFT WIRD
 * ============================================================================
 * Die Eindeutigkeit des Namens. Zwei Kunden duerfen beide eine Organisation
 * "Marketing" haben - sie sehen sich ohnehin nie. Ein globaler UNIQUE-Index
 * waere hier sogar schaedlich: Er wuerde verraten, dass es den Namen schon
 * gibt, und damit Rueckschluesse auf fremde Mandanten erlauben.
 */
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
    .max(100, 'Der Name darf hoechstens 100 Zeichen lang sein'),
});

/**
 * Der Typ wird aus dem Schema ABGELEITET, nicht daneben gepflegt - Schema und
 * Typ koennen so gar nicht auseinanderlaufen.
 */
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
