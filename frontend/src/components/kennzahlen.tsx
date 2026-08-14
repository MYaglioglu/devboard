'use client';

import { useKennzahlen } from '@/lib/kennzahlen';

/**
 * Die Kennzahlen-Kacheln auf dem Dashboard.
 *
 * ============================================================================
 * WARUM HIER KEIN LADE-PLATZHALTER MIT "0" STEHT
 * ============================================================================
 * Waehrend die Zahlen laden, waere es bequem, einfach `0` anzuzeigen und sie
 * spaeter zu ersetzen. Das ist falsch, und der Grund ist nicht Aesthetik:
 * `0 offene Aufgaben` ist eine AUSSAGE. Sie ist waehrend des Ladens schlicht
 * unwahr, und der Nutzer kann sie nicht von der echten Null unterscheiden.
 *
 * Ein Strich sagt "noch nicht bekannt". Der Unterschied zwischen "nichts da"
 * und "noch nicht geladen" ist derselbe wie zwischen `nextCursor: null` und
 * `undefined` im Backend - und beides Mal ist die Verwechslung teuer.
 */
export function KennzahlenKacheln({ orgId }: { orgId: string | undefined }) {
  const { data, isPending, isError } = useKennzahlen(orgId);

  if (isError) {
    return (
      <p className="text-sm text-red-600">
        Die Kennzahlen konnten nicht geladen werden.
      </p>
    );
  }

  // `isPending` deckt auch den Fall ab, dass `orgId` noch fehlt und die
  // Abfrage per `enabled` gar nicht laeuft - eine abgeschaltete Abfrage gilt
  // in TanStack Query als ausstehend, nicht als fertig.
  const wert = (zahl: number | undefined) =>
    isPending || zahl === undefined ? '–' : zahl.toLocaleString('de-DE');

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Kachel
        bezeichnung="Projekte"
        wert={wert(data?.projects.active)}
        hinweis={
          data && data.projects.archived > 0
            ? `${data.projects.archived} archiviert`
            : undefined
        }
      />
      <Kachel
        bezeichnung="Offene Aufgaben"
        wert={wert(data?.tasks.open)}
        // Die Aufschluesselung als Hinweis, nicht als eigene Kachel: Sie
        // erklaert die grosse Zahl darueber, statt mit ihr um Aufmerksamkeit
        // zu konkurrieren.
        hinweis={
          data
            ? `${data.tasks.todo} offen · ${data.tasks.inProgress} in Arbeit`
            : undefined
        }
        betont
      />
      <Kachel bezeichnung="In Arbeit" wert={wert(data?.tasks.inProgress)} />
      <Kachel bezeichnung="Erledigt" wert={wert(data?.tasks.done)} />
    </div>
  );
}

function Kachel({
  bezeichnung,
  wert,
  hinweis,
  betont = false,
}: {
  bezeichnung: string;
  wert: string;
  hinweis?: string;
  betont?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        betont
          ? 'border-zinc-900 dark:border-zinc-100'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <p className="text-xs font-medium text-zinc-500">{bezeichnung}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{wert}</p>
      {/* `tabular-nums` laesst alle Ziffern gleich breit laufen. Ohne das
          springt die Zahl beim Aktualisieren seitlich, weil eine 1 schmaler
          ist als eine 8 - bei Kennzahlen, die sich aendern, gut sichtbar. */}
      {hinweis && <p className="mt-1 text-xs text-zinc-500">{hinweis}</p>}
    </div>
  );
}
