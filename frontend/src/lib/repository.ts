'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth-context';
import { projektKey } from './projekte';

/** Die Verbindung, wie das Backend sie herausgibt - ohne Geheimnis. */
export interface RepositoryVerbindung {
  id: string;
  repositoryFullName: string;
  webhookUrl: string;
  createdAt: string;
}

/**
 * Die Antwort auf das ANLEGEN - einmalig mit Geheimnis im Klartext.
 *
 * Ein eigener Typ und kein optionales Feld an `RepositoryVerbindung`. Dieselbe
 * Entscheidung wie im Backend: Ein `geheimnis?: string` waere die Einladung,
 * es versehentlich auch beim Lesen zu erwarten - und niemand saehe es dem Typ
 * an.
 */
export interface VerbindungMitGeheimnis extends RepositoryVerbindung {
  geheimnis: string;
}

export const repositoryKey = (orgId: string, projektId: string) =>
  [...projektKey(orgId, projektId), 'repository'] as const;

/**
 * Liest die Verbindung eines Projekts.
 *
 * ============================================================================
 * WARUM `null` HIER KEIN FEHLER IST
 * ============================================================================
 * Das Backend antwortet mit `200` und einem leeren Koerper, wenn das Projekt
 * kein Repository hat. Das ist eine gueltige Auskunft ueber ein existierendes
 * Projekt, kein Fehler - eine 404 waere mehrdeutig gewesen ("Projekt gibt es
 * nicht" oder "Verbindung gibt es nicht").
 *
 * TanStack Query braucht dafuer `?? null`: `undefined` als Ergebnis waere fuer
 * die Bibliothek "noch nichts da", nicht "nachweislich nichts".
 */
export function useRepository(orgId: string, projektId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: repositoryKey(orgId, projektId),
    queryFn: async () => {
      const antwort = await authFetch<RepositoryVerbindung | null>(
        `/organizations/${orgId}/projects/${projektId}/repository`,
      );

      return antwort ?? null;
    },
  });
}

export function useRepositoryVerbinden(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryFullName: string) =>
      authFetch<VerbindungMitGeheimnis>(
        `/organizations/${orgId}/projects/${projektId}/repository`,
        { method: 'POST', body: JSON.stringify({ repositoryFullName }) },
      ),

    /**
     * ========================================================================
     * DAS GEHEIMNIS WIRD BEWUSST NICHT IN DEN ZWISCHENSPEICHER GELEGT
     * ========================================================================
     * Naheliegend waere `queryClient.setQueryData(key, ergebnis)` - dann
     * spart man sich das erneute Laden. Damit laege das Geheimnis aber im
     * Zwischenspeicher, also im Speicher des Browsers, und jede Komponente,
     * die diese Abfrage liest, bekaeme es mit.
     *
     * Stattdessen wird die Abfrage fuer ungueltig erklaert: Das Backend
     * liefert die Verbindung dann OHNE Geheimnis nach. Der Klartext lebt nur
     * im Zustand der Komponente, die ihn anzeigt, und verschwindet mit ihr.
     */
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: repositoryKey(orgId, projektId),
      }),
  });
}

export function useRepositoryTrennen(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      authFetch<void>(
        `/organizations/${orgId}/projects/${projektId}/repository`,
        { method: 'DELETE' },
      ),

    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: repositoryKey(orgId, projektId),
      }),
  });
}
