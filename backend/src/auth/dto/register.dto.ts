import { z } from 'zod';

/**
 * Eingabe fuer POST /auth/register.
 *
 * ============================================================================
 * PASSWORTREGELN - WARUM LAENGE STATT SONDERZEICHEN
 * ============================================================================
 * Die klassische Regel "mindestens ein Grossbuchstabe, eine Zahl, ein
 * Sonderzeichen" gilt heute als ueberholt. Das NIST empfiehlt seit 2017
 * (Sonderveroeffentlichung 800-63B) ausdruecklich das Gegenteil:
 *
 *   - LAENGE ist der wirksamste Faktor, nicht Zeichenvielfalt.
 *   - Erzwungene Sonderzeichen fuehren zu vorhersagbaren Mustern
 *     ("Passwort1!") und zu aufgeschriebenen Passwoertern.
 *   - Erzwungener regelmaessiger Wechsel verschlechtert die Qualitaet.
 *
 * Deshalb: mindestens 10 Zeichen, keine Zeichenklassen-Pflicht.
 *
 * ============================================================================
 * WARUM EINE OBERGRENZE?
 * ============================================================================
 * Nicht aus Bequemlichkeit, sondern gegen einen Denial-of-Service: argon2 ist
 * absichtlich rechenintensiv. Ohne Obergrenze koennte jemand Passwoerter mit
 * mehreren Megabyte schicken und den Server mit wenigen Anfragen lahmlegen.
 * 128 Zeichen sind fuer jede sinnvolle Passphrase mehr als genug.
 */
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    // Kleinschreiben ist NORMALISIERUNG, keine Kosmetik: Ohne sie waeren
    // "Max@example.com" und "max@example.com" zwei verschiedene Konten, obwohl
    // der Domain-Teil einer E-Mail-Adresse nicht zwischen Gross- und
    // Kleinschreibung unterscheidet. Der UNIQUE-Index in der Datenbank
    // vergleicht zeichengenau und wuerde beide durchlassen.
    .toLowerCase()
    .pipe(z.email('Bitte eine gueltige E-Mail-Adresse angeben'))
    .pipe(z.string().max(255, 'E-Mail-Adresse ist zu lang')),

  password: z
    .string()
    .min(10, 'Das Passwort muss mindestens 10 Zeichen lang sein')
    .max(128, 'Das Passwort darf hoechstens 128 Zeichen lang sein'),

  name: z.string().trim().min(1).max(100).optional(),
});

/**
 * Der TypeScript-Typ wird aus dem Schema ABGELEITET, nicht daneben gepflegt.
 * Aendert sich das Schema, aendert sich der Typ automatisch mit - Schema und
 * Typ koennen gar nicht auseinanderlaufen.
 */
export type RegisterDto = z.infer<typeof registerSchema>;
