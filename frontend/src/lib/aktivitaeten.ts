'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { organisationKey } from './organisationen';
import { useAuth } from './auth-context';

/** Die Ereignistypen, die das Backend kennt. */
export type Ereignistyp =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_ARCHIVED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_MOVED'
  | 'TASK_DELETED'
  | 'GITHUB_PUSH'
  | 'GITHUB_PULL_REQUEST_OPENED'
  | 'GITHUB_PULL_REQUEST_MERGED'
  | 'GITHUB_PULL_REQUEST_CLOSED';

/**
 * Woher ein Ereignis stammt.
 *
 * ============================================================================
 * WARUM DAS FRONTEND DIESES FELD BRAUCHT
 * ============================================================================
 * `actor: null` hatte bisher genau eine Bedeutung - das Konto wurde geloescht,
 * und `akteurName` schreibt dafuer "Ein entferntes Mitglied".
 *
 * Ein GitHub-Ereignis hat ebenfalls keinen Akteur: Wer gepusht hat, muss in
 * DevBoard kein Konto haben. Ohne dieses Feld behauptete der Feed, ein
 * ausgetretener Kollege habe gepusht.
 *
 * Der Wert wird bewusst NICHT auf Vollstaendigkeit geprueft (kein `never`):
 * Kommt spaeter eine dritte Herkunft dazu, soll die alte Fassung im Browser
 * das ertragen - dieselbe Regel wie bei `Ereignistyp`.
 */
export type Herkunft = 'APP' | 'GITHUB';

export interface Akteur {
  userId: string;
  name: string | null;
  email: string;
}

/**
 * Ein Eintrag im Feed.
 *
 * ============================================================================
 * WARUM `payload` HIER `unknown` IST UND NICHT EIN GENAUER TYP
 * ============================================================================
 * Verlockend waere, die unterscheidbare Union aus dem Backend hier zu
 * spiegeln - dann waere `payload.fromStatus` bei `TASK_MOVED` typisiert.
 *
 * Das waere eine zweite Wahrheit, und zwar die gefaehrlichste Sorte: Sie ist
 * beim Schreiben richtig und wird still falsch, sobald das Backend das Feld
 * umbenennt. Der Compiler bemerkt davon nichts, weil er nur diese Kopie sieht.
 *
 * Was hier ankommt, ist JSON aus dem Netz - also `unknown`, bis es geprueft
 * wurde. Die Pruefung passiert an einer Stelle, in `satz.ts`, und ist dort
 * dagegen gewappnet, dass ein Feld fehlt. Ein Feed-Eintrag, dessen Einzelheit
 * nicht lesbar ist, soll einen allgemeineren Satz zeigen - nicht die Seite
 * mit einem Absturz beenden.
 *
 * (Der saubere Weg gegen beide Probleme waere ein aus dem Backend erzeugter
 * Typ - OpenAPI oder ein geteiltes Paket. Vermerkt in `06_BACKLOG.md`.)
 */
export interface FeedEintrag {
  id: string;
  type: Ereignistyp;
  source: Herkunft;
  actor: Akteur | null;
  projectId: string | null;
  taskId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface FeedSeite {
  items: FeedEintrag[];
  nextCursor: string | null;
}

export const feedKey = (orgId: string, projektId?: string) =>
  [
    ...organisationKey(orgId),
    'activity',
    { projektId: projektId ?? null },
  ] as const;

/**
 * Laedt den Aktivitaets-Feed - seitenweise.
 *
 * ============================================================================
 * useInfiniteQuery UND NICHT useQuery
 * ============================================================================
 * Der Unterschied ist nicht kosmetisch. `useQuery` haelt EIN Ergebnis; um
 * weiterzublaettern, muesste man die Seiten selbst in einem `useState`
 * sammeln, beim Wechsel der Organisation zuruecksetzen und beim Entwerten
 * wieder verwerfen. Genau diese Handarbeit ist die Stelle, an der solche
 * Listen doppelte Eintraege zeigen.
 *
 * `useInfiniteQuery` haelt die Seiten als Liste im Zwischenspeicher und weiss,
 * wie es die naechste holt (`getNextPageParam`). Der Cursor ist fuer das
 * Frontend dabei eine undurchsichtige Zeichenkette - es liest ihn nie, es
 * reicht ihn zurueck. Genau so ist er im Backend gemeint.
 *
 * `initialPageParam: null` heisst "erste Seite, kein Cursor". Ohne diesen Wert
 * verlangte TanStack Query trotzdem einen - und `undefined` waere in der URL
 * als Zeichenkette "undefined" gelandet.
 */
export function useAktivitaeten(orgId: string | undefined, projektId?: string) {
  const { authFetch } = useAuth();

  return useInfiniteQuery({
    queryKey: feedKey(orgId ?? 'keine', projektId),
    queryFn: ({ pageParam }) => {
      const parameter = new URLSearchParams({ limit: '20' });
      // `URLSearchParams` kodiert den Cursor mit. Ihn von Hand an die URL zu
      // haengen waere die Stelle, an der ein Sonderzeichen die Anfrage
      // beschaedigt - das Backend kodiert deshalb base64url, aber sich darauf
      // zu verlassen waere eine Abhaengigkeit auf ein Detail der Gegenseite.
      if (pageParam) parameter.set('cursor', pageParam);
      if (projektId) parameter.set('projectId', projektId);

      return authFetch<FeedSeite>(
        `/organizations/${orgId}/activity?${parameter.toString()}`,
      );
    },
    initialPageParam: null as string | null,
    // `nextCursor: null` heisst ausdruecklich "keine weitere Seite" - und
    // `undefined` zurueckzugeben ist das Signal, mit dem TanStack Query
    // `hasNextPage` auf false setzt. Der Knopf verschwindet dadurch von
    // selbst, ohne dass die Komponente zaehlen muesste.
    getNextPageParam: (letzte) => letzte.nextCursor ?? undefined,
    enabled: Boolean(orgId),
    retry: false,
  });
}
