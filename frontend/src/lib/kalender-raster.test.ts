import { describe, expect, it } from 'vitest';

import {
  VORGABE_STUNDE,
  amSelbenTag,
  fuerEingabefeld,
  langesDatum,
  monatsraster,
  rasterZeitraum,
  verschiebeMonat,
  vorgabeFuerTag,
  wochentagAbMontag,
  wochentagsNamen,
} from './kalender-raster';

/**
 * Die Rasterrechnung ohne React, ohne Netzwerk, ohne Uhr.
 *
 * Alle Daten sind FEST. Kein `new Date()` ohne Argumente, nirgends - sonst
 * haengt das Ergebnis vom Tag des Laufs ab, und ein Test, der im September
 * gruen ist und im Oktober rot, prueft nichts.
 */
describe('wochentagAbMontag', () => {
  it('macht aus Sonntag die 6 statt der 0', () => {
    // 06.09.2026 ist ein Sonntag. `getDay()` liefert dafuer 0 - in einem
    // deutschen Kalender ist er aber der siebte Tag der Woche.
    expect(wochentagAbMontag(new Date(2026, 8, 6))).toBe(6);
  });

  it('macht aus Montag die 0', () => {
    expect(wochentagAbMontag(new Date(2026, 8, 7))).toBe(0);
  });
});

describe('monatsraster', () => {
  it('hat immer 42 Tage, auch wenn der Monat in vier Wochen passt', () => {
    // Februar 2027: beginnt an einem Montag, hat 28 Tage - er braeuchte
    // rechnerisch genau vier Zeilen. Das Raster liefert trotzdem sechs, damit
    // der Kalender beim Blaettern nicht seine Hoehe aendert.
    const kurz = monatsraster({ jahr: 2027, monat: 1 });
    const lang = monatsraster({ jahr: 2026, monat: 7 });

    expect(kurz).toHaveLength(42);
    expect(lang).toHaveLength(42);
  });

  it('beginnt mit dem Montag vor dem Monatsersten', () => {
    // Der 01.09.2026 ist ein Dienstag. Vor ihm steht also genau ein Tag aus
    // dem August - der 31.08.
    const raster = monatsraster({ jahr: 2026, monat: 8 });

    expect(raster[0].datum.getDate()).toBe(31);
    expect(raster[0].datum.getMonth()).toBe(7);
    expect(raster[0].imMonat).toBe(false);

    expect(raster[1].datum.getDate()).toBe(1);
    expect(raster[1].imMonat).toBe(true);
  });

  it('beginnt ohne Vorlauf, wenn der Monat auf einen Montag faellt', () => {
    // Der Grenzfall zur vorigen Erwartung, und der einzige, in dem das Raster
    // direkt mit dem Ersten startet. Juni 2026 beginnt an einem Montag.
    const raster = monatsraster({ jahr: 2026, monat: 5 });

    expect(raster[0].datum.getDate()).toBe(1);
    expect(raster[0].datum.getMonth()).toBe(5);
    expect(raster[0].imMonat).toBe(true);
  });

  it('laeuft ueber die Jahresgrenze, ohne dass es dafuer Code gibt', () => {
    // Dezember 2026. Der Nachlauf gehoert in den Januar 2027 - `Date`
    // normalisiert das selbst, deshalb steht dafuer keine Sonderbehandlung
    // im Raster.
    const raster = monatsraster({ jahr: 2026, monat: 11 });
    const letzter = raster[raster.length - 1].datum;

    expect(letzter.getFullYear()).toBe(2027);
    expect(letzter.getMonth()).toBe(0);
  });

  it('kennt den Schalttag', () => {
    // Februar 2028 hat 29 Tage. Auch das rechnet `Date`, nicht wir - der Test
    // haelt fest, dass wir uns darauf verlassen.
    const raster = monatsraster({ jahr: 2028, monat: 1 });
    const imMonat = raster.filter((tag) => tag.imMonat);

    expect(imMonat).toHaveLength(29);
  });

  it('markiert genau die Tage des Monats als `imMonat`', () => {
    const raster = monatsraster({ jahr: 2026, monat: 8 });
    const imMonat = raster.filter((tag) => tag.imMonat);

    // September hat 30 Tage. Der Rest ist Vor- und Nachlauf.
    expect(imMonat).toHaveLength(30);
    expect(imMonat[0].datum.getDate()).toBe(1);
    expect(imMonat[29].datum.getDate()).toBe(30);
  });

  it('liefert lauter aufeinanderfolgende Tage ohne Luecke', () => {
    // Die Eigenschaft, die alle Einzelerwartungen zusammenfasst: Zwischen zwei
    // Rasterfeldern liegt immer genau ein Tag. Ein Fehler in der
    // Ueberlaufrechnung wuerde hier auffallen, auch an einer Stelle, an die
    // kein anderer Test hinsieht.
    const raster = monatsraster({ jahr: 2026, monat: 2 }); // Maerz - mit Zeitumstellung

    for (let i = 1; i < raster.length; i += 1) {
      const vorher = raster[i - 1].datum;
      const jetzt = raster[i].datum;

      const erwartet = new Date(
        vorher.getFullYear(),
        vorher.getMonth(),
        vorher.getDate() + 1,
      );

      expect(jetzt.getTime()).toBe(erwartet.getTime());
    }
  });
});

describe('rasterZeitraum', () => {
  it('umfasst das ganze Raster, nicht nur den Monat', () => {
    const raster = monatsraster({ jahr: 2026, monat: 8 });
    const { von, bis } = rasterZeitraum(raster);

    // Der erste Rastertag ist der 31.08. - wuerde hier der 01.09. stehen,
    // blieben die Termine des Vorlauftages unsichtbar, obwohl das Feld da ist.
    expect(new Date(von).getTime()).toBe(raster[0].datum.getTime());

    // `bis` ist der Tag NACH dem letzten Rastertag: Der Zeitraum ist
    // halboffen, sonst fehlten alle Termine des letzten Tages ausser dem um
    // Punkt Mitternacht.
    const letzter = raster[raster.length - 1].datum;
    const erwartetesEnde = new Date(
      letzter.getFullYear(),
      letzter.getMonth(),
      letzter.getDate() + 1,
    );

    expect(new Date(bis).getTime()).toBe(erwartetesEnde.getTime());
  });

  it('bleibt unter der Obergrenze des Endpoints', () => {
    // Der Server nimmt hoechstens 92 Tage. 42 Rastertage plus der offene
    // Endtag sind 43 - eine Monatsansicht kann die Grenze also nie reissen.
    // Der Test haelt das fest, damit eine spaetere Aenderung am Raster (etwa
    // "drei Monate auf einmal") nicht still einen 400er erzeugt.
    const { von, bis } = rasterZeitraum(monatsraster({ jahr: 2026, monat: 8 }));
    const tage =
      (new Date(bis).getTime() - new Date(von).getTime()) / 86_400_000;

    expect(tage).toBeLessThanOrEqual(92);
  });

  it('liefert UTC-Zeitpunkte, die lokaler Mitternacht entsprechen', () => {
    const raster = monatsraster({ jahr: 2026, monat: 8 });
    const { von } = rasterZeitraum(raster);

    // Die eigentliche Zusicherung: Was an den Server geht, ist ein ZEITPUNKT,
    // und zwar derselbe, den der erste Rastertag um lokal 00:00 Uhr meint.
    // In Berlin ist das im September `2026-08-30T22:00:00.000Z`, in London
    // `2026-08-30T23:00:00.000Z` - der Test prueft die Beziehung, nicht die
    // Zeichenkette, und laeuft deshalb in jeder Zone.
    expect(von).toBe(raster[0].datum.toISOString());
    expect(new Date(von).getHours()).toBe(0);
    expect(new Date(von).getMinutes()).toBe(0);
  });
});

describe('verschiebeMonat', () => {
  it('springt vom Dezember in den Januar des Folgejahres', () => {
    expect(verschiebeMonat({ jahr: 2026, monat: 11 }, 1)).toEqual({
      jahr: 2027,
      monat: 0,
    });
  });

  it('springt vom Januar in den Dezember des Vorjahres', () => {
    expect(verschiebeMonat({ jahr: 2026, monat: 0 }, -1)).toEqual({
      jahr: 2025,
      monat: 11,
    });
  });

  it('kommt auch mit mehr als zwoelf Schritten zurecht', () => {
    expect(verschiebeMonat({ jahr: 2026, monat: 8 }, 14)).toEqual({
      jahr: 2027,
      monat: 10,
    });
  });
});

describe('amSelbenTag', () => {
  it('erkennt denselben Tag trotz verschiedener Uhrzeit', () => {
    expect(
      amSelbenTag(new Date(2026, 8, 15, 8, 0), new Date(2026, 8, 15, 23, 59)),
    ).toBe(true);
  });

  it('unterscheidet Tage, die nur eine Minute auseinanderliegen', () => {
    // Der Grenzfall, auf den es ankommt: Mitternacht trennt zwei Kalendertage,
    // auch wenn der Abstand winzig ist.
    expect(
      amSelbenTag(new Date(2026, 8, 15, 23, 59), new Date(2026, 8, 16, 0, 0)),
    ).toBe(false);
  });

  it('unterscheidet denselben Tag in verschiedenen Jahren', () => {
    // Ohne den Jahresvergleich waeren der 15.09.2026 und der 15.09.2027
    // derselbe Tag - ein Fehler, den man im laufenden Jahr nie bemerkt.
    expect(amSelbenTag(new Date(2026, 8, 15), new Date(2027, 8, 15))).toBe(
      false,
    );
  });
});

describe('fuerEingabefeld', () => {
  it('formatiert die LOKALE Zeit, nicht UTC', () => {
    // Der eigentliche Test dieser Funktion. `toISOString().slice(0, 16)` waere
    // der naheliegende Einzeiler und ergaebe im Berliner Sommer 07:00 statt
    // 09:00 - still, und in London gar nicht reproduzierbar.
    const neun = new Date(2026, 8, 15, 9, 0);

    expect(fuerEingabefeld(neun)).toBe('2026-09-15T09:00');
  });

  it('fuellt einstellige Werte mit einer Null auf', () => {
    // `<input type="datetime-local">` verlangt genau dieses Format. Ein
    // "2026-1-5T9:05" wuerde das Feld stillschweigend leer lassen - der Nutzer
    // saehe ein leeres Datum und wuesste nicht, warum.
    expect(fuerEingabefeld(new Date(2026, 0, 5, 9, 5))).toBe(
      '2026-01-05T09:05',
    );
  });

  it('laesst sich vom Eingabefeld verlustfrei zurueckwandeln', () => {
    // Die Rundreise: Was hier herauskommt, liest `new Date(...)` wieder als
    // denselben lokalen Zeitpunkt. Genau darauf verlaesst sich der Dialog,
    // wenn er den Wert des Feldes in einen Zeitpunkt umwandelt.
    const zeitpunkt = new Date(2026, 8, 15, 13, 30);

    expect(new Date(fuerEingabefeld(zeitpunkt)).getTime()).toBe(
      zeitpunkt.getTime(),
    );
  });
});

describe('vorgabeFuerTag', () => {
  it('nimmt den geklickten Tag und setzt die Vorgabestunde', () => {
    // `Kalendertag.datum` ist immer Mitternacht. Ein Termin um 00:00 liest
    // sich wie "keine Uhrzeit angegeben".
    const vorgabe = vorgabeFuerTag(new Date(2026, 8, 15));

    expect(vorgabe.getDate()).toBe(15);
    expect(vorgabe.getHours()).toBe(VORGABE_STUNDE);
    expect(vorgabe.getMinutes()).toBe(0);
  });

  it('behaelt den Tag, auch wenn schon eine Uhrzeit dransteht', () => {
    // Gegenprobe: Die Funktion ersetzt die Uhrzeit, sie addiert nicht.
    const vorgabe = vorgabeFuerTag(new Date(2026, 8, 15, 23, 45));

    expect(vorgabe.getDate()).toBe(15);
    expect(vorgabe.getHours()).toBe(VORGABE_STUNDE);
  });
});

describe('langesDatum', () => {
  it('nennt Wochentag, Tag, Monat und Jahr', () => {
    // Gebraucht als zugaenglicher Name der Anlege-Flaeche. Ein Knopf, der nur
    // "+" heisst, ist im Screenreader 42 mal derselbe Knopf.
    expect(langesDatum(new Date(2026, 8, 15))).toBe(
      'Dienstag, 15. September 2026',
    );
  });
});

describe('wochentagsNamen', () => {
  it('beginnt mit Montag', () => {
    const namen = wochentagsNamen();

    expect(namen).toHaveLength(7);
    expect(namen[0]).toMatch(/^Mo/);
    expect(namen[6]).toMatch(/^So/);
  });
});
