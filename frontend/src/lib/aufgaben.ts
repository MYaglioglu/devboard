'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiFehler } from './api';
import { useAuth } from './auth-context';
import { projektKey } from './projekte';
import type { Verschiebung } from './board-logik';

export type AufgabenStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface Zustaendiger {
  userId: string;
  name: string | null;
  email: string;
}

export interface Aufgabe {
  id: string;
  title: string;
  description: string | null;
  status: AufgabenStatus;
  /**
   * Die Sortierposition - als ZEICHENKETTE.
   *
   * In der Datenbank ist sie `numeric(65,30)`; JSON kennt nur `float64` und
   * wuerde 30 Nachkommastellen runden. Fuer das Frontend ist der Wert eine
   * undurchsichtige Kennung: Es rechnet nie damit, sondern schickt beim
   * Verschieben die IDs der Nachbarn.
   */
  position: string;
  /** Der Stand, gegen den der Server beim Verschieben prueft. */
  version: number;
  assignee: Zustaendiger | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const aufgabenKey = (orgId: string, projektId: string) =>
  [...projektKey(orgId, projektId), 'tasks'] as const;

/** Laedt alle Aufgaben eines Projekts - die Board-Abfrage. */
export function useAufgaben(orgId: string, projektId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: aufgabenKey(orgId, projektId),
    queryFn: () =>
      authFetch<Aufgabe[]>(
        `/organizations/${orgId}/projects/${projektId}/tasks`,
      ),
    retry: false,
  });
}

/** Legt eine Aufgabe an - jedes Mitglied darf das. */
export function useAufgabeAnlegen(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (daten: { title: string; status: AufgabenStatus }) =>
      authFetch<Aufgabe>(
        `/organizations/${orgId}/projects/${projektId}/tasks`,
        { method: 'POST', body: JSON.stringify(daten) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aufgabenKey(orgId, projektId),
      });
    },
  });
}

/** Loescht eine Aufgabe - hier wird wirklich geloescht, nicht archiviert. */
export function useAufgabeLoeschen(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (aufgabenId: string) =>
      authFetch<void>(
        `/organizations/${orgId}/projects/${projektId}/tasks/${aufgabenId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aufgabenKey(orgId, projektId),
      });
    },
  });
}

/**
 * Verschiebt eine Karte - OPTIMISTISCH.
 *
 * ============================================================================
 * WARUM HIER OPTIMISTISCH UND BEI PROJEKTEN NICHT
 * ============================================================================
 * Optimistisch heisst: Die Anzeige aendert sich SOFORT, die Anfrage laeuft
 * daneben. Das lohnt sich, wenn drei Dinge zusammenkommen - und beim
 * Verschieben einer Karte kommen sie zusammen:
 *
 *   1. Die Handlung ist haeufig. Ein Board wird staendig umsortiert.
 *   2. Ein Fehlschlag ist selten. Der Normalfall gelingt.
 *   3. Die Verzoegerung waere spuerbar. Eine Karte, die nach dem Loslassen
 *      kurz zurueckspringt und dann doch am Ziel landet, sieht kaputt aus.
 *
 * Beim Anlegen eines Projekts fehlt Punkt 1 und 3, und die ID vergibt der
 * Server - dort waere optimistisch nur Aufwand.
 *
 * ============================================================================
 * DIE DREI RUECKRUFE - UND WARUM JEDER GEBRAUCHT WIRD
 * ============================================================================
 * `onMutate`   Vorher: laufende Abfragen abbrechen, aktuellen Stand sichern,
 *              Vorschau schreiben.
 * `onError`    Bei einem Fehler: gesicherten Stand zurueckschreiben (Rollback).
 * `onSettled`  Danach IMMER: Abfrage entwerten, damit die echten Positionen
 *              und die neue Version vom Server kommen.
 *
 * `cancelQueries` in `onMutate` ist der Teil, den man am leichtesten vergisst:
 * Laeuft gerade eine Board-Abfrage, kaeme ihre Antwort NACH unserer Vorschau
 * an und ueberschriebe sie mit dem alten Stand. Die Karte spraenge sichtbar
 * zurueck, und der Fehler waere nur unter Last reproduzierbar.
 */
export function useAufgabeVerschieben(orgId: string, projektId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();
  const key = aufgabenKey(orgId, projektId);

  return useMutation({
    mutationFn: ({
      aufgabenId,
      verschiebung,
    }: {
      aufgabenId: string;
      verschiebung: Verschiebung;
      vorschau: Aufgabe[];
    }) =>
      authFetch<Aufgabe>(
        `/organizations/${orgId}/projects/${projektId}/tasks/${aufgabenId}/move`,
        { method: 'PATCH', body: JSON.stringify(verschiebung) },
      ),

    onMutate: async ({ vorschau }) => {
      // Sonst ueberschreibt eine bereits laufende Abfrage die Vorschau mit
      // dem Stand VOR der Verschiebung.
      await queryClient.cancelQueries({ queryKey: key });

      const vorher = queryClient.getQueryData<Aufgabe[]>(key);
      queryClient.setQueryData<Aufgabe[]>(key, vorschau);

      // Der Rueckgabewert landet in `onError` als `kontext` - das ist der
      // vorgesehene Weg, den alten Stand fuer den Rollback aufzubewahren.
      return { vorher };
    },

    onError: (_fehler, _variablen, kontext) => {
      // ROLLBACK. Ohne diese Zeile bliebe die Karte an der falschen Stelle
      // liegen und die Anzeige behauptete etwas, das der Server nie
      // gespeichert hat - schlimmer als eine Fehlermeldung.
      if (kontext?.vorher) {
        queryClient.setQueryData(key, kontext.vorher);
      }
    },

    onSettled: () => {
      // In BEIDEN Faellen neu laden: Nach Erfolg, weil erst der Server die
      // echte Position und die neue Version kennt. Nach einem Fehler, weil der
      // gesicherte Stand womoeglich auch schon veraltet war - genau das sagt
      // ein 409 ja aus.
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Ist dieser Fehler ein Versionskonflikt?
 *
 * Ein 409 ist keine Stoerung, sondern eine Auskunft: Jemand anderes war
 * schneller. Die Oberflaeche behandelt ihn deshalb anders als einen echten
 * Fehler - sie erklaert und laedt neu, statt "etwas ist schiefgelaufen" zu
 * melden.
 */
export const istKonflikt = (fehler: unknown): boolean =>
  fehler instanceof ApiFehler && fehler.status === 409;
