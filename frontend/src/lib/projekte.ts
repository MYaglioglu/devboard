'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth-context';
import { organisationKey } from './organisationen';

/** Ein Projekt, wie das Backend es liefert. */
export interface Projekt {
  id: string;
  name: string;
  description: string | null;
  /** Gesetzt heisst archiviert. Das Backend loescht Projekte nie. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Der Schluessel fuer die Projektliste einer Organisation.
 *
 * ============================================================================
 * WARUM DER MANDANT IM SCHLUESSEL STEHT
 * ============================================================================
 * TanStack Query legt Daten unter dem Schluessel im Arbeitsspeicher ab. Waere
 * es nur `['projects']`, saehe ein Nutzer nach dem Wechsel der aktiven
 * Organisation fuer einen Moment die Projekte der VORIGEN - aus dem
 * Zwischenspeicher, ohne dass eine Anfrage laeuft.
 *
 * Das waere kein Sicherheitsloch (die Daten hatte er legitim), aber ein
 * sichtbarer Fehler an genau der Stelle, an der Mandantentrennung wichtig ist.
 * Mit `organisationKey(orgId)` als Praefix hat jede Organisation ihren eigenen
 * Speicherplatz.
 *
 * Der Praefix hat einen zweiten Nutzen: `invalidateQueries` mit
 * `organisationKey(orgId)` trifft die Organisation samt Mitgliedern UND
 * Projekten - dieselbe Praefix-Regel wie bei einem zusammengesetzten
 * Datenbankindex.
 */
export const projekteKey = (orgId: string, auchArchivierte: boolean) =>
  [...organisationKey(orgId), 'projects', { auchArchivierte }] as const;

export const projektKey = (orgId: string, projektId: string) =>
  [...organisationKey(orgId), 'projects', projektId] as const;

/**
 * Laedt die Projekte einer Organisation.
 *
 * Der Parameter steckt im Schluessel, nicht nur in der URL: Sonst lieferte die
 * Abfrage nach dem Umschalten von "mit Archivierten" auf "ohne" den alten
 * Stand aus dem Zwischenspeicher, weil TanStack Query beide fuer dieselbe
 * Abfrage hielte.
 */
export function useProjekte(orgId: string, auchArchivierte = false) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: projekteKey(orgId, auchArchivierte),
    queryFn: () =>
      authFetch<Projekt[]>(
        `/organizations/${orgId}/projects${
          auchArchivierte ? '?includeArchived=true' : ''
        }`,
      ),
    retry: false,
  });
}

/** Laedt ein einzelnes Projekt. */
export function useProjekt(orgId: string, projektId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: projektKey(orgId, projektId),
    queryFn: () =>
      authFetch<Projekt>(`/organizations/${orgId}/projects/${projektId}`),
    // Bei 404 nicht wiederholen: Das ist keine Stoerung, sondern die Aussage
    // "gibt es fuer dich nicht". Ein zweiter Versuch aendert daran nichts.
    retry: false,
  });
}

/**
 * Legt ein Projekt an. Nur OWNER und ADMIN - sonst antwortet das Backend 403.
 *
 * Bewusst ohne optimistisches Update: Die ID vergibt der Server, ein
 * vorlaeufiger Eintrag muesste mit einer erfundenen ID leben und sie spaeter
 * austauschen. Projekte legt man selten an; der Gewinn stuende in keinem
 * Verhaeltnis. Optimistisch wird das Verschieben auf dem Board (Scheibe 3.6),
 * wo jede Verzoegerung stoert und die ID bereits existiert.
 */
export function useProjektAnlegen(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (daten: { name: string; description?: string }) =>
      authFetch<Projekt>(`/organizations/${orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify(daten),
      }),
    onSuccess: () => {
      // Entwertet BEIDE Listen (mit und ohne Archivierte) ueber den
      // gemeinsamen Praefix. Nur die gerade sichtbare zu entwerten, hiesse:
      // Nach dem Umschalten steht der alte Stand da.
      void queryClient.invalidateQueries({
        queryKey: [...organisationKey(orgId), 'projects'],
      });
    },
  });
}

/** Benennt ein Projekt um oder aendert seine Beschreibung. */
export function useProjektAendern(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (daten: { name?: string; description?: string | null }) =>
      authFetch<Projekt>(`/organizations/${orgId}/projects/${projektId}`, {
        method: 'PATCH',
        body: JSON.stringify(daten),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...organisationKey(orgId), 'projects'],
      });
    },
  });
}

/**
 * Archiviert ein Projekt.
 *
 * Der Endpoint heisst DELETE, geloescht wird nichts - das Backend setzt nur
 * `archivedAt`. Die Oberflaeche sagt deshalb "archivieren" und nicht
 * "loeschen": Sie soll beschreiben, was PASSIERT, nicht welche HTTP-Methode
 * darunter liegt.
 */
export function useProjektArchivieren(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projektId: string) =>
      authFetch<void>(`/organizations/${orgId}/projects/${projektId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...organisationKey(orgId), 'projects'],
      });
    },
  });
}
