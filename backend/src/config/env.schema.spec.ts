import { validateEnv } from './env.schema';

/** Minimal gueltige Konfiguration - Basis fuer alle Tests. */
const gueltig = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  JWT_SECRET: 'ein-geheimnis-mit-mindestens-32-zeichen-laenge',
  WEBHOOK_ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('validateEnv', () => {
  it('setzt Standardwerte, wenn nur Pflichtwerte angegeben sind', () => {
    const env = validateEnv(gueltig);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('setzt CORS_ORIGIN auf die lokale Frontend-URL', () => {
    expect(validateEnv(gueltig).CORS_ORIGIN).toBe('http://localhost:3001');
  });

  it('uebernimmt eine abweichende CORS_ORIGIN', () => {
    const env = validateEnv({
      ...gueltig,
      CORS_ORIGIN: 'https://devboard.example,https://staging.devboard.example',
    });

    expect(env.CORS_ORIGIN.split(',')).toHaveLength(2);
  });

  it('lehnt eine fehlende DATABASE_URL ab', () => {
    expect(() => validateEnv({ JWT_SECRET: gueltig.JWT_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('lehnt ein fehlendes JWT_SECRET ab', () => {
    // Kein Default: Ein voreingestelltes Signiergeheimnis waere kein
    // Geheimnis - jeder, der das Repository kennt, koennte sich damit
    // beliebige Token ausstellen.
    expect(() => validateEnv({ DATABASE_URL: gueltig.DATABASE_URL })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('lehnt ein zu kurzes JWT_SECRET ab', () => {
    expect(() => validateEnv({ ...gueltig, JWT_SECRET: 'zu-kurz' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('setzt die Lebensdauer des Access-Tokens auf 15 Minuten', () => {
    expect(validateEnv(gueltig).JWT_ACCESS_TTL).toBe('15m');
  });

  it('lehnt einen fehlenden WEBHOOK_ENCRYPTION_KEY ab', () => {
    // Explizit gebaut statt per Destructuring weggelassen - wie bei den
    // Tests zu DATABASE_URL und JWT_SECRET darueber.
    expect(() =>
      validateEnv({
        DATABASE_URL: gueltig.DATABASE_URL,
        JWT_SECRET: gueltig.JWT_SECRET,
      }),
    ).toThrow(/WEBHOOK_ENCRYPTION_KEY/);
  });

  /**
   * Anders als bei JWT_SECRET ist die Laenge hier keine Empfehlung, sondern
   * eine harte Vorgabe von AES-256: Node wirft bei allem ausser 32 Byte
   * `Invalid key length`. Dieser Fehler soll beim START auftreten und nicht
   * beim ersten Verbinden eines Repositories - genau dafuer ist das Schema da.
   */
  it.each([
    ['zu kurz', 'a'.repeat(63)],
    ['zu lang', 'a'.repeat(65)],
    ['kein Hex', 'z'.repeat(64)],
    ['leer', ''],
  ])('lehnt einen WEBHOOK_ENCRYPTION_KEY ab, der %s ist', (_fall, wert) => {
    expect(() =>
      validateEnv({ ...gueltig, WEBHOOK_ENCRYPTION_KEY: wert }),
    ).toThrow(/WEBHOOK_ENCRYPTION_KEY/);
  });

  it('setzt PUBLIC_BASE_URL auf die lokale Backend-URL', () => {
    expect(validateEnv(gueltig).PUBLIC_BASE_URL).toBe('http://localhost:3000');
  });

  it('lehnt eine PUBLIC_BASE_URL ab, die keine URL ist', () => {
    expect(() =>
      validateEnv({ ...gueltig, PUBLIC_BASE_URL: 'kein-url-wert' }),
    ).toThrow(/PUBLIC_BASE_URL/);
  });

  it('erlaubt THROTTLE_LIMIT=0 zum Abschalten des Rate Limitings', () => {
    // 0 ist ausdruecklich gueltig (nonnegative statt positive): Testlaeufe
    // muessen das Limit abschalten koennen, sonst sperren sie sich selbst aus.
    expect(
      validateEnv({ ...gueltig, THROTTLE_LIMIT: '0' }).THROTTLE_LIMIT,
    ).toBe(0);
  });

  it('lehnt ein negatives THROTTLE_LIMIT ab', () => {
    expect(() => validateEnv({ ...gueltig, THROTTLE_LIMIT: '-5' })).toThrow(
      /THROTTLE_LIMIT/,
    );
  });

  it('lehnt eine DATABASE_URL mit falschem Protokoll ab', () => {
    expect(() =>
      validateEnv({ ...gueltig, DATABASE_URL: 'mysql://localhost:3306/db' }),
    ).toThrow(/postgresql/);
  });

  it('wandelt den PORT von String nach Number um', () => {
    const env = validateEnv({ ...gueltig, PORT: '4000' });

    // Umgebungsvariablen sind immer Strings - ohne Coercion waere das "4000".
    expect(env.PORT).toBe(4000);
    expect(typeof env.PORT).toBe('number');
  });

  it('lehnt ein unbekanntes NODE_ENV ab', () => {
    expect(() => validateEnv({ ...gueltig, NODE_ENV: 'staging' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('lehnt einen nicht-numerischen PORT ab', () => {
    expect(() => validateEnv({ ...gueltig, PORT: 'dreitausend' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('lehnt einen negativen PORT ab', () => {
    expect(() => validateEnv({ ...gueltig, PORT: '-1' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('nennt in der Fehlermeldung die betroffene Variable', () => {
    expect(() => validateEnv({ ...gueltig, PORT: 'abc' })).toThrow(/PORT/);
  });
});
