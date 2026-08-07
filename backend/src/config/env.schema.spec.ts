import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('setzt Standardwerte, wenn nichts angegeben ist', () => {
    const env = validateEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('wandelt den PORT von String nach Number um', () => {
    const env = validateEnv({ PORT: '4000' });

    // Umgebungsvariablen sind immer Strings - ohne Coercion waere das "4000".
    expect(env.PORT).toBe(4000);
    expect(typeof env.PORT).toBe('number');
  });

  it('lehnt ein unbekanntes NODE_ENV ab', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('lehnt einen nicht-numerischen PORT ab', () => {
    expect(() => validateEnv({ PORT: 'dreitausend' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('lehnt einen negativen PORT ab', () => {
    expect(() => validateEnv({ PORT: '-1' })).toThrow(
      /Ungueltige Umgebungskonfiguration/,
    );
  });

  it('nennt in der Fehlermeldung die betroffene Variable', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
