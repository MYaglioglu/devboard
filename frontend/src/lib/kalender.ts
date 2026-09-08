'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aufgabenKey } from './aufgaben';
import { organisationKey } from './organisationen';
import { useAuth } from './auth-context';
import type { AufgabenStatus, Zustaendiger } from './aufgaben';

/**
 * Ein Termin im Kalender.
 *
 * ============================================================================
 * WARUM DAS NICHT `Aufgabe` IST
 * ============================================================================
 * Der Server liefert hier bewusst etwas anderes als beim Board: `project` ist
 * dabei (der Kalender sieht mehrere Projekte auf einem Tag), `position` und
 * `description` fehlen. Diesen Typ deshalb aus `Aufgabe` abzuleiten waere
 * bequem und falsch - er wuerde Felder versprechen, die nicht ankommen.
 *
 * `AufgabenStatus` und `Zustaendiger` werden dagegen wiederverwendet: Das sind
 * dieselben Werte aus derselben Quelle, und zwei Kopien davon wuerden
 * auseinanderlaufen, sobald ein Status dazukommt.
 *
 * `dueDate` ist hier NICHT `| null` - anders als bei `Aufgabe`. Ein Eintrag
 * ohne Datum ist kein Termin, und die Abfrage liefert ihn gar nicht erst.
 */
export interface Kalendereintrag {
  id: string;
  title: string;
  status: AufgabenStatus;
  version: number;
  dueDate: string;
  assignee: Zustaendiger | null;
  project: { id: string; name: string };
}

/**
 * Der Zwischenspeicher-Schluessel.
 *
 * Der Zeitraum gehoert hinein: Zwei Monate sind zwei verschiedene Antworten.
 * Ohne ihn zeigte der Kalender beim Blaettern den vorigen Monat weiter, weil
 * TanStack Query den Eintrag fuer aktuell hielte.
 *
 * Er haengt unter `organisationKey`, damit ein Wechsel der Organisation alles
 * darunter entwertet - dieselbe Aufteilung wie beim Feed und beim Board.
 */
export const kalenderKey = (orgId: string, von: string, bis: string) =>
  [...organisationKey(orgId), 'calendar', { von, bis }] as const;

/**
 * Laedt die Termine eines Zeitraums.
 *
 * ============================================================================
 * `useQuery` UND NICHT `useInfiniteQuery`
 * ============================================================================
 * Der Feed blaettert, der Kalender nicht. Ein Monat ist eine abgeschlossene
 * Antwort - es gibt kein "mehr laden", weil das Raster feststeht.
 *
 * ============================================================================
 * WARUM DER ZEITRAUM VON AUSSEN KOMMT
 * ============================================================================
 * Der Hook koennte ihn selbst ausrechnen, wenn man ihm den Monat gaebe. Dann
 * haette er aber `new Date()` und die Rasterlogik im Inneren - und waere nur
 * noch mit gerendertem React pruefbar.
 *
 * So bleibt die Rechnung in `kalender-raster.ts` (ohne React testbar) und
 * dieser Hook macht nur eines: fragen. Dieselbe Trennung wie zwischen
 * `board-logik.ts` und `aufgaben.ts`.
 *
 * ============================================================================
 * `placeholderData` - WARUM DER KALENDER BEIM BLAETTERN NICHT WEISS WIRD
 * ============================================================================
 * Ohne diese Zeile ist `data` beim Monatswechsel fuer einen Augenblick
 * `undefined`, das Raster leert sich und fuellt sich wieder. Bei schnellem
 * Blaettern flackert es.
 *
 * `keepPreviousData` laesst die alten Termine stehen, bis die neuen da sind.
 * Sie gehoeren dann kurz zum falschen Monat - deshalb zeigt die Seite in
 * dieser Zeit `isFetching` an, statt so zu tun, als sei nichts.
 */
export function useKalender(
  orgId: string | undefined,
  von: string,
  bis: string,
) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: kalenderKey(orgId ?? 'keine', von, bis),
    queryFn: () => {
      // `URLSearchParams` statt Zeichenketten-Verkettung: Ein `+` in einem
      // ISO-Zeitstempel (bei Zonen-Angaben wie `+02:00`) waere in einer URL
      // ein Leerzeichen. Hier kann es das nicht werden.
      const parameter = new URLSearchParams({ von, bis });

      return authFetch<Kalendereintrag[]>(
        `/organizations/${orgId}/calendar?${parameter.toString()}`,
      );
    },
    // Ohne Organisation gibt es nichts zu fragen. `enabled` verhindert die
    // Anfrage an `/organizations/undefined/calendar`, die sonst beim ersten
    // Rendern liefe und mit 404 zurueckkaeme.
    enabled: Boolean(orgId),
    placeholderData: (vorherige) => vorherige,
    retry: false,
  });
}

/**
 * Legt eine Aufgabe mit Termin an.
 *
 * ============================================================================
 * WARUM NICHT `useAufgabeAnlegen` AUS aufgaben.ts
 * ============================================================================
 * Der Hook dort bindet das Projekt beim ERZEUGEN des Hooks
 * (`useAufgabeAnlegen(orgId, projektId)`). Auf der Projektseite ist das
 * richtig - dort steht das Projekt im Pfad und aendert sich nicht.
 *
 * Im Kalender waehlt der Nutzer das Projekt erst im Dialog. Ein Hook mit
 * festem Projekt muesste also bei jeder Auswahl neu erzeugt werden, und
 * Hooks lassen sich nicht bedingt oder in einer Schleife aufrufen. Deshalb
 * wandert `projektId` hier vom Hook in die MUTATION.
 *
 * Der zweite Unterschied ist der Zwischenspeicher: `useAufgabeAnlegen`
 * entwertet nur das Board seines Projekts. Eine im Kalender angelegte Aufgabe
 * muss beides entwerten - sonst bliebe der Kalender nach dem Anlegen leer,
 * obwohl die Aufgabe da ist.
 */
export function useTerminAnlegen(orgId: string | undefined) {
  const { authFetch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projektId,
      ...daten
    }: {
      projektId: string;
      title: string;
      /** ISO-Zeitpunkt. Die Umrechnung aus der Ortszeit passiert im Dialog. */
      dueDate: string;
      /**
       * Die NUTZER-ID, nicht die der Mitgliedschaft - so verlangt es die API.
       * Warum, steht ausfuehrlich in `create-task.dto.ts`: Die interne
       * Struktur unserer Tabellen soll nicht Teil der Schnittstelle sein.
       */
      assigneeId?: string;
    }) =>
      authFetch<{ id: string }>(
        `/organizations/${orgId}/projects/${projektId}/tasks`,
        { method: 'POST', body: JSON.stringify(daten) },
      ),

    onSuccess: (_ergebnis, variablen) => {
      // Alles unterhalb dieser Organisation, was den Kalender betrifft. Kein
      // genauer Schluessel mit `von`/`bis`: Der Nutzer koennte inzwischen
      // weitergeblaettert haben, und dann waere der entwertete Monat der
      // falsche. TanStack Query vergleicht Schluessel von links - `['org',
      // id, 'calendar']` trifft jeden Zeitraum darunter.
      void queryClient.invalidateQueries({
        queryKey: [...organisationKey(orgId ?? 'keine'), 'calendar'],
      });

      // Und das Board des betroffenen Projekts. Ohne diese Zeile zeigt es die
      // neue Karte erst nach einem Neuladen - der Fehler faellt nicht sofort
      // auf, weil man nach dem Anlegen im Kalender bleibt.
      void queryClient.invalidateQueries({
        queryKey: aufgabenKey(orgId ?? 'keine', variablen.projektId),
      });
    },
  });
}

/**
 * Ordnet die Termine ihren Kalendertagen zu.
 *
 * ============================================================================
 * WARUM EINE `Map` UND NICHT `filter` JE TAG
 * ============================================================================
 * Der naheliegende Weg waere, im Raster fuer jeden der 42 Tage die Terminliste
 * zu filtern. Das ist 42 mal ein Durchlauf durch alle Termine - bei 200
 * Terminen 8.400 Vergleiche, bei jedem Rendern.
 *
 * Einmal gruppieren ist ein Durchlauf, und das Nachschlagen je Tag kostet
 * danach nichts. Derselbe Gedanke wie bei N+1 im Backend: nicht in der
 * Schleife nachladen, sondern vorher einmal einsammeln.
 *
 * ============================================================================
 * DER SCHLUESSEL IST DER LOKALE TAG, NICHT DIE ZEICHENKETTE AUS DEM JSON
 * ============================================================================
 * `dueDate` kommt als `2026-08-31T22:00:00.000Z` an. Die ersten zehn Zeichen
 * davon zu nehmen waere kuerzer - und ergaebe den 31.08., obwohl der Termin in
 * Berlin am 01.09. faellig ist. Genau der Fehler, vor dem der Kommentar in
 * `kalender-raster.ts` warnt.
 *
 * Deshalb wird die Zeichenkette erst in einen `Date` verwandelt und daraus der
 * LOKALE Tag gebildet.
 */
export function nachTagenGruppiert(
  eintraege: Kalendereintrag[],
): Map<string, Kalendereintrag[]> {
  const nachTag = new Map<string, Kalendereintrag[]>();

  for (const eintrag of eintraege) {
    const schluessel = tagesSchluessel(new Date(eintrag.dueDate));
    const vorhandene = nachTag.get(schluessel);

    if (vorhandene) vorhandene.push(eintrag);
    else nachTag.set(schluessel, [eintrag]);
  }

  return nachTag;
}

/**
 * Der Schluessel eines lokalen Kalendertages.
 *
 * Bewusst kein `toISOString().slice(0, 10)` - das waere der UTC-Tag und damit
 * fuer alles oestlich von Greenwich abends der falsche. Bewusst auch kein
 * `getTime()` von Mitternacht: Das waere eine Zahl, die je nach Zeitumstellung
 * fuer denselben Tag zweimal verschieden ausfaellt.
 *
 * Jahr, Monat und Tag sind das, was der Betrachter sieht - und genau das soll
 * der Schluessel sein.
 */
export const tagesSchluessel = (datum: Date): string =>
  `${datum.getFullYear()}-${datum.getMonth()}-${datum.getDate()}`;
