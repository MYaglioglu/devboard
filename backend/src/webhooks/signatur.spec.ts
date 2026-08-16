import { erzeugeSignatur, pruefeSignatur } from './signatur';

describe('signatur', () => {
  const geheimnis = 'ein-webhook-geheimnis';
  const rumpf = Buffer.from(
    JSON.stringify({ zen: 'Design for failure.', hook_id: 42 }),
    'utf8',
  );

  it('nimmt eine gueltige Signatur an', () => {
    expect(
      pruefeSignatur(rumpf, erzeugeSignatur(rumpf, geheimnis), geheimnis),
    ).toBe(true);
  });

  /**
   * ==========================================================================
   * DER TEST, DER DIE FALLE DIESER SCHEIBE FESTHAELT
   * ==========================================================================
   * Ein HMAC ist eine Aussage ueber BYTES, nicht ueber Bedeutung. Beide
   * Rumpfvarianten hier ergeben dasselbe geparste Objekt - und trotzdem
   * verschiedene Signaturen.
   *
   * Genau deshalb muss der ROHE Rumpf bis zur Pruefung durchgereicht werden.
   * Wer ueber `JSON.stringify(body)` nachrechnet, bekommt zufaellig mal das
   * eine und mal das andere.
   */
  it('unterscheidet Rumpfvarianten, die dasselbe Objekt ergeben', () => {
    const kompakt = Buffer.from('{"a":1,"b":2}', 'utf8');
    const mitLeerzeichen = Buffer.from('{ "a": 1, "b": 2 }', 'utf8');
    const andereReihenfolge = Buffer.from('{"b":2,"a":1}', 'utf8');

    const signatur = erzeugeSignatur(kompakt, geheimnis);

    expect(pruefeSignatur(kompakt, signatur, geheimnis)).toBe(true);
    expect(pruefeSignatur(mitLeerzeichen, signatur, geheimnis)).toBe(false);
    expect(pruefeSignatur(andereReihenfolge, signatur, geheimnis)).toBe(false);
  });

  it('weist einen um ein Byte veraenderten Rumpf ab', () => {
    const signatur = erzeugeSignatur(rumpf, geheimnis);
    const veraendert = Buffer.from(rumpf);
    veraendert[0] ^= 0x01;

    expect(pruefeSignatur(veraendert, signatur, geheimnis)).toBe(false);
  });

  it('weist ein fremdes Geheimnis ab', () => {
    const signatur = erzeugeSignatur(rumpf, 'ein-anderes-geheimnis');

    expect(pruefeSignatur(rumpf, signatur, geheimnis)).toBe(false);
  });

  it.each([
    ['fehlender Kopf', undefined],
    ['leerer Kopf', ''],
    ['ohne Praefix', 'a'.repeat(64)],
    ['falsches Verfahren', `sha1=${'a'.repeat(40)}`],
    ['nur der Praefix', 'sha256='],
    ['kein Hex', `sha256=${'z'.repeat(64)}`],
    ['zu kurz', `sha256=${'a'.repeat(62)}`],
    ['zu lang', `sha256=${'a'.repeat(66)}`],
  ])('weist %s ab', (_fall, kopf) => {
    expect(pruefeSignatur(rumpf, kopf, geheimnis)).toBe(false);
  });

  /**
   * `sha256=` mit 64 gueltigen Hex-Zeichen, die nur eben falsch sind. Das ist
   * der Fall, der die LAENGENPRUEFUNG von den inhaltlichen Pruefungen trennt -
   * ohne ihn koennte die Funktion alles allein an der Laenge entscheiden und
   * saehe trotzdem richtig aus.
   */
  it('weist eine formal gueltige, inhaltlich falsche Signatur ab', () => {
    expect(pruefeSignatur(rumpf, `sha256=${'0'.repeat(64)}`, geheimnis)).toBe(
      false,
    );
  });

  it('ist gegenueber einem leeren Rumpf nicht blind', () => {
    const leer = Buffer.alloc(0);

    expect(
      pruefeSignatur(leer, erzeugeSignatur(leer, geheimnis), geheimnis),
    ).toBe(true);
    expect(
      pruefeSignatur(rumpf, erzeugeSignatur(leer, geheimnis), geheimnis),
    ).toBe(false);
  });
});
