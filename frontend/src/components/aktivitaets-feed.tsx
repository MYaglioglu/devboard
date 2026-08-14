'use client';

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
  const zeitpunkt = new Date(eintrag.createdAt);

  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-800">
      <p className="text-sm">
        <span className="font-medium">{akteurName(eintrag)}</span>{' '}
        {ereignisSatz(eintrag)}
      </p>

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
      <time
        dateTime={eintrag.createdAt}
        suppressHydrationWarning
        className="text-xs text-zinc-500"
      >
        {zeitpunkt.toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
    </li>
  );
}
