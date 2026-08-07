import { z } from 'zod';

/**
 * Schema aller Umgebungsvariablen, die das Backend braucht.
 *
 * Wird beim Start ausgewertet. Fehlt eine Variable oder enthaelt sie einen
 * unbrauchbaren Wert, bricht die Anwendung sofort ab (fail fast) - statt
 * spaeter an unerwarteter Stelle mit `undefined` umzufallen.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Umgebungsvariablen sind immer Strings. `coerce` wandelt "3000" in 3000 um.
  PORT: z.coerce.number().int().positive().default(3000),
});

/** Typ der validierten Konfiguration - aus dem Schema abgeleitet, nicht doppelt gepflegt. */
export type Env = z.infer<typeof envSchema>;

/**
 * Validierungsfunktion fuer das ConfigModule.
 * Wirft mit einer lesbaren Meldung, wenn die Konfiguration unbrauchbar ist.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');

    throw new Error(`Ungueltige Umgebungskonfiguration:\n${details}`);
  }

  return result.data;
}
