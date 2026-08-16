import { describe, expect, it } from 'vitest';

import { akteurName, ereignisSatz } from './feed-satz';
import type { Ereignistyp, FeedEintrag } from './aktivitaeten';

/**
 * Reine Rechnung, also kein `render`, kein Netzwerk, keine Attrappen -
 * dieselbe Trennung wie bei `board-logik.test.ts`.
 *
 * Der Schwerpunkt liegt auf dem, was FEHLEN kann. `payload` ist im Backend
 * `jsonb` und von der Datenbank nicht geprueft, und der Feed ist ein
 * Protokoll: Seine Eintraege ueberdauern jede Formataenderung. Ein Frontend,
 * das den heutigen Aufbau voraussetzt, bricht genau dann, wenn der Feed seinen
 * Zweck erfuellt.
 */
const eintrag = (
  type: Ereignistyp,
  payload: unknown,
  actor: FeedEintrag['actor'] = null,
  source: FeedEintrag['source'] = 'APP',
): FeedEintrag => ({
  id: 'a1',
  type,
  source,
  actor,
  projectId: 'p1',
  taskId: 't1',
  payload,
  createdAt: '2026-08-14T10:03:22.150Z',
});

describe('ereignisSatz', () => {
  it('formuliert das Anlegen einer Aufgabe mit ihrem Titel', () => {
    expect(ereignisSatz(eintrag('TASK_CREATED', { title: 'Login-Bug' }))).toBe(
      'hat „Login-Bug" angelegt',
    );
  });

  it('uebersetzt die Status in die Spaltennamen des Boards', () => {
    const satz = ereignisSatz(
      eintrag('TASK_MOVED', {
        title: 'Login-Bug',
        fromStatus: 'TODO',
        toStatus: 'DONE',
      }),
    );

    // "Offen" und "Erledigt" stammen aus SPALTEN in board-logik.ts. Eine
    // eigene Liste hier haette bedeutet, dass dieselbe Spalte auf dem Board
    // anders heisst als im Feed - und niemand merkt es, weil beide Stellen
    // fuer sich stimmig sind.
    expect(satz).toBe('hat „Login-Bug" von „Offen" nach „Erledigt" verschoben');
  });

  /**
   * Das Backend laesst gleichen Von- und Nach-Status ausdruecklich zu: Die
   * Karte hat den Platz gewechselt, nur nicht die Spalte. "von Offen nach
   * Offen verschoben" waere Unsinn - und genau deshalb entscheidet das
   * Frontend ueber den Satz und nicht das Backend ueber das Ereignis.
   */
  it('nennt das Umsortieren innerhalb einer Spalte beim Namen', () => {
    const satz = ereignisSatz(
      eintrag('TASK_MOVED', {
        title: 'Login-Bug',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'IN_PROGRESS',
      }),
    );

    expect(satz).toBe('hat „Login-Bug" in „In Arbeit" umsortiert');
  });

  describe('bleibt lesbar, wenn Angaben fehlen', () => {
    it('ohne Titel', () => {
      expect(ereignisSatz(eintrag('TASK_CREATED', {}))).toBe(
        'hat eine Aufgabe angelegt',
      );
    });

    it('ohne Status beim Verschieben', () => {
      expect(ereignisSatz(eintrag('TASK_MOVED', { title: 'X' }))).toBe(
        'hat „X" verschoben',
      );
    });

    /**
     * Der Fall, der ohne die vorsichtige Leseroutine ein Absturz waere:
     * `payload` ist gar kein Objekt. Bei `null` wuerde `payload.title` die
     * Seite beenden - und zwar die ganze Seite, nicht nur diesen Eintrag.
     */
    it('bei payload null', () => {
      expect(ereignisSatz(eintrag('TASK_DELETED', null))).toBe(
        'hat eine Aufgabe gelöscht',
      );
    });

    it('bei payload als Zeichenkette statt Objekt', () => {
      expect(ereignisSatz(eintrag('PROJECT_CREATED', 'unerwartet'))).toBe(
        'hat ein Projekt angelegt',
      );
    });

    /**
     * Ein leerer Titel zaehlt als "nicht da". Sonst stuende im Feed
     * `hat „" angelegt` - schlechter als der allgemeine Satz.
     */
    it('bei leerem Titel', () => {
      expect(ereignisSatz(eintrag('TASK_CREATED', { title: '' }))).toBe(
        'hat eine Aufgabe angelegt',
      );
    });

    /**
     * ========================================================================
     * DER WICHTIGSTE TEST DIESER DATEI
     * ========================================================================
     * Ein Ereignistyp, den diese Frontend-Version noch nicht kennt. Genau das
     * passiert waehrend jedes Deployments: Das Backend ist schon neu, der
     * Browser haelt noch die alte Fassung.
     *
     * Anders als im Backend gibt es hier deshalb bewusst KEINE
     * `never`-Vollstaendigkeitspruefung. Dort erzeugen wir die Ereignisse
     * selbst und wollen beim Kompilieren erinnert werden. Hier empfangen wir
     * sie - und ein Frontend, das unbekannte Werte nicht ertraegt, ist bei
     * jedem Deployment fuer ein paar Minuten kaputt.
     */
    it('bei einem unbekannten Ereignistyp', () => {
      const unbekannt = eintrag('ETWAS_NEUES' as Ereignistyp, {
        title: 'egal',
      });

      expect(ereignisSatz(unbekannt)).toBe('hat etwas geändert');
    });
  });

  describe('GitHub', () => {
    it('nennt Zweig und Anzahl bei einem Push', () => {
      expect(
        ereignisSatz(
          eintrag('GITHUB_PUSH', { branch: 'main', commitCount: 3 }),
        ),
      ).toBe('hat 3 Commits nach „main" gepusht');
    });

    /**
     * "1 Commits" ist der Klassiker, an dem man sieht, dass niemand
     * hingeschaut hat. Der Test kostet zwei Zeilen.
     */
    it('setzt bei einem einzigen Commit die Einzahl', () => {
      expect(
        ereignisSatz(
          eintrag('GITHUB_PUSH', { branch: 'main', commitCount: 1 }),
        ),
      ).toBe('hat 1 Commit nach „main" gepusht');
    });

    it('nennt auch null Commits, statt die Zahl zu verschweigen', () => {
      // Ein Push ohne Commits gibt es wirklich - etwa beim Anlegen eines
      // Zweigs. "hat nach main gepusht" waere ungenauer als die Wahrheit.
      expect(
        ereignisSatz(
          eintrag('GITHUB_PUSH', { branch: 'main', commitCount: 0 }),
        ),
      ).toBe('hat 0 Commits nach „main" gepusht');
    });

    it.each([
      ['ohne Anzahl', { branch: 'main' }, 'hat nach „main" gepusht'],
      [
        'mit unbrauchbarer Anzahl',
        { branch: 'main', commitCount: 'drei' },
        'hat nach „main" gepusht',
      ],
      [
        'mit NaN als Anzahl',
        { branch: 'main', commitCount: Number.NaN },
        'hat nach „main" gepusht',
      ],
      ['ohne Zweig', { commitCount: 3 }, 'hat etwas gepusht'],
      ['ganz leer', {}, 'hat etwas gepusht'],
    ])('bleibt %s allgemein, statt zu raten', (_fall, payload, erwartet) => {
      expect(ereignisSatz(eintrag('GITHUB_PUSH', payload))).toBe(erwartet);
    });

    it.each([
      ['GITHUB_PULL_REQUEST_OPENED', 'geöffnet'],
      ['GITHUB_PULL_REQUEST_MERGED', 'zusammengeführt'],
      ['GITHUB_PULL_REQUEST_CLOSED', 'verworfen'],
    ] as const)('formuliert %s als „%s"', (typ, verb) => {
      expect(
        ereignisSatz(eintrag(typ, { number: 7, title: 'Login reparieren' })),
      ).toBe(`hat Pull Request #7 „Login reparieren" ${verb}`);
    });

    /**
     * Der Unterschied, um den es in diesem Sprint geht: GitHub schickt fuer
     * "zusammengefuehrt" und "verworfen" dasselbe `action: closed`. Waeren
     * beide derselbe Ereignistyp, stuende hier zweimal derselbe Satz.
     */
    it('unterscheidet zusammengeführt von verworfen im Satz', () => {
      const zusammen = ereignisSatz(
        eintrag('GITHUB_PULL_REQUEST_MERGED', { number: 7 }),
      );
      const verworfen = ereignisSatz(
        eintrag('GITHUB_PULL_REQUEST_CLOSED', { number: 7 }),
      );

      expect(zusammen).not.toBe(verworfen);
    });

    it.each([
      ['nur mit Nummer', { number: 7 }, 'hat Pull Request #7 geöffnet'],
      [
        'nur mit Titel',
        { title: 'Login' },
        'hat den Pull Request „Login" geöffnet',
      ],
      ['ganz leer', {}, 'hat einen Pull Request geöffnet'],
    ])('kommt %s aus', (_fall, payload, erwartet) => {
      expect(ereignisSatz(eintrag('GITHUB_PULL_REQUEST_OPENED', payload))).toBe(
        erwartet,
      );
    });

    it('stuerzt bei unbrauchbarem payload nicht ab', () => {
      for (const payload of [null, undefined, 42, 'text', []]) {
        expect(() =>
          ereignisSatz(eintrag('GITHUB_PUSH', payload)),
        ).not.toThrow();
      }
    });
  });
});

describe('akteurName', () => {
  it('bevorzugt den Namen', () => {
    const mit = eintrag(
      'TASK_CREATED',
      {},
      {
        userId: 'u1',
        name: 'Murat',
        email: 'murat@example.com',
      },
    );

    expect(akteurName(mit)).toBe('Murat');
  });

  it('faellt auf die Adresse zurueck, wenn kein Name gesetzt ist', () => {
    const ohneName = eintrag(
      'TASK_CREATED',
      {},
      {
        userId: 'u1',
        name: null,
        email: 'murat@example.com',
      },
    );

    expect(akteurName(ohneName)).toBe('murat@example.com');
  });

  /**
   * `actor: null` ist kein Fehler, sondern der Normalfall nach einer
   * Kontoloeschung - `ON DELETE SET NULL` laesst das Ereignis stehen und nimmt
   * ihm nur die Zuordnung. Der Verlauf des Teams soll nicht verschwinden, nur
   * weil jemand gegangen ist.
   */
  it('nennt ein entferntes Mitglied beim Namen', () => {
    expect(akteurName(eintrag('TASK_CREATED', {}))).toBe(
      'Ein entferntes Mitglied',
    );
  });

  /**
   * ==========================================================================
   * DIE TESTS, DIE DIE FALLE AUS SPRINT 5 BEWACHEN
   * ==========================================================================
   * Ohne `source` liefe ein GitHub-Ereignis in denselben Zweig wie ein
   * geloeschtes Konto - der Feed behauptete dann, ein ausgetretener Kollege
   * habe gepusht. Der Test darueber allein wuerde das NICHT bemerken: Er ist
   * mit und ohne die Unterscheidung gruen.
   */
  it('nennt bei GitHub den Anmeldenamen statt eines entfernten Mitglieds', () => {
    expect(
      akteurName(
        eintrag('GITHUB_PUSH', { githubLogin: 'octocat' }, null, 'GITHUB'),
      ),
    ).toBe('octocat');
  });

  it('bleibt allgemein, wenn der GitHub-Name fehlt', () => {
    // Wieder der Grundsatz aus dem Kopf dieser Datei: Was fehlt, wird nicht
    // erfunden. "Jemand auf GitHub" stimmt; "Ein entferntes Mitglied" waere
    // eine Behauptung ueber jemanden, der nie hier war.
    expect(akteurName(eintrag('GITHUB_PUSH', {}, null, 'GITHUB'))).toBe(
      'Jemand auf GitHub',
    );
  });

  it('bevorzugt auch bei GitHub einen vorhandenen Akteur', () => {
    // Kommt spaeter eine Zuordnung GitHub-Konto -> DevBoard-Nutzer dazu, soll
    // der echte Name gewinnen. Der Test haelt die Reihenfolge fest, bevor es
    // die Zuordnung gibt.
    expect(
      akteurName(
        eintrag(
          'GITHUB_PUSH',
          { githubLogin: 'octocat' },
          { userId: 'u1', name: 'Murat', email: 'murat@example.com' },
          'GITHUB',
        ),
      ),
    ).toBe('Murat');
  });
});
