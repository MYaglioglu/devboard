import { describe, expect, it } from 'vitest';

import { farbeFuer, initialen } from './avatar';

/**
 * Reine Rechnung, kein gerenderter Knoten - dieselbe Ueberlegung wie bei
 * `feed-satz.ts`: Alle Grenzfaelle lassen sich hier in Millisekunden pruefen.
 */
describe('initialen', () => {
  it.each([
    ['zwei Woerter', 'Murat Yaglioglu', 'MY'],
    ['drei Woerter - nur die ersten beiden', 'Anna Maria Schmidt', 'AM'],
    ['ein Wort - zwei Buchstaben', 'murat', 'MU'],
    ['E-Mail - vor dem @', 'murat@example.com', 'MU'],
    ['E-Mail mit Punkt', 'murat.yaglioglu@example.com', 'MY'],
    ['E-Mail mit Bindestrich', 'anna-maria@example.com', 'AM'],
    ['mit Leerzeichen aussen', '  Murat  ', 'MU'],
  ])('%s', (_fall, eingabe, erwartet) => {
    expect(initialen(eingabe)).toBe(erwartet);
  });

  /**
   * Ein einzelner Buchstabe sieht aus wie ein Fehler, deshalb immer zwei -
   * ausser es gibt nur einen.
   */
  it('nimmt bei einem einbuchstabigen Namen, was da ist', () => {
    expect(initialen('M')).toBe('M');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['leer', ''],
    ['nur Leerzeichen', '   '],
    ['nur Trennzeichen', '...'],
    ['nur ein @', '@'],
  ])(
    'liefert bei %s ein Fragezeichen statt eines erfundenen Namens',
    (_f, e) => {
      expect(initialen(e)).toBe('?');
    },
  );
});

describe('farbeFuer', () => {
  /**
   * ==========================================================================
   * DIE EIGENSCHAFT, AUF DIE ES ANKOMMT
   * ==========================================================================
   * Nicht WELCHE Farbe herauskommt, sondern dass es bei derselben Kennung
   * IMMER dieselbe ist. Mit `Math.random()` flackerte der Avatar bei jedem
   * Rendern - und auf dem Server kaeme ein anderer Wert heraus als im Browser,
   * also zusaetzlich eine Hydrations-Abweichung.
   */
  it('liefert fuer dieselbe Kennung immer dieselbe Farbe', () => {
    const kennung = '9f1c3e2a-0000-4444-8888-abcdefabcdef';

    expect(farbeFuer(kennung)).toBe(farbeFuer(kennung));
  });

  it('verteilt verschiedene Kennungen auf mehr als eine Farbe', () => {
    // Ohne diesen Test waere auch eine Funktion gruen, die IMMER dieselbe
    // Farbe liefert - sie waere ja stabil.
    const farben = new Set(
      Array.from({ length: 40 }, (_, i) => farbeFuer(`nutzer-${i}`)),
    );

    expect(farben.size).toBeGreaterThan(2);
  });

  it('liefert auch bei einer leeren Kennung eine gueltige Klasse', () => {
    expect(farbeFuer('')).toContain('bg-');
  });
});
