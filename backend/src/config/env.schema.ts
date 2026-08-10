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

  // Welche Herkunft (Origin) darf das Backend im Browser aufrufen?
  // Kommagetrennt, falls spaeter mehrere Umgebungen noetig sind.
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3001'),

  // Signiergeheimnis fuer JWTs. KEIN Default - ein voreingestelltes Geheimnis
  // waere kein Geheimnis: Jeder, der das Repository kennt, koennte sich damit
  // beliebige Token ausstellen.
  //
  // Mindestens 32 Zeichen, weil HS256 einen Schluessel mit mindestens so viel
  // Entropie erwartet wie die Ausgabe des Hashverfahrens (256 Bit). Ein kurzes
  // Geheimnis liesse sich durchprobieren.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET muss mindestens 32 Zeichen lang sein'),

  // Lebensdauer des Access-Tokens. Kurz halten: Ein JWT laesst sich nicht
  // widerrufen - er gilt bis er ablaeuft. Die kurze Laufzeit ist der einzige
  // Schutz, wenn er gestohlen wird. Der Komfort kommt spaeter vom
  // Refresh-Token (Scheibe 3).
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),

  // Kein Default: Ohne Datenbank-URL darf das Backend nicht starten.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL fehlt')
    .startsWith(
      'postgresql://',
      'DATABASE_URL muss mit postgresql:// beginnen',
    ),
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
