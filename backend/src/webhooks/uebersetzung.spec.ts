import { uebersetze } from './uebersetzung';

/**
 * Tests fuer die reine Uebersetzung - ohne Datenbank, ohne Nest.
 *
 * Der Schwerpunkt liegt auf dem, was FEHLEN oder anders aussehen kann. Was
 * hier ankommt, ist JSON aus dem Internet: Eine gueltige Signatur sagt, dass
 * der Absender das Geheimnis kennt - nicht, dass die Nutzlast die Form hat,
 * die die Dokumentation beschreibt.
 */
describe('uebersetze', () => {
  const PROJEKT = 'p-1';
  const repo = { full_name: 'acme/webshop' };
  const sender = { login: 'octocat' };

  describe('push', () => {
    it('uebersetzt einen Push mit Zweig, Anzahl und Autor', () => {
      const ereignis = uebersetze(
        'push',
        {
          ref: 'refs/heads/main',
          repository: repo,
          sender,
          commits: [{ id: 'a' }, { id: 'b' }],
        },
        PROJEKT,
      );

      expect(ereignis).toEqual({
        typ: 'GITHUB_PUSH',
        projektId: PROJEKT,
        repository: 'acme/webshop',
        zweig: 'main',
        anzahlCommits: 2,
        autor: 'octocat',
      });
    });

    /**
     * Ein Zweigname darf Schraegstriche enthalten. Mit `split('/').pop()`
     * stuende hier "neu" - der Test haelt fest, warum es `startsWith` ist.
     */
    it('behaelt Schraegstriche im Zweignamen', () => {
      expect(
        uebersetze(
          'push',
          { ref: 'refs/heads/feature/login/neu', repository: repo, sender },
          PROJEKT,
        ),
      ).toMatchObject({ zweig: 'feature/login/neu' });
    });

    it('ignoriert einen Push auf ein Tag', () => {
      // `refs/tags/v1` ist kein Zweig - dafuer gibt es keinen sinnvollen Satz
      // im Feed, und ein erfundener waere schlechter als keiner.
      expect(
        uebersetze(
          'push',
          { ref: 'refs/tags/v1.0.0', repository: repo, sender },
          PROJEKT,
        ),
      ).toBeNull();
    });

    it('zaehlt null Commits, wenn die Liste fehlt oder unbrauchbar ist', () => {
      for (const commits of [undefined, null, 'keine Liste', 42]) {
        expect(
          uebersetze(
            'push',
            { ref: 'refs/heads/main', repository: repo, sender, commits },
            PROJEKT,
          ),
        ).toMatchObject({ anzahlCommits: 0 });
      }
    });

    it('kommt ohne Autor aus', () => {
      // `autor: null` und nicht "unbekannt": Das Frontend entscheidet, wie es
      // eine fehlende Angabe zeigt. Hier einen Platzhalter einzusetzen hiesse,
      // die Entscheidung an der falschen Stelle zu treffen.
      expect(
        uebersetze(
          'push',
          { ref: 'refs/heads/main', repository: repo },
          PROJEKT,
        ),
      ).toMatchObject({ autor: null });
    });
  });

  describe('pull_request', () => {
    const pr = (zusatz: Record<string, unknown>) => ({
      repository: repo,
      sender,
      pull_request: { number: 7, title: 'Login reparieren', ...zusatz },
    });

    it('uebersetzt einen geoeffneten Pull Request', () => {
      expect(
        uebersetze('pull_request', { action: 'opened', ...pr({}) }, PROJEKT),
      ).toEqual({
        typ: 'GITHUB_PR_GEOEFFNET',
        projektId: PROJEKT,
        repository: 'acme/webshop',
        nummer: 7,
        titel: 'Login reparieren',
        autor: 'octocat',
      });
    });

    it('behandelt reopened wie opened', () => {
      expect(
        uebersetze('pull_request', { action: 'reopened', ...pr({}) }, PROJEKT),
      ).toMatchObject({ typ: 'GITHUB_PR_GEOEFFNET' });
    });

    /**
     * ========================================================================
     * DER WICHTIGSTE TEST DIESER DATEI
     * ========================================================================
     * GitHub schickt fuer "zusammengefuehrt" und fuer "verworfen" DASSELBE
     * `action: closed`. Unterschieden werden sie nur am Feld `merged`.
     *
     * Waeren beide derselbe Ereignistyp, stuende im Feed "hat den Pull Request
     * geschlossen" - auch dann, wenn er zusammengefuehrt wurde. Fachlich sind
     * das zwei verschiedene Dinge.
     */
    it('unterscheidet zusammengefuehrt von verworfen', () => {
      expect(
        uebersetze(
          'pull_request',
          { action: 'closed', ...pr({ merged: true }) },
          PROJEKT,
        ),
      ).toMatchObject({ typ: 'GITHUB_PR_ZUSAMMENGEFUEHRT' });

      expect(
        uebersetze(
          'pull_request',
          { action: 'closed', ...pr({ merged: false }) },
          PROJEKT,
        ),
      ).toMatchObject({ typ: 'GITHUB_PR_GESCHLOSSEN' });
    });

    it('behandelt ein fehlendes merged als verworfen', () => {
      // Strikt `=== true` und nicht wahrheitswertig gepreuft: Ein fehlendes
      // Feld darf nicht als "zusammengefuehrt" durchgehen. Im Zweifel die
      // schwaechere Behauptung.
      expect(
        uebersetze('pull_request', { action: 'closed', ...pr({}) }, PROJEKT),
      ).toMatchObject({ typ: 'GITHUB_PR_GESCHLOSSEN' });
    });

    it.each([
      'synchronize',
      'edited',
      'labeled',
      'assigned',
      'review_requested',
    ])('ignoriert die Aktion %s', (action) => {
      // Sie wuerden den Feed fluten, ohne etwas zu erzaehlen - `synchronize`
      // kommt bei JEDEM weiteren Commit an einem offenen Pull Request.
      expect(
        uebersetze('pull_request', { action, ...pr({}) }, PROJEKT),
      ).toBeNull();
    });

    it('ignoriert einen Pull Request ohne Nummer oder Titel', () => {
      expect(
        uebersetze(
          'pull_request',
          { action: 'opened', repository: repo, pull_request: { number: 7 } },
          PROJEKT,
        ),
      ).toBeNull();

      expect(
        uebersetze(
          'pull_request',
          { action: 'opened', repository: repo, pull_request: { title: 'X' } },
          PROJEKT,
        ),
      ).toBeNull();
    });
  });

  describe('was nicht uebersetzt wird', () => {
    it.each(['ping', 'star', 'fork', 'workflow_run', 'issues'])(
      'liefert null fuer %s',
      (typ) => {
        expect(
          uebersetze(typ, { repository: repo, sender }, PROJEKT),
        ).toBeNull();
      },
    );

    it('liefert null ohne Repository-Angabe', () => {
      expect(
        uebersetze('push', { ref: 'refs/heads/main', sender }, PROJEKT),
      ).toBeNull();
    });

    /**
     * Der Test, der belegt, dass die Funktion fremde Eingabe wirklich
     * aushaelt. Jeder dieser Werte wuerde bei einem direkten Zugriff wie
     * `nutzlast.repository.full_name` einen Absturz erzeugen - und zwar in der
     * VERARBEITUNG, also lange nachdem die Zustellung quittiert wurde.
     */
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['eine Zahl', 42],
      ['eine Zeichenkette', 'kein Objekt'],
      ['ein Array', []],
      ['ein leeres Objekt', {}],
      ['repository als Zeichenkette', { repository: 'acme/webshop' }],
      ['full_name als Zahl', { repository: { full_name: 7 } }],
      ['full_name leer', { repository: { full_name: '' } }],
    ])('stuerzt bei %s nicht ab', (_fall, nutzlast) => {
      expect(() => uebersetze('push', nutzlast, PROJEKT)).not.toThrow();
      expect(uebersetze('push', nutzlast, PROJEKT)).toBeNull();
    });
  });
});
