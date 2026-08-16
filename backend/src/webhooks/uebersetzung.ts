import type { Ereignis } from '../activities/ereignisse';

/**
 * ============================================================================
 * AUS EINER GITHUB-NUTZLAST EIN EREIGNIS MACHEN - REINE RECHNUNG
 * ============================================================================
 * Kein Prisma, kein NestJS, kein `await`. Dieselbe Trennung wie bei
 * `krypto.ts`, `signatur.ts` und `feed-satz.ts` im Frontend.
 *
 * ============================================================================
 * WARUM HIER ALLES `unknown` IST
 * ============================================================================
 * Was hier ankommt, ist JSON aus dem Internet. Es hat eine gueltige Signatur -
 * das heisst, es kommt von jemandem, der das Geheimnis kennt. Es heisst NICHT,
 * dass es die Form hat, die die GitHub-Dokumentation beschreibt.
 *
 * Ein Zugriff wie `nutzlast.repository.full_name` waere ein Absturz, sobald
 * GitHub ein Feld umbenennt oder ein Ereignis in einer Variante schickt, die
 * wir nicht kennen. Und der Absturz traefe die VERARBEITUNG - also die Stelle,
 * an der die Zustellung bereits sicher in der Tabelle liegt.
 *
 * Deshalb: lesen, was da ist, und `null` liefern, wenn es nicht reicht. `null`
 * heisst "daraus mache ich keinen Feed-Eintrag" - nicht "Fehler". Der
 * Unterschied entscheidet, ob eine Zustellung als PROCESSED oder als FAILED
 * endet.
 */

/** Liest ein verschachteltes Feld, ohne bei fehlenden Zwischenstufen zu werfen. */
const lies = (wert: unknown, ...pfad: string[]): unknown => {
  let aktuell = wert;

  for (const stufe of pfad) {
    if (typeof aktuell !== 'object' || aktuell === null) {
      return undefined;
    }

    aktuell = (aktuell as Record<string, unknown>)[stufe];
  }

  return aktuell;
};

const text = (wert: unknown, ...pfad: string[]): string | null => {
  const gelesen = lies(wert, ...pfad);

  // Auch ein leerer Text zaehlt als "nicht da": Ein Feed-Eintrag mit leerem
  // Zweignamen ist schlechter als einer ohne.
  return typeof gelesen === 'string' && gelesen.length > 0 ? gelesen : null;
};

const zahl = (wert: unknown, ...pfad: string[]): number | null => {
  const gelesen = lies(wert, ...pfad);

  return typeof gelesen === 'number' && Number.isFinite(gelesen)
    ? gelesen
    : null;
};

/**
 * `refs/heads/main` -> `main`.
 *
 * Bewusst mit `startsWith` statt mit `split('/').pop()`: Ein Zweig darf
 * Schraegstriche enthalten (`feature/login/neu`), und `pop()` lieferte dann
 * nur das letzte Stueck. Ein Tag (`refs/tags/v1`) wird gar nicht erst als
 * Zweig ausgegeben.
 */
const zweigName = (ref: string | null): string | null => {
  const praefix = 'refs/heads/';

  return ref && ref.startsWith(praefix) && ref.length > praefix.length
    ? ref.slice(praefix.length)
    : null;
};

/**
 * Uebersetzt eine Zustellung in ein Ereignis - oder `null`.
 *
 * `null` bedeutet ausdruecklich NICHT "Fehler". Es bedeutet: Aus dieser
 * Zustellung entsteht kein Feed-Eintrag. Drei Faelle fallen darunter:
 *
 *   - ein Ereignistyp, den wir nicht anzeigen (`ping`, `star`, `fork`, …)
 *   - eine Aktion, die uns nicht interessiert (`pull_request` mit
 *     `action: synchronize` - jeder weitere Commit an einem offenen PR)
 *   - eine Nutzlast, aus der sich das Noetige nicht lesen laesst
 *
 * Der dritte Fall ist der interessante: Er koennte ein Fehler sein. Wir
 * behandeln ihn trotzdem als "nichts anzuzeigen", und der Grund steht in
 * `webhook-verarbeitung.service.ts`: Eine Zustellung, die wir nicht deuten
 * koennen, ist kein Grund, sie ewig zu wiederholen. Sie bleibt in der Tabelle,
 * und man kann sie ansehen.
 */
export function uebersetze(
  ereignisTyp: string,
  nutzlast: unknown,
  projektId: string,
): Ereignis | null {
  const repository = text(nutzlast, 'repository', 'full_name');

  if (!repository) {
    return null;
  }

  switch (ereignisTyp) {
    case 'push':
      return uebersetzePush(nutzlast, projektId, repository);

    case 'pull_request':
      return uebersetzePullRequest(nutzlast, projektId, repository);

    // Alles andere - ping, star, fork, workflow_run, ... Bewusst KEINE
    // Vollstaendigkeitspruefung mit `never`: Die Liste der GitHub-Ereignisse
    // gehoert uns nicht, sie waechst ohne unser Zutun. Hier gilt dieselbe
    // Regel wie im Frontend - beim EMPFANGEN nicht auf Vollstaendigkeit
    // pruefen.
    default:
      return null;
  }
}

function uebersetzePush(
  nutzlast: unknown,
  projektId: string,
  repository: string,
): Ereignis | null {
  const zweig = zweigName(text(nutzlast, 'ref'));

  // Ein Push auf ein Tag oder das Loeschen eines Zweigs hat keinen Zweignamen
  // in dieser Form - dafuer gibt es keinen sinnvollen Satz im Feed.
  if (!zweig) {
    return null;
  }

  const commits = lies(nutzlast, 'commits');

  return {
    typ: 'GITHUB_PUSH',
    projektId,
    repository,
    zweig,
    anzahlCommits: Array.isArray(commits) ? commits.length : 0,
    // `sender.login` und nicht `pusher.name`: `pusher` traegt bei GitHub den
    // Namen aus der Git-Konfiguration, also frei waehlbaren Text. `sender` ist
    // das GitHub-Konto, das die Aktion ausgeloest hat.
    autor: text(nutzlast, 'sender', 'login'),
  };
}

function uebersetzePullRequest(
  nutzlast: unknown,
  projektId: string,
  repository: string,
): Ereignis | null {
  const aktion = text(nutzlast, 'action');
  const nummer = zahl(nutzlast, 'pull_request', 'number');
  const titel = text(nutzlast, 'pull_request', 'title');

  if (!aktion || nummer === null || !titel) {
    return null;
  }

  const gemeinsam = {
    projektId,
    repository,
    nummer,
    titel,
    autor: text(nutzlast, 'sender', 'login'),
  } as const;

  switch (aktion) {
    case 'opened':
    case 'reopened':
      return { typ: 'GITHUB_PR_GEOEFFNET', ...gemeinsam };

    /**
     * ========================================================================
     * `closed` IST ZWEI EREIGNISSE - UND GITHUB SAGT NICHT WELCHES
     * ========================================================================
     * GitHub schickt sowohl fuer "zusammengefuehrt" als auch fuer "verworfen"
     * `action: closed`. Unterschieden werden sie nur am Feld `merged`.
     *
     * Fachlich sind das zwei verschiedene Dinge, und ein Feed, in dem man sie
     * nur durch Lesen des `payload` auseinanderhaelt, ist nicht filterbar.
     * Deshalb zwei Ereignistypen - siehe der Kommentar am Enum im Schema.
     */
    case 'closed':
      return lies(nutzlast, 'pull_request', 'merged') === true
        ? { typ: 'GITHUB_PR_ZUSAMMENGEFUEHRT', ...gemeinsam }
        : { typ: 'GITHUB_PR_GESCHLOSSEN', ...gemeinsam };

    // `synchronize` (weiterer Commit), `edited`, `labeled`, `assigned`, ...
    // Sie wuerden den Feed fluten, ohne etwas zu erzaehlen.
    default:
      return null;
  }
}
