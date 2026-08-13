import { describe, expect, it } from 'vitest';

import {
  gruppiere,
  planeVerschiebung,
  verschiebeMeldung,
  zielIndexFuer,
} from './board-logik';
import { ApiFehler } from './api';
import type { Aufgabe, AufgabenStatus } from './aufgaben';

/**
 * Die Board-Logik ohne React, ohne dnd-kit, ohne Netzwerk.
 *
 * Drag & Drop ueber Testereignisse nachzustellen waere aufwendig und
 * bruechig - die Bibliothek dazwischen aendert ihr Verhalten von Version zu
 * Version. Die Rechnung dahinter ist reine Listenarithmetik, und genau die
 * steht hier. Dasselbe Vorgehen wie bei `positionen.ts` im Backend.
 */
const karte = (
  id: string,
  status: AufgabenStatus = 'TODO',
  version = 0,
): Aufgabe => ({
  id,
  title: `Karte ${id}`,
  description: null,
  status,
  position: '1000',
  version,
  assignee: null,
  dueDate: null,
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
});

const ids = (aufgaben: Aufgabe[], status: AufgabenStatus) =>
  aufgaben.filter((a) => a.status === status).map((a) => a.id);

/**
 * ============================================================================
 * DIE UNTERSCHEIDUNG, DIE DER NUTZER MERKT
 * ============================================================================
 * Ein 409 ist keine Stoerung, sondern eine Auskunft: Jemand anderes war
 * schneller. Die Karte ist durch das Rollback bereits zurueck an ihrem Platz,
 * der echte Stand wird nachgeladen - es ist alles richtig gelaufen, nur nicht
 * so, wie der Nutzer es sich gedacht hat.
 *
 * Deshalb steht die Entscheidung in einer eigenen Funktion und nicht im Bauch
 * der Komponente: Dort waere sie nur ueber eine echte Ziehbewegung erreichbar.
 */
describe('verschiebeMeldung', () => {
  it('erklaert einen Versionskonflikt, statt eine Stoerung zu melden', () => {
    const meldung = verschiebeMeldung(new ApiFehler('Konflikt', 409));

    expect(meldung).toContain('von jemand anderem verschoben');
    expect(meldung).toContain('neu geladen');
  });

  it('meldet einen echten Fehler als solchen', () => {
    expect(verschiebeMeldung(new ApiFehler('Serverfehler', 500))).toBe(
      'Die Karte konnte nicht verschoben werden.',
    );
  });

  it('behandelt einen Netzwerkabbruch wie einen echten Fehler', () => {
    // Kein ApiFehler, also auch kein 409 - hier ist "konnte nicht verschoben
    // werden" die richtige Aussage.
    expect(verschiebeMeldung(new Error('Netzwerk weg'))).toBe(
      'Die Karte konnte nicht verschoben werden.',
    );
  });
});

describe('gruppiere', () => {
  it('teilt die flache Liste in drei Spalten', () => {
    const gruppen = gruppiere([
      karte('a'),
      karte('b', 'IN_PROGRESS'),
      karte('c', 'DONE'),
    ]);

    expect(gruppen.TODO.map((a) => a.id)).toEqual(['a']);
    expect(gruppen.IN_PROGRESS.map((a) => a.id)).toEqual(['b']);
    expect(gruppen.DONE.map((a) => a.id)).toEqual(['c']);
  });

  it('liefert leere Spalten statt sie wegzulassen', () => {
    const gruppen = gruppiere([]);

    // Eine fehlende Spalte waere im Board ein Loch. Genau deshalb liefert das
    // Backend eine flache Liste und die Spalten stehen im Frontend.
    expect(gruppen.TODO).toEqual([]);
    expect(gruppen.IN_PROGRESS).toEqual([]);
    expect(gruppen.DONE).toEqual([]);
  });

  it('behaelt die Reihenfolge des Servers bei', () => {
    const gruppen = gruppiere([karte('c'), karte('a'), karte('b')]);

    // NICHT alphabetisch oder nach Position sortiert - der Server hat bereits
    // sortiert, ein zweites Sortieren waere eine zweite Wahrheit.
    expect(gruppen.TODO.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('zielIndexFuer', () => {
  const aufgaben = [karte('a'), karte('b'), karte('c')];

  it('legt ans Ende, wenn ueber der Spalte losgelassen wird', () => {
    expect(zielIndexFuer(aufgaben, 'a', 'TODO', null)).toBe(2);
  });

  it('nimmt den Platz der Karte, ueber der losgelassen wurde', () => {
    // Ohne 'c' ist die Spalte [a, b]; ueber 'b' abgelegt heisst Index 1.
    expect(zielIndexFuer(aufgaben, 'c', 'TODO', 'b')).toBe(1);
  });

  it('rechnet ohne die bewegte Karte', () => {
    // 'a' ueber 'c': Ohne 'a' ist die Spalte [b, c], 'c' steht auf Index 1.
    // Mit der ungekuerzten Liste waere es 2 - und die Karte landete falsch.
    expect(zielIndexFuer(aufgaben, 'a', 'TODO', 'c')).toBe(1);
  });

  it('legt in eine leere Spalte an den Anfang', () => {
    expect(zielIndexFuer(aufgaben, 'a', 'DONE', null)).toBe(0);
  });
});

describe('planeVerschiebung', () => {
  it('meldet null, wenn die Karte nicht mehr existiert', () => {
    // Die Anzeige ist veraltet. Raten waere schlimmer als nichts zu tun.
    expect(planeVerschiebung([karte('a')], 'weg', 'TODO', 0)).toBeNull();
  });

  describe('Nachbarn', () => {
    const aufgaben = [karte('a'), karte('b'), karte('c')];

    it('nennt beide Nachbarn in der Mitte', () => {
      const plan = planeVerschiebung(aufgaben, 'c', 'TODO', 1);

      expect(plan?.verschiebung.previousId).toBe('a');
      expect(plan?.verschiebung.nextId).toBe('b');
    });

    it('laesst den Vorgaenger am oberen Rand weg', () => {
      const plan = planeVerschiebung(aufgaben, 'c', 'TODO', 0);

      expect(plan?.verschiebung.previousId).toBeNull();
      expect(plan?.verschiebung.nextId).toBe('a');
    });

    it('laesst den Nachfolger am unteren Rand weg', () => {
      const plan = planeVerschiebung(aufgaben, 'a', 'TODO', 2);

      expect(plan?.verschiebung.previousId).toBe('c');
      expect(plan?.verschiebung.nextId).toBeNull();
    });

    it('nennt gar keinen Nachbarn in einer leeren Spalte', () => {
      const plan = planeVerschiebung(aufgaben, 'a', 'DONE', 0);

      expect(plan?.verschiebung.previousId).toBeNull();
      expect(plan?.verschiebung.nextId).toBeNull();
      expect(plan?.verschiebung.status).toBe('DONE');
    });

    /**
     * ========================================================================
     * DER FEHLER, DER NUR IN EINE RICHTUNG KIPPT
     * ========================================================================
     * Zaehlte die Karte sich selbst mit, waere das Verschieben NACH UNTEN um
     * eine Stelle daneben - nach oben dagegen richtig. Genau die Sorte Fehler,
     * die man beim Ausprobieren uebersieht, weil man zuerst nach oben schiebt.
     */
    it('rechnet beim Verschieben nach unten ohne die eigene Karte', () => {
      const plan = planeVerschiebung(aufgaben, 'a', 'TODO', 1);

      // Ohne 'a' ist die Spalte [b, c]; Index 1 heisst zwischen b und c.
      expect(plan?.verschiebung.previousId).toBe('b');
      expect(plan?.verschiebung.nextId).toBe('c');
    });

    it('schickt die Version der bewegten Karte mit', () => {
      const plan = planeVerschiebung(
        [karte('a'), karte('b', 'TODO', 7)],
        'b',
        'TODO',
        0,
      );

      // Nicht die Version irgendeiner anderen Karte - der Server prueft
      // genau diese.
      expect(plan?.verschiebung.version).toBe(7);
    });
  });

  describe('Vorschau fuer das optimistische Update', () => {
    it('setzt die Karte an die richtige Stelle derselben Spalte', () => {
      const plan = planeVerschiebung(
        [karte('a'), karte('b'), karte('c')],
        'c',
        'TODO',
        0,
      );

      expect(ids(plan!.vorschau, 'TODO')).toEqual(['c', 'a', 'b']);
    });

    it('traegt die Karte in die neue Spalte ein und aus der alten aus', () => {
      const plan = planeVerschiebung(
        [karte('a'), karte('b'), karte('x', 'DONE')],
        'b',
        'DONE',
        0,
      );

      expect(ids(plan!.vorschau, 'TODO')).toEqual(['a']);
      expect(ids(plan!.vorschau, 'DONE')).toEqual(['b', 'x']);
    });

    it('haengt an eine leere Spalte an', () => {
      const plan = planeVerschiebung([karte('a')], 'a', 'IN_PROGRESS', 0);

      expect(ids(plan!.vorschau, 'TODO')).toEqual([]);
      expect(ids(plan!.vorschau, 'IN_PROGRESS')).toEqual(['a']);
    });

    /**
     * Die Vorschau erfindet KEINE Position. Der Server rechnet sie aus, und
     * eine ausgedachte waere eine Behauptung ueber etwas, das wir nicht
     * wissen - beim naechsten Laden staende ein anderer Wert da.
     *
     * Moeglich ist das nur, weil die Anzeige die Reihenfolge aus der LISTE
     * liest und nie aus dem Positionswert.
     */
    it('erfindet keine Position und keine neue Version', () => {
      const vorher = karte('a');
      const plan = planeVerschiebung([vorher, karte('b')], 'a', 'TODO', 1);

      const bewegte = plan!.vorschau.find((k) => k.id === 'a');
      expect(bewegte?.position).toBe(vorher.position);
      expect(bewegte?.version).toBe(vorher.version);
    });

    it('verliert keine Karte', () => {
      const aufgaben = [
        karte('a'),
        karte('b'),
        karte('c', 'IN_PROGRESS'),
        karte('d', 'DONE'),
      ];

      const plan = planeVerschiebung(aufgaben, 'a', 'DONE', 1);

      expect(plan!.vorschau).toHaveLength(aufgaben.length);
    });
  });

  it('begrenzt einen zu grossen Zielindex, statt zu stolpern', () => {
    // dnd-kit meldet beim Ablegen unterhalb der letzten Karte einen Index
    // ueber das Ende hinaus. Ein Absturz waere die falsche Antwort darauf.
    const plan = planeVerschiebung([karte('a'), karte('b')], 'a', 'TODO', 99);

    expect(plan?.verschiebung.previousId).toBe('b');
    expect(plan?.verschiebung.nextId).toBeNull();
  });
});
