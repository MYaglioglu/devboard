'use client';

import { useSyncExternalStore } from 'react';

import type { Organisation } from './organisationen';

const SPEICHER_SCHLUESSEL = 'devboard.aktive-organisation';

/**
 * Merkt sich, welche Organisation zuletzt benutzt wurde.
 *
 * ============================================================================
 * WARUM localStorage HIER IN ORDNUNG IST - UND BEIM TOKEN NICHT
 * ============================================================================
 * In ADR-007 steht ausdruecklich, dass der Access-Token NICHT in localStorage
 * gehoert: Jedes eingeschleuste Skript kann ihn lesen, eine einzige
 * XSS-Luecke genuegt fuer uebernommene Sitzungen.
 *
 * Fuer eine Organisations-ID gilt das nicht - und es lohnt sich, den
 * Unterschied genau zu benennen:
 *
 *   Der Token ist ein ZUGANGSMITTEL. Wer ihn hat, ist der Nutzer.
 *   Die Organisations-ID ist eine ANZEIGEPRAEFERENZ. Wer sie hat, hat nichts.
 *
 * Sie steht ohnehin in jeder URL, und der Server prueft bei JEDER Anfrage die
 * Mitgliedschaft neu (MitgliedschaftsGuard). Ein fremdes Skript, das diesen
 * Wert liest, erfaehrt bestenfalls, dass es eine Organisation mit dieser ID
 * gibt - und selbst das wusste es schon aus der Adresszeile.
 *
 * Merksatz: Nicht die Bequemlichkeit entscheidet, was in localStorage darf,
 * sondern die Frage - waere es schlimm, wenn ein fremdes Skript das liest?
 */

// ============================================================================
// EIN KLEINER SPEICHER MIT ABONNENTEN
// ============================================================================
// `localStorage` ist ein EXTERNER Speicher: Er liegt ausserhalb von React,
// aendert sich ohne dessen Zutun (auch aus einem anderen Browser-Tab) und
// existiert auf dem Server ueberhaupt nicht.
//
// Der naheliegende Weg waere `useState` plus ein `useEffect`, der beim ersten
// Rendern liest. Genau das verbietet der React-Compiler von Next 16
// ("Avoid calling setState() directly within an effect") - und er hat recht:
// Dabei rendert die Komponente zweimal, einmal mit falschem Wert.
//
// `useSyncExternalStore` ist der dafuer vorgesehene Haken. Er braucht drei
// Dinge: ein Abonnement, einen Lesevorgang fuer den Browser und einen fuer den
// Server. Der letzte ist der Grund, warum es diesen Haken gibt: Er macht
// ausdruecklich, was auf dem Server gilt, statt dort abzustuerzen.
const abonnenten = new Set<() => void>();

const abonniere = (benachrichtige: () => void) => {
  abonnenten.add(benachrichtige);

  // Das `storage`-Ereignis feuert, wenn ein ANDERER Tab schreibt. Ohne dieses
  // Abonnement zeigten zwei offene Tabs unterschiedliche aktive
  // Organisationen, bis einer neu geladen wird.
  const beiFremdemTab = (ereignis: StorageEvent) => {
    if (ereignis.key === SPEICHER_SCHLUESSEL) benachrichtige();
  };
  window.addEventListener('storage', beiFremdemTab);

  return () => {
    abonnenten.delete(benachrichtige);
    window.removeEventListener('storage', beiFremdemTab);
  };
};

const leseImBrowser = () => window.localStorage.getItem(SPEICHER_SCHLUESSEL);

// Auf dem Server gibt es kein `window`. `null` heisst hier "noch keine
// Auswahl" - das Markup ist damit auf Server und Client identisch, und es gibt
// keine Hydration-Warnung.
const leseAufServer = () => null;

/**
 * Liefert die aktive Organisation und eine Funktion zum Umschalten.
 *
 * ============================================================================
 * WARUM DEM GESPEICHERTEN WERT NICHT VERTRAUT WIRD
 * ============================================================================
 * Zwischen dem Speichern und dem naechsten Besuch koennen Wochen liegen. In
 * der Zeit kann die Mitgliedschaft beendet worden sein - dann zeigt der
 * gespeicherte Wert auf eine Organisation, die der Nutzer nicht mehr sehen
 * darf. Wuerde man ihn ungeprueft benutzen, liefe jede Anfrage in ein 404,
 * und die Anwendung saehe kaputt aus, obwohl alles richtig funktioniert.
 *
 * Deshalb wird der Wert gegen die geladene Liste geprueft und faellt sonst auf
 * den ersten Eintrag zurueck.
 *
 * Merksatz: Persistierter Zustand ist eine Vermutung ueber die Vergangenheit,
 * keine Aussage ueber die Gegenwart.
 */
export function useAktiveOrganisation(
  organisationen: Organisation[] | undefined,
) {
  const gemerkteId = useSyncExternalStore(
    abonniere,
    leseImBrowser,
    leseAufServer,
  );

  const aktive =
    organisationen?.find((organisation) => organisation.id === gemerkteId) ??
    organisationen?.[0] ??
    null;

  const waehle = (id: string) => {
    window.localStorage.setItem(SPEICHER_SCHLUESSEL, id);
    // `localStorage.setItem` loest im EIGENEN Tab kein `storage`-Ereignis aus -
    // nur in den anderen. Ohne diese Zeile aenderte sich der Speicher, und die
    // Oberflaeche bliebe stehen.
    abonnenten.forEach((benachrichtige) => benachrichtige());
  };

  return { aktive, waehle };
}
