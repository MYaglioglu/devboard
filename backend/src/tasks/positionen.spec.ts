import {
  Genau,
  MAX_NACHKOMMASTELLEN,
  POSITIONS_ABSTAND,
  berechnePosition,
  brauchtNeuverteilung,
  neueVerteilung,
} from './positionen';

/**
 * Die Sortierlogik mit ihren Grenzfaellen - Definition of Done von Sprint 3.
 *
 * Diese Datei braucht weder Datenbank noch Testmodul: Es ist reine Rechnung.
 * Das ist der Gewinn daraus, sie aus dem Service herausgezogen zu haben - der
 * teuerste Teil der Fachlichkeit ist zugleich der am billigsten pruefbare.
 */
describe('Sortierpositionen', () => {
  describe('berechnePosition', () => {
    it('gibt bei leerer Spalte den Ausgangsabstand', () => {
      expect(berechnePosition(null, null).toString()).toBe('1000');
    });

    it('haengt unten mit Abstand an', () => {
      expect(berechnePosition(new Genau('3000'), null).toString()).toBe('4000');
    });

    it('setzt oben mit Abstand davor', () => {
      expect(berechnePosition(null, new Genau('1000')).toString()).toBe('0');
    });

    /**
     * Negative Positionen sind Absicht, kein Fehler: `numeric` kennt kein
     * Vorzeichenproblem, und die Reihenfolge ergibt sich allein aus dem
     * Vergleich. Eine Regel "nicht unter 0" waere erfunden und wuerde
     * Neuverteilungen erzwingen, die nicht noetig sind.
     */
    it('erlaubt negative Positionen am oberen Rand', () => {
      expect(berechnePosition(null, new Genau('0')).toString()).toBe('-1000');
    });

    it('bildet dazwischen den Mittelwert', () => {
      expect(
        berechnePosition(new Genau('1000'), new Genau('2000')).toString(),
      ).toBe('1500');
    });

    it('rechnet auch bei ungeraden Abstaenden exakt', () => {
      expect(berechnePosition(new Genau('1'), new Genau('2')).toString()).toBe(
        '1.5',
      );
    });

    /**
     * ========================================================================
     * DER TEST, DER DIE PRAEZISION BEWACHT
     * ========================================================================
     * Mit `float8` waere dieses Ergebnis 1000 - die Bits reichen nicht, um
     * 30 Nachkommastellen zu halten. Mit der voreingestellten Genauigkeit von
     * decimal.js (20 Stellen) uebrigens auch. Nur der eigene Decimal-Typ mit
     * `precision: 80` rechnet hier richtig.
     */
    it('verliert auch bei 30 Nachkommastellen nichts', () => {
      const winzig = new Genau('0.000000000000000000000000000001');

      expect(berechnePosition(winzig, null).toString()).toBe(
        '1000.000000000000000000000000000001',
      );
    });

    /**
     * Halbieren in Basis 10 bricht nie ab und bringt je Schritt HOECHSTENS
     * eine Nachkommastelle dazu. Nach 40 Halbierungen an derselben Stelle
     * muessen also rund 40 Stellen dastehen - und die Position liegt immer
     * noch echt zwischen den beiden Nachbarn.
     */
    it('bleibt auch nach 40 Halbierungen echt zwischen den Nachbarn', () => {
      const untergrenze = new Genau('1000');
      let obergrenze = new Genau('2000');

      for (let i = 0; i < 40; i++) {
        const mitte = berechnePosition(untergrenze, obergrenze);

        expect(mitte.greaterThan(untergrenze)).toBe(true);
        expect(mitte.lessThan(obergrenze)).toBe(true);

        obergrenze = mitte;
      }

      expect(obergrenze.decimalPlaces()).toBeGreaterThan(MAX_NACHKOMMASTELLEN);
    });
  });

  describe('brauchtNeuverteilung', () => {
    it('ist bei ganzen Zahlen ruhig', () => {
      expect(brauchtNeuverteilung(new Genau('1500'))).toBe(false);
    });

    it('ist genau an der Grenze noch ruhig', () => {
      // 30 Nachkommastellen - passt noch in numeric(65,30).
      const grenzwertig = new Genau(`0.${'0'.repeat(29)}1`);

      expect(grenzwertig.decimalPlaces()).toBe(MAX_NACHKOMMASTELLEN);
      expect(brauchtNeuverteilung(grenzwertig)).toBe(false);
    });

    /**
     * Eine Stelle mehr, und PostgreSQL wuerde runden. Genau dann - und keinen
     * Schritt frueher - muss die Spalte neu verteilt werden.
     */
    it('schlaegt eine Stelle darueber an', () => {
      const zuGenau = new Genau(`0.${'0'.repeat(30)}1`);

      expect(zuGenau.decimalPlaces()).toBe(MAX_NACHKOMMASTELLEN + 1);
      expect(brauchtNeuverteilung(zuGenau)).toBe(true);
    });

    it('erkennt die erschoepfte Spalte nach wiederholtem Einfuegen', () => {
      let vorgaenger = new Genau('1000');
      const nachfolger = new Genau('1001');

      let schritte = 0;
      let position = berechnePosition(vorgaenger, nachfolger);

      while (!brauchtNeuverteilung(position) && schritte < 100) {
        vorgaenger = position;
        position = berechnePosition(vorgaenger, nachfolger);
        schritte++;
      }

      // Die Grenze wird erreicht, und zwar in der erwarteten Groessenordnung:
      // je Halbierung hoechstens eine Stelle mehr.
      expect(brauchtNeuverteilung(position)).toBe(true);
      expect(schritte).toBeLessThanOrEqual(MAX_NACHKOMMASTELLEN + 1);
    });
  });

  describe('neueVerteilung', () => {
    it('vergibt gleichmaessige Abstaende ab dem Ausgangswert', () => {
      expect(neueVerteilung(3).map((p) => p.toString())).toEqual([
        '1000',
        '2000',
        '3000',
      ]);
    });

    it('kommt mit einer leeren Spalte zurecht', () => {
      expect(neueVerteilung(0)).toEqual([]);
    });

    /**
     * Nach der Neuverteilung muss wieder Platz sein - sonst waere sie
     * wirkungslos und die naechste Anfrage liefe erneut hinein.
     */
    it('schafft wieder Raum fuer Halbierungen', () => {
      const [erste, zweite] = neueVerteilung(2);
      const mitte = berechnePosition(erste, zweite);

      expect(mitte.toString()).toBe('1500');
      expect(brauchtNeuverteilung(mitte)).toBe(false);
    });
  });

  it('haelt den Ausgangsabstand und die Spaltengrenze konsistent', () => {
    // Zwei Konstanten, die zusammengehoeren: Der Abstand muss gross genug
    // sein, dass zwischen zwei Nachbarn ueberhaupt 30 Halbierungen passen.
    expect(POSITIONS_ABSTAND.greaterThan(1)).toBe(true);
    expect(MAX_NACHKOMMASTELLEN).toBe(30);
  });
});
