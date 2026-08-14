import { dekodiereCursor, kodiereCursor } from './cursor';
import { keysetBedingung } from './activity-feed.service';

/**
 * Reine Funktionen, also keine Datenbank und kein NestJS. Geprueft wird vor
 * allem, was mit UNSINN passiert - denn der Cursor ist der einzige Wert in
 * diesem Endpoint, der unveraendert aus dem Browser zurueckkommt.
 */
describe('Cursor', () => {
  const ID = 'b3f1c2d4-0000-4000-8000-000000000011';
  const ZEIT = new Date('2026-08-14T10:03:22.150Z');

  it('liest zurueck, was es geschrieben hat', () => {
    const stelle = dekodiereCursor(kodiereCursor({ createdAt: ZEIT, id: ID }));

    expect(stelle?.id).toBe(ID);
    // `getTime()` und nicht `toEqual` auf dem Date: Der Vergleich soll den
    // ZEITWERT pruefen, nicht die Objektidentitaet. Wichtiger noch - er
    // belegt, dass die Millisekunden die Kodierung ueberleben. Genau die
    // braucht der Keyset-Vergleich; eine auf Sekunden gerundete Fahrt durch
    // ISO-8601 waere hier still und wuerde erst als doppelter Eintrag an einer
    // Seitengrenze auffallen.
    expect(stelle?.createdAt.getTime()).toBe(ZEIT.getTime());
  });

  /**
   * Der Grund fuer `base64url` statt `base64`.
   *
   * Normales Base64 verwendet `+` und `/`. In einem Query-Parameter bedeutet
   * `+` ein LEERZEICHEN - der Cursor kaeme je nach Client beschaedigt an. Der
   * Fehler traete nur bei bestimmten Zufallswerten auf, und ein Fehler, der
   * manchmal auftritt, ist teurer als einer, der immer auftritt.
   */
  it('erzeugt nur Zeichen, die in einer URL unveraendert bleiben', () => {
    for (let i = 0; i < 50; i += 1) {
      const kodiert = kodiereCursor({
        createdAt: new Date(Date.UTC(2026, 7, 14, 10, 3, 22, i)),
        id: `b3f1c2d4-0000-4000-8000-0000000000${i.toString().padStart(2, '0')}`,
      });

      expect(kodiert).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(kodiert)).toBe(kodiert);
    }
  });

  describe('weist unbrauchbare Werte ab', () => {
    /**
     * `new Date('unsinn')` wirft NICHT, sondern liefert ein Date mit dem
     * Zeitwert NaN. Ohne die ausdrueckliche Pruefung ginge der Unsinn bis in
     * die WHERE-Bedingung durch, und aus einer schlicht falschen Eingabe
     * wuerde ein 500er statt eines 400ers.
     */
    it('einen Zeitstempel, der keiner ist', () => {
      const kaputt = Buffer.from(`kein-datum|${ID}`).toString('base64url');

      expect(dekodiereCursor(kaputt)).toBeNull();
    });

    it('einen Wert ohne Trennzeichen', () => {
      expect(
        dekodiereCursor(Buffer.from('nur-eins').toString('base64url')),
      ).toBeNull();
    });

    it('eine leere ID', () => {
      const kaputt = Buffer.from(`${ZEIT.toISOString()}|`).toString(
        'base64url',
      );

      expect(dekodiereCursor(kaputt)).toBeNull();
    });

    it('reinen Unsinn', () => {
      expect(dekodiereCursor('###')).toBeNull();
    });
  });

  /**
   * ==========================================================================
   * WAS EIN MANIPULIERTER CURSOR NICHT KANN
   * ==========================================================================
   * Base64 ist keine Verschluesselung - jeder kann den Inhalt aendern. Dieser
   * Test haelt fest, warum das unbedenklich ist: Im Cursor steht KEIN Mandant.
   * Er sagt, WO weitergelesen wird, nicht WORIN.
   *
   * Waere die Organisation darin enthalten, waere er eine Sicherheitsgrenze -
   * und ein Wert aus dem Browser darf nie darueber entscheiden, wessen Daten
   * man sieht. Deshalb braucht er auch keine Signatur.
   */
  it('traegt keinen Mandanten', () => {
    const kodiert = kodiereCursor({ createdAt: ZEIT, id: ID });
    const klartext = Buffer.from(kodiert, 'base64url').toString('utf8');

    expect(klartext).toBe(`${ZEIT.toISOString()}|${ID}`);
    expect(klartext).not.toContain('organization');
  });
});

describe('keysetBedingung', () => {
  const ID = 'b3f1c2d4-0000-4000-8000-000000000011';
  const ZEIT = new Date('2026-08-14T10:03:22.150Z');

  /**
   * Der zweite Zweig ist der, den man weglaesst, wenn man es eilig hat - und
   * genau er behandelt die Eintraege mit demselben Zeitstempel. Ohne ihn
   * wuerden an einer Seitengrenze genau die Eintraege uebersprungen, die
   * gemeinsam in EINER Transaktion entstanden sind. Der Fehler traete also
   * bevorzugt dort auf, wo mehrere Dinge auf einmal passiert sind.
   */
  it('behandelt den Gleichstand im Zeitstempel ueber die ID', () => {
    const [aelter, gleichzeitig] = keysetBedingung({
      createdAt: ZEIT,
      id: ID,
    });

    expect(aelter).toEqual({ createdAt: { lt: ZEIT } });
    expect(gleichzeitig).toEqual({ createdAt: ZEIT, id: { lt: ID } });
  });

  /**
   * `lt` und nicht `lte`: Der Cursor zeigt auf den LETZTEN gelieferten
   * Eintrag. Der gehoert zur vorigen Seite und darf nicht noch einmal kommen.
   * Mit `lte` saehe der Nutzer an jeder Seitengrenze einen Eintrag doppelt -
   * und das faellt in einem Feed kaum auf, weil dort ohnehin aehnliche
   * Eintraege untereinanderstehen.
   */
  it('schliesst den Eintrag aus, auf den der Cursor zeigt', () => {
    const bedingung = keysetBedingung({ createdAt: ZEIT, id: ID });
    const alsText = JSON.stringify(bedingung);

    expect(alsText).not.toContain('lte');
    expect(alsText).toContain('lt');
  });
});
