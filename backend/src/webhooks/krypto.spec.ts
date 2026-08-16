import { randomBytes } from 'node:crypto';

import {
  SCHLUESSEL_LAENGE,
  entschluessele,
  erzeugeGeheimnis,
  leseSchluessel,
  verschluessele,
} from './krypto';

/**
 * Tests fuer die reine Krypto-Rechnung.
 *
 * Kein Nest-Modul, kein Prisma, keine Datenbank - deshalb laufen sie in
 * Millisekunden, und deshalb ist hier Platz fuer die Grenzfaelle, die im E2E
 * zu teuer waeren. Genau die Ueberlegung aus Sprint 3 (`positionen.ts`).
 */
describe('krypto', () => {
  const schluessel = randomBytes(SCHLUESSEL_LAENGE);

  describe('leseSchluessel', () => {
    it('liest 64 Hex-Zeichen als 32 Byte', () => {
      const hex = randomBytes(SCHLUESSEL_LAENGE).toString('hex');

      expect(leseSchluessel(hex)).toHaveLength(SCHLUESSEL_LAENGE);
    });

    it('weist einen zu kurzen Schluessel ab', () => {
      expect(() => leseSchluessel('abcd')).toThrow(/32 Byte/);
    });

    /**
     * Der unangenehme Fall: `Buffer.from(..., 'hex')` wirft bei ungueltigen
     * Zeichen NICHT, sondern bricht still ab und liefert das, was bis dahin
     * lesbar war. Ohne die Laengenpruefung entstuende daraus ein zu kurzer
     * Schluessel - und der Fehler faende sich erst in `createCipheriv`.
     */
    it('weist Hex mit ungueltigen Zeichen ab, statt still zu kuerzen', () => {
      const kaputt = 'zz'.repeat(32);

      expect(() => leseSchluessel(kaputt)).toThrow(/war 0/);
    });
  });

  describe('erzeugeGeheimnis', () => {
    it('liefert 64 Hex-Zeichen', () => {
      expect(erzeugeGeheimnis()).toMatch(/^[0-9a-f]{64}$/);
    });

    it('liefert bei zwei Aufrufen verschiedene Werte', () => {
      expect(erzeugeGeheimnis()).not.toBe(erzeugeGeheimnis());
    });
  });

  describe('verschluessele / entschluessele', () => {
    it('gibt den Klartext zurueck', () => {
      const klartext = erzeugeGeheimnis();

      const zurueck = entschluessele(
        verschluessele(klartext, schluessel),
        schluessel,
      );

      expect(zurueck).toBe(klartext);
    });

    it('haelt auch Umlaute und Sonderzeichen aus', () => {
      // Nicht Zierde: Bei falscher Kodierung faellt ein reiner ASCII-Test
      // NICHT auf, weil dort jedes Zeichen ein Byte ist.
      const klartext = 'Grüße aus Köln – 😀';

      expect(
        entschluessele(verschluessele(klartext, schluessel), schluessel),
      ).toBe(klartext);
    });

    it('erzeugt fuer denselben Klartext zwei verschiedene Schluesseltexte', () => {
      // Das ist der sichtbare Beleg dafuer, dass der IV je Aufruf neu gezogen
      // wird. Waeren beide gleich, waere der IV fest - und GCM damit gebrochen:
      // Zwei Nachrichten unter demselben Schluessel und IV verraten ihr XOR
      // und erlauben, den Authentifizierungs-Schluessel herzuleiten.
      const klartext = 'immer derselbe Text';

      const a = verschluessele(klartext, schluessel);
      const b = verschluessele(klartext, schluessel);

      expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
      expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(
        false,
      );
    });

    it('legt den Klartext nicht im Schluesseltext ab', () => {
      const klartext = 'streng geheim';

      const { ciphertext } = verschluessele(klartext, schluessel);

      expect(Buffer.from(ciphertext).toString('utf8')).not.toContain(klartext);
    });
  });

  /**
   * ==========================================================================
   * DIE TESTS, DERENTWEGEN GCM UEBERHAUPT GEWAEHLT WURDE
   * ==========================================================================
   * Ein reiner Verschluesselungsmodus ohne Authentifizierung (etwa CBC) wuerde
   * die drei folgenden Faelle NICHT bemerken. Er lieferte veraenderten Unsinn
   * zurueck - und mit dem wuerde spaeter eine HMAC-Signatur nachgerechnet, die
   * dann immer falsch waere, ohne dass jemand die Ursache saehe.
   */
  describe('Unversehrtheit', () => {
    it('weist einen veraenderten Schluesseltext ab', () => {
      const geheimnis = verschluessele('streng geheim', schluessel);
      geheimnis.ciphertext[0] ^= 0x01;

      expect(() => entschluessele(geheimnis, schluessel)).toThrow();
    });

    it('weist einen veraenderten Authentifizierungs-Tag ab', () => {
      const geheimnis = verschluessele('streng geheim', schluessel);
      geheimnis.authTag[0] ^= 0x01;

      expect(() => entschluessele(geheimnis, schluessel)).toThrow();
    });

    it('weist einen veraenderten IV ab', () => {
      const geheimnis = verschluessele('streng geheim', schluessel);
      geheimnis.iv[0] ^= 0x01;

      expect(() => entschluessele(geheimnis, schluessel)).toThrow();
    });

    it('weist den falschen Schluessel ab', () => {
      const geheimnis = verschluessele('streng geheim', schluessel);
      const fremder = randomBytes(SCHLUESSEL_LAENGE);

      expect(() => entschluessele(geheimnis, fremder)).toThrow();
    });
  });
});
