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

  // Lebensdauer des Refresh-Tokens in Tagen. Deutlich laenger als der
  // Access-Token, weil er der Bequemlichkeit dient ("nicht staendig neu
  // anmelden") - dafuer ist er widerrufbar, weil er serverseitig gespeichert
  // wird.
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Rate Limiting, getrennt fuer normale und fuer Anmelde-Endpoints.
  //
  // Warum konfigurierbar statt fest im Code: In Tests muessen die Grenzen
  // hochgesetzt werden koennen, sonst wuerden sich die eigenen Testlaeufe
  // gegenseitig aussperren. Und in Produktion kann man nachjustieren, ohne
  // neu zu bauen.
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  // 0 schaltet das Rate Limiting vollstaendig ab. Gedacht fuer Testlaeufe, die
  // sich sonst selbst aussperren wuerden - in Produktion niemals 0.
  THROTTLE_LIMIT: z.coerce.number().int().nonnegative().default(100),

  // ==========================================================================
  // SCHLUESSEL FUER DIE WEBHOOK-GEHEIMNISSE (ADR-014)
  // ==========================================================================
  // KEIN Default, aus demselben Grund wie bei JWT_SECRET: Ein voreingestellter
  // Schluessel waere kein Schluessel.
  //
  // Genau 64 Hex-Zeichen, weil AES-256 einen Schluessel von genau 32 Byte
  // verlangt. Das ist kein Richtwert wie die 32 Zeichen bei JWT_SECRET,
  // sondern eine harte Vorgabe des Verfahrens: Node wirft bei einer anderen
  // Laenge `Invalid key length`. Ein zu kurzer Schluessel ist hier also nicht
  // "etwas schwaecher", sondern gar nicht lauffaehig - und dieser Fehler soll
  // beim START auftreten, nicht beim ersten Verbinden eines Repositories.
  //
  // Hex und nicht Base64: Bei Hex ist die Laenge in Zeichen ein direktes
  // Vielfaches der Laenge in Byte, eine falsche Eingabe faellt also sofort
  // auf. Base64 haette Polsterzeichen und mehrere gueltige Schreibweisen.
  //
  // Erzeugen mit:  openssl rand -hex 32
  WEBHOOK_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'WEBHOOK_ENCRYPTION_KEY muss genau 64 Hex-Zeichen lang sein (32 Byte) - erzeugen mit: openssl rand -hex 32',
    ),

  // Unter welcher Adresse ist DAS BACKEND von aussen erreichbar.
  //
  // Wird gebraucht, um dem Nutzer die Webhook-URL zu nennen, die er in GitHub
  // eintraegt. Bewusst konfigurierbar und nicht aus dem Request abgeleitet:
  // Der `Host`-Kopf kommt vom Client und ist faelschbar. Wer eine URL aus
  // ihm zusammenbaut, laesst sich die eigene Adresse vom Anfragenden
  // diktieren - dieselbe Sorte Fehler wie ein Passwort-Zuruecksetzen-Link,
  // der auf einen fremden Host zeigt.
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),

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
