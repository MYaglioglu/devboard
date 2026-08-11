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

/**
 * Schluessel fuer die Daten EINER Organisation.
 *
 * Bewusst mit `ORGANISATIONEN_KEY` als Praefix. TanStack Query vergleicht
 * Schluessel von links: `invalidateQueries({ queryKey: ORGANISATIONEN_KEY })`
 * trifft damit die Liste UND jede einzelne Organisation.
 *
 * Das ist dieselbe Praefix-Regel wie bei einem zusammengesetzten
 * Datenbankindex - und sie wird hier bewusst ausgenutzt: Nach einem
 * Rollenwechsel muessen die Mitgliederliste und die Uebersicht neu geladen
 * werden, denn die eigene Rolle kann sich geaendert haben.
 */
export const organisationKey = (orgId: string) =>
  [...ORGANISATIONEN_KEY, orgId] as const;

export const mitgliederKey = (orgId: string) =>
  [...organisationKey(orgId), 'members'] as const;

export interface Mitglied {
  userId: string;
  email: string;
  name: string | null;
  role: Rolle;
  mitgliedSeit: string;
}

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

/** Laedt eine einzelne Organisation. */
export function useOrganisation(orgId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: organisationKey(orgId),
    queryFn: () => authFetch<Organisation>(`/organizations/${orgId}`),
    // Bei 404 NICHT wiederholen. Das ist kein Netzwerkfehler, sondern eine
    // Aussage: "Fuer dich existiert diese Organisation nicht." Ein
    // Wiederholungsversuch aendert daran nichts und verzoegert nur die
    // Fehlermeldung. (Die Standardregel in providers.tsx faengt bereits alle
    // ApiFehler ab; das steht hier trotzdem, damit die Absicht sichtbar ist.)
    retry: false,
  });
}

/** Laedt die Mitglieder einer Organisation. */
export function useMitglieder(orgId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: mitgliederKey(orgId),
    queryFn: () => authFetch<Mitglied[]>(`/organizations/${orgId}/members`),
    retry: false,
  });
}

/**
 * Aendert die Rolle eines Mitglieds.
 *
 * ============================================================================
 * WARUM HIER DER GANZE PRAEFIX ENTWERTET WIRD
 * ============================================================================
 * Naheliegend waere, nur die Mitgliederliste neu zu laden. Das reicht nicht:
 * Aendert ein OWNER seine EIGENE Rolle (etwa nachdem er einen zweiten
 * ernannt hat), aendert sich damit auch, was er auf dieser Seite darf - und
 * die Rolle steht ausserdem in der Uebersichtsliste.
 *
 * `ORGANISATIONEN_KEY` als Praefix entwertet beides auf einmal.
 */
export function useRolleAendern(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Rolle }) =>
      authFetch<Mitglied>(`/organizations/${orgId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORGANISATIONEN_KEY });
    },
  });
}

/** Entfernt ein Mitglied - mit der eigenen ID bedeutet das "verlassen". */
export function useMitgliedEntfernen(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      authFetch<void>(`/organizations/${orgId}/members/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORGANISATIONEN_KEY });
    },
  });
}

export const einladungenKey = (orgId: string) =>
  [...organisationKey(orgId), 'invitations'] as const;

/** Eine offene Einladung, wie die Verwaltungsansicht sie sieht. */
export interface Einladung {
  id: string;
  email: string;
  role: Rolle;
  expiresAt: string;
  createdAt: string;
}

/**
 * Die Antwort auf das Aussprechen einer Einladung.
 *
 * ============================================================================
 * DER TOKEN EXISTIERT GENAU EINMAL
 * ============================================================================
 * Das Backend gibt ihn nur hier zurueck, nie in der Liste - erzwungen ueber
 * zwei getrennte Rueckgabetypen. Dieselbe Trennung bilden wir im Frontend ab,
 * damit der Compiler mitdenkt: Wer den Token aus der Liste lesen wollte,
 * bekaeme einen Typfehler statt `undefined` zur Laufzeit.
 *
 * Fuer die Oberflaeche heisst das: Sie MUSS ihn im Moment des Anlegens
 * anzeigen und deutlich machen, dass er danach weg ist. Dasselbe Verhalten
 * kennt man von frisch erzeugten API-Schluesseln bei GitHub oder Stripe - und
 * es ist kein Designeinfall, sondern die Folge einer Sicherheitsentscheidung
 * im Backend.
 */
export interface AusgestellteEinladung extends Einladung {
  token: string;
}

/** Laedt die offenen Einladungen. Nur fuer OWNER und ADMIN erreichbar. */
export function useEinladungen(orgId: string, aktiv: boolean) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: einladungenKey(orgId),
    queryFn: () =>
      authFetch<Einladung[]>(`/organizations/${orgId}/invitations`),
    // Ein MEMBER bekommt hier 403. Die Abfrage wird deshalb gar nicht erst
    // gestartet, statt einen Fehler zu erzeugen, den niemand anzeigen will -
    // `enabled` ist der vorgesehene Weg dafuer.
    enabled: aktiv,
    retry: false,
  });
}

/** Spricht eine Einladung aus. */
export function useEinladen(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (daten: { email: string; role: Rolle }) =>
      authFetch<AusgestellteEinladung>(`/organizations/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify(daten),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: einladungenKey(orgId) });
    },
  });
}

/** Zieht eine Einladung zurueck. */
export function useEinladungZurueckziehen(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (einladungId: string) =>
      authFetch<void>(`/organizations/${orgId}/invitations/${einladungId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: einladungenKey(orgId) });
    },
  });
}

/**
 * Loest eine Einladung ein.
 *
 * Kein `orgId` - welche Organisation gemeint ist, ergibt sich aus dem TOKEN.
 * Der Eingeladene kennt die ID nicht und soll sie auch nicht raten koennen.
 */
export function useEinladungAnnehmen() {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) =>
      authFetch<{ organizationId: string; role: Rolle }>(
        '/invitations/accept',
        { method: 'POST', body: JSON.stringify({ token }) },
      ),
    onSuccess: () => {
      // Der Beitritt aendert die Organisationsliste - ohne Entwertung bliebe
      // die neue Organisation unsichtbar.
      void queryClient.invalidateQueries({ queryKey: ORGANISATIONEN_KEY });
    },
  });
}

/** Benennt eine Organisation um. Nur OWNER und ADMIN. */
export function useOrganisationUmbenennen(orgId: string) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      authFetch<Organisation>(`/organizations/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      // Der Name steht auf der Detailseite UND in der Uebersichtsliste - der
      // gemeinsame Praefix entwertet beides auf einmal.
      void queryClient.invalidateQueries({ queryKey: ORGANISATIONEN_KEY });
    },
  });
}
