'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth-context';

/** Die Rollen, wie das Backend sie liefert. */
export type Rolle = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Organisation {
  id: string;
  name: string;
  /** Die Rolle des ANGEMELDETEN Nutzers in dieser Organisation. */
  role: Rolle;
  createdAt: string;
}

/**
 * Der Schluessel, unter dem TanStack Query die Organisationsliste ablegt.
 *
 * ============================================================================
 * WARUM DER SCHLUESSEL AN EINER STELLE STEHT
 * ============================================================================
 * Nach dem Anlegen einer Organisation muss die Liste neu geladen werden. Das
 * geschieht ueber `invalidateQueries({ queryKey: ... })` - und dieser
 * Schluessel muss ZEICHENGENAU mit dem der Abfrage uebereinstimmen.
 *
 * Steht er an zwei Stellen getippt, ist ein Tippfehler kein Fehler, sondern
 * eine Liste, die sich nicht aktualisiert: Die Anwendung funktioniert, zeigt
 * aber veraltete Daten. Solche Fehler sucht man lange.
 *
 * Als Konstante ist der Zusammenhang eine Compiler-Sache - dasselbe Prinzip
 * wie ORG_PARAM im Backend.
 */
export const ORGANISATIONEN_KEY = ['organizations'] as const;

/** Laedt die Organisationen des angemeldeten Nutzers. */
export function useOrganisationen() {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: ORGANISATIONEN_KEY,
    queryFn: () => authFetch<Organisation[]>('/organizations'),
  });
}

/**
 * Legt eine Organisation an.
 *
 * ============================================================================
 * WARUM HIER KEIN OPTIMISTISCHES UPDATE STEHT
 * ============================================================================
 * Optimistisch hiesse: die neue Organisation sofort in die Liste schreiben und
 * erst danach den Server fragen. Das lohnt sich, wenn eine Handlung SEHR
 * haeufig ist und ein Fehlschlag unwahrscheinlich - beim Verschieben einer
 * Karte auf einem Kanban-Board zum Beispiel, wo jede Verzoegerung stoert.
 *
 * Eine Organisation legt man selten an, und der Server vergibt die ID. Ein
 * optimistischer Eintrag muesste also mit einer erfundenen ID leben und sie
 * spaeter austauschen - Aufwand und Fehlerquelle ohne spuerbaren Gewinn.
 *
 * Deshalb hier der einfache Weg: abwarten, dann `invalidateQueries`. Das
 * optimistische Update kommt in Sprint 3, wo es hingehoert.
 */
export function useOrganisationAnlegen() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      authFetch<Organisation>('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      // Markiert die Liste als veraltet - TanStack Query laedt sie neu, sobald
      // sie angezeigt wird. Ohne diese Zeile bliebe die neue Organisation
      // unsichtbar, bis der Nutzer die Seite neu laedt.
      void queryClient.invalidateQueries({ queryKey: ORGANISATIONEN_KEY });
    },
  });
}
