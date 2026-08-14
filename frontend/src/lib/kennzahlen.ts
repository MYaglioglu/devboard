'use client';

import { useQuery } from '@tanstack/react-query';

import { organisationKey } from './organisationen';
import { useAuth } from './auth-context';

/** Die Kennzahlen, wie das Backend sie liefert. */
export interface Kennzahlen {
  projects: { active: number; archived: number };
  tasks: { todo: number; inProgress: number; done: number; open: number };
}

export const kennzahlenKey = (orgId: string) =>
  [...organisationKey(orgId), 'dashboard', 'stats'] as const;

/**
 * Laedt die Kennzahlen einer Organisation.
 *
 * ============================================================================
 * WARUM `open` NICHT HIER BERECHNET WIRD
 * ============================================================================
 * `open` ist `todo + inProgress` - man koennte es im Frontend addieren und
 * eine Zahl weniger uebertragen. Das Backend liefert es trotzdem, und diese
 * Seite rechnet nicht nach.
 *
 * Der Grund ist nicht der Aufwand, sondern die ZWEITE STELLE: Kommt ein
 * vierter Status dazu, muesste die Summe an beiden Orten geaendert werden -
 * und der zweite wird vergessen. Dann zeigt das Dashboard eine Zahl, die
 * niemand mehr erklaeren kann, und niemand merkt es, weil sie plausibel
 * aussieht.
 *
 * Merksatz: Eine abgeleitete Zahl gehoert dorthin, wo die Grundlage liegt.
 */
export function useKennzahlen(orgId: string | undefined) {
  const { authFetch } = useAuth();

  return useQuery({
    // `orgId!` ist hier sicher, weil `enabled` die Abfrage sonst gar nicht
    // startet. Der Schluessel wird trotzdem gebildet - TanStack Query braucht
    // ihn auch im abgeschalteten Zustand.
    queryKey: kennzahlenKey(orgId ?? 'keine'),
    queryFn: () =>
      authFetch<Kennzahlen>(`/organizations/${orgId}/dashboard/stats`),
    // Ohne `enabled` liefe die Abfrage gegen `/organizations/undefined/...`,
    // solange die Organisationsliste noch laedt - eine sichere 400 oder 404,
    // die der Nutzer als Fehler zu sehen bekaeme, obwohl nur noch nichts da
    // ist.
    enabled: Boolean(orgId),
    retry: false,
  });
}
