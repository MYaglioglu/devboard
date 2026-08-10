import { validateEnv } from './env.schema';

/** Minimal gueltige Konfiguration - Basis fuer alle Tests. */
const gueltig = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  JWT_SECRET: 'ein-geheimnis-mit-mindestens-32-zeichen-laenge',
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
