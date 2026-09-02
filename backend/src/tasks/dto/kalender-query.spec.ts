import { KALENDER_MAX_TAGE, kalenderQuerySchema } from './kalender-query.dto';

/**
 * Die Zeitraum-Pruefung ohne Datenbank und ohne NestJS.
 *
 * Das ist dieselbe Aufteilung wie bei positionen.ts und board-logik.ts: Was
 * reine Rechnung ist, wird als reine Rechnung geprueft. Ein E2E-Test koennte
 * dasselbe belegen, braeuchte dafuer aber Anmeldung, Organisation und Projekt -
 * und wuerde bei einem Fehler nicht sagen, WELCHE Regel gebrochen wurde.
 */
describe('kalenderQuerySchema', () => {
  const parse = (von: string, bis: string) =>
    kalenderQuerySchema.safeParse({ von, bis });

  const fehlerZu = (feld: string, ergebnis: ReturnType<typeof parse>) =>
    ergebnis.success
      ? []
      : ergebnis.error.issues
          .filter((problem) => problem.path.join('.') === feld)
          .map((problem) => problem.message);

  it('nimmt ein reines Datum an und liest es als Mitternacht UTC', () => {
    const ergebnis = parse('2026-09-01', '2026-10-01');

    expect(ergebnis.success).toBe(true);
    if (!ergebnis.success) return;

    expect(ergebnis.data.von.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(ergebnis.data.bis.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('nimmt einen vollen Zeitstempel an - so fragt ein Client mit Zeitzone', () => {
    // Der Berliner September beginnt am 31.08. um 22:00 UTC. Genau so schickt
    // das Frontend den Zeitraum: Es rechnet die Zone selbst um, weil nur es
    // sie kennt.
    const ergebnis = parse(
      '2026-08-31T22:00:00.000Z',
      '2026-09-30T22:00:00.000Z',
    );

    expect(ergebnis.success).toBe(true);
  });

  it('verlangt beide Parameter', () => {
    const ohneBis = kalenderQuerySchema.safeParse({ von: '2026-09-01' });

    // Kein Vorgabewert: Wer `bis` vergisst, bekommt einen Fehler und nicht
    // stillschweigend den aktuellen Monat. Begruendung im DTO.
    expect(ohneBis.success).toBe(false);
  });

  it('weist ein Ende zurueck, das vor dem Anfang liegt', () => {
    const ergebnis = parse('2026-10-01', '2026-09-01');

    expect(ergebnis.success).toBe(false);
    expect(fehlerZu('bis', ergebnis)).toContain(
      'Das Ende muss nach dem Anfang liegen',
    );
  });

  it('weist einen leeren Zeitraum zurueck - von und bis identisch', () => {
    // Der Grenzfall zur vorigen Pruefung. `von < bis` ist echt kleiner, nicht
    // kleiner-gleich: Ein Zeitraum der Breite null kann nichts enthalten
    // (das Ende ist offen) und ist damit immer ein Client-Fehler.
    const ergebnis = parse('2026-09-01', '2026-09-01');

    expect(ergebnis.success).toBe(false);
  });

  it('erlaubt genau die groesste zulaessige Breite', () => {
    const von = new Date('2026-09-01T00:00:00.000Z');
    const bis = new Date(von.getTime() + KALENDER_MAX_TAGE * 86_400_000);

    // Die Grenze SELBST wird geprueft, nicht ein Wert in ihrer Naehe. Genau
    // hier lagen in Sprint 3 und 4 die teuersten Fehler: Ein Test, der 30 Tage
    // schickt, sagt ueber die Grenze bei 92 nichts aus.
    const ergebnis = parse(von.toISOString(), bis.toISOString());

    expect(ergebnis.success).toBe(true);
  });

  it('weist eine Millisekunde ueber der Grenze zurueck', () => {
    const von = new Date('2026-09-01T00:00:00.000Z');
    const bis = new Date(von.getTime() + KALENDER_MAX_TAGE * 86_400_000 + 1);

    const ergebnis = parse(von.toISOString(), bis.toISOString());

    expect(ergebnis.success).toBe(false);
    expect(fehlerZu('bis', ergebnis)).toContain(
      `Der Zeitraum darf höchstens ${KALENDER_MAX_TAGE} Tage umfassen`,
    );
  });

  it('weist unsinnige Datumsangaben zurueck, statt sie bis zur Datenbank zu lassen', () => {
    // Ohne diese Pruefung ginge `Invalid Date` in die Prisma-Abfrage und
    // wuerde dort zu einem 500er - ein Client-Fehler, der wie ein Serverfehler
    // aussieht. Dieselbe Ueberlegung wie bei der UUID-Pruefung der Pfad-IDs.
    const ergebnis = parse('gestern', '2026-10-01');

    expect(ergebnis.success).toBe(false);
  });
});
