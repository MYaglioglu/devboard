import { z } from 'zod';

/**
 * Eingabe fuer POST /auth/login.
 *
 * ============================================================================
 * WARUM HIER ANDERE REGELN ALS BEI DER REGISTRIERUNG?
 * ============================================================================
 * Bei der Registrierung pruefen wir Mindestlaenge und Format streng - dort
 * legen wir fest, was ein gueltiges Passwort ist.
 *
 * Beim Login waere dieselbe Pruefung ein Fehler: Sie wuerde einem Angreifer
 * verraten, welche Passwoerter ueberhaupt in Frage kommen, und Nutzern mit
 * aelteren Passwoertern (aus einer Zeit mit anderen Regeln) den Zugang
 * versperren. Hier wird nur geprueft, dass ueberhaupt etwas da ist.
 *
 * Die Obergrenze bleibt - aus demselben Denial-of-Service-Grund wie bei der
 * Registrierung: argon2 ist absichtlich rechenintensiv.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    // Gleiche Normalisierung wie bei der Registrierung. Ohne sie koennte sich
    // jemand mit "Max@example.com" nicht anmelden, obwohl er sich so
    // registriert hat - gespeichert ist die Adresse kleingeschrieben.
    .toLowerCase()
    .min(1, 'Bitte eine E-Mail-Adresse angeben')
    .max(255),

  password: z.string().min(1, 'Bitte ein Passwort angeben').max(128),
});

export type LoginDto = z.infer<typeof loginSchema>;
