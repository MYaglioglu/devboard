'use client';

import { Avatar } from '@/components/avatar';
import { useAktivitaeten } from '@/lib/aktivitaeten';
import { akteurName, ereignisSatz } from '@/lib/feed-satz';
import type { FeedEintrag } from '@/lib/aktivitaeten';

/**
 * Der Aktivitaets-Feed mit "Mehr laden".
 *
 * ============================================================================
 * WARUM EIN KNOPF UND KEIN NACHLADEN BEIM SCROLLEN
 * ============================================================================
 * "Infinite Scroll" waere mit `useInfiniteQuery` genauso wenig Code - ein
 * `IntersectionObserver` am unteren Rand, fertig. Der Knopf ist trotzdem die
 * bessere Wahl, und zwar aus drei Gruenden:
 *
 *   1. Ein Feed, der beim Scrollen weiterwaechst, hat kein Ende. Alles, was
 *      unter ihm auf der Seite steht, wird unerreichbar.
 *   2. Mit der Tastatur ist er nur schwer zu bedienen: Der Fokus springt beim
 *      Nachladen, und ein Screenreader bekommt nicht mitgeteilt, dass etwas
 *      dazugekommen ist.
 *   3. Nachladen soll eine ENTSCHEIDUNG sein. Beim Scrollen laedt der Nutzer
 *      Daten, die er nie sehen wollte - auf einer Mobilverbindung sein
 *      Datenvolumen.
 *
 * Wer es doch will, kann den Knopf spaeter mit einem Beobachter kombinieren.
 * Umgekehrt ist es schwerer.
 */
export function AktivitaetsFeed({
  orgId,
  projektId,
}: {
  orgId: string | undefined;
  projektId?: string;
}) {
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAktivitaeten(orgId, projektId);

  if (isError) {
    return (
      <p className="text-sm text-red-600">
        Die Aktivitäten konnten nicht geladen werden.
      </p>
    );
  }

  if (isPending) {
    return <p className="text-sm text-zinc-500">Lade …</p>;
  }

  // Die Seiten werden erst hier zusammengelegt, nicht im Haken: `data.pages`
  // ist die ehrliche Form dessen, was geladen wurde. Wer sie schon im Haken
  // flach macht, verliert die Information, wo eine Seite endet - und die
  // braucht man, sobald etwas schiefgeht.
  const eintraege = data.pages.flatMap((seite) => seite.items);

  if (eintraege.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Noch nichts passiert. Sobald jemand ein Projekt oder eine Aufgabe
        anlegt, steht es hier.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* `<ol>` und nicht `<div>`: Der Feed IST eine geordnete Liste - die
          Reihenfolge traegt Bedeutung. Ein Screenreader sagt damit an, um den
          wievielten von wie vielen Eintraegen es geht. */}
      <ol className="flex flex-col gap-3">
        {eintraege.map((eintrag) => (
          <Eintrag key={eintrag.id} eintrag={eintrag} />
        ))}
      </ol>

      {/* Der Knopf verschwindet von selbst: `hasNextPage` folgt daraus, dass
          das Backend `nextCursor: null` geliefert hat. Die Komponente muss
          nichts zaehlen und keine Gesamtzahl kennen - genau deshalb kommt die
          Cursor-Paginierung ohne ein teures COUNT aus. */}
      {hasNextPage && (
        <button
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm
            transition hover:bg-zinc-100 disabled:opacity-50
            dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
        </button>
      )}
    </div>
  );
}

function Eintrag({ eintrag }: { eintrag: FeedEintrag }) {
  const vonGitHub = eintrag.source === 'GITHUB';
  const repository = repositoryName(eintrag.payload);

  return (
    <li className="flex items-start gap-3">
      {/*
        ====================================================================
        DIE HERKUNFT IST EIN BILD, KEIN WORT
        ====================================================================
        Ein Abzeichen mit der Aufschrift "GitHub" waere eindeutiger und wuerde
        in einer langen Liste zwanzigmal dasselbe Wort wiederholen. Das Zeichen
        links unterscheidet die beiden Herkuenfte auf einen Blick, ohne den
        Satz zu verlaengern.

        Fuer Screenreader traegt es trotzdem einen Text - unten im `title`.
        Wer nicht sieht, dass da ein Logo steht, bekommt die Information als
        Wort.
      */}
      {vonGitHub ? <GitHubZeichen /> : <Akteur eintrag={eintrag} />}

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm">
          <span className="font-medium">{akteurName(eintrag)}</span>{' '}
          {ereignisSatz(eintrag)}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 text-xs text-still">
          {/* Das Repository steht hier und nicht im Satz: Es ist eine
              Ortsangabe wie das Datum eine Zeitangabe ist. Im Satz stuende es
              in einer Liste zwanzigmal mit. */}
          {repository && (
            <>
              <span className="font-mono">{repository}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <Zeitpunkt roh={eintrag.createdAt} />
        </p>
      </div>
    </li>
  );
}

/** Der Avatar des Akteurs - oder ein neutraler Kreis nach einer Kontoloeschung. */
function Akteur({ eintrag }: { eintrag: FeedEintrag }) {
  if (!eintrag.actor) {
    return (
      <span
        aria-hidden
        className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-dashed border-rand"
      />
    );
  }

  return (
    <span className="mt-0.5">
      <Avatar
        name={eintrag.actor.name ?? eintrag.actor.email}
        kennung={eintrag.actor.userId}
        groesse="klein"
      />
    </span>
  );
}

/**
 * Das GitHub-Zeichen.
 *
 * Als eingebettetes SVG und nicht ueber eine Icon-Bibliothek: Es ist das
 * einzige Logo im ganzen Projekt. Eine Abhaengigkeit fuer ein Zeichen waere
 * mehr Wartung als Nutzen.
 */
function GitHubZeichen() {
  return (
    <span
      title="Von GitHub"
      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-flaeche-gedaempft text-leise"
    >
      {/* `role="img"` mit `<title>`: Ohne das ist ein SVG fuer einen
          Screenreader nur eine Grafik ohne Bedeutung. */}
      <svg
        role="img"
        aria-label="GitHub"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 fill-current"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    </span>
  );
}

/** Liest `repository` vorsichtig aus dem `payload` - wie alles dort. */
function repositoryName(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const wert = (payload as Record<string, unknown>).repository;

  return typeof wert === 'string' && wert.length > 0 ? wert : null;
}

function Zeitpunkt({ roh }: { roh: string }) {
  const zeitpunkt = new Date(roh);

  return (
    <>
      {/* ====================================================================
          WARUM DAS DATUM IN EINEM <time> MIT dateTime STEHT
          ====================================================================
          Der sichtbare Text ist deutsch formatiert und fuer Maschinen nutzlos.
          `dateTime` traegt daneben die maschinenlesbare Form - dieselbe
          Trennung wie zwischen `payload` und dem Satz darueber.

          `suppressHydrationWarning`, weil die Formatierung von der Zeitzone
          des BROWSERS abhaengt. Der Server rendert in seiner eigenen und
          erzeugt damit einen anderen Text - React meldet das zu Recht als
          Abweichung. Hier ist sie gewollt: Die Uhrzeit des Nutzers ist die
          richtige, und der Serverwert wird ohnehin sofort ersetzt. */}
      <time dateTime={roh} suppressHydrationWarning>
        {zeitpunkt.toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
    </>
  );
}
