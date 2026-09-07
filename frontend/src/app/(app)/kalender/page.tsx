'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { SeitenKopf } from '@/components/app-huelle';
import { Monatskalender } from '@/components/monatskalender';
import { useAktiveOrganisation } from '@/lib/aktive-organisation';
import { useKalender } from '@/lib/kalender';
import {
  monatsName,
  monatsraster,
  rasterZeitraum,
  verschiebeMonat,
} from '@/lib/kalender-raster';
import { useOrganisationen } from '@/lib/organisationen';
import type { Monatszeiger } from '@/lib/kalender-raster';

/**
 * ============================================================================
 * DIE KALENDERSEITE
 * ============================================================================
 * Sie haelt genau einen Zustand: welchen Monat man ansieht. Alles andere
 * folgt daraus - das Raster, der abgefragte Zeitraum, die Termine.
 *
 * ============================================================================
 * WARUM DER MONAT IM `useState` STEHT UND NICHT IN DER URL
 * ============================================================================
 * `/kalender?monat=2026-09` waere besser: teilbar, im Verlauf des Browsers,
 * und der Zurueck-Knopf taete das Erwartete. Genau deshalb steht es im
 * Backlog.
 *
 * Fuer diese Scheibe bewusst nicht: Der Zustand in der URL zieht
 * `useSearchParams`, einen `Suspense`-Rahmen (Next.js verlangt ihn) und das
 * Zusammenspiel von Server- und Client-Komponente nach sich. Das ist eine
 * eigene Frage und keine Zugabe zum Kalender.
 *
 * Die Regel, nach der hier geschnitten wird: Eine Scheibe endet, wenn sie
 * funktioniert - nicht, wenn nichts mehr zu verbessern ist.
 */
export default function KalenderSeite() {
  const { data: organisationen, isPending: orgsLaden } = useOrganisationen();
  const { aktive } = useAktiveOrganisation(organisationen);

  /**
   * Der angezeigte Monat, anfangs der laufende.
   *
   * Die Funktion in `useState` statt `useState(startmonat())`: Ohne sie liefe
   * `new Date()` bei JEDEM Rendern, obwohl der Wert nur einmal gebraucht wird.
   * Hier ist das billig - die Gewohnheit ist es trotzdem wert, weil derselbe
   * Aufruf anderswo eine teure Rechnung sein kann.
   */
  const [monat, setzeMonat] = useState<Monatszeiger>(() => {
    const jetzt = new Date();
    return { jahr: jetzt.getFullYear(), monat: jetzt.getMonth() };
  });

  /**
   * Der abgefragte Zeitraum - abgeleitet, nicht gespeichert.
   *
   * ==========================================================================
   * WARUM DAS RASTER HIER NUR ZUM RECHNEN GEBAUT WIRD
   * ==========================================================================
   * Die Seite braucht vom Raster nur seine beiden Enden, um den Server zu
   * fragen. Die Darstellung baut es sich selbst aus demselben Monat.
   *
   * Man koennte es hinunterreichen und den zweiten Aufruf sparen. Dann haette
   * die Komponente aber eine Voraussetzung ("gib mir ein Raster, das zu diesem
   * Monat passt"), die niemand erzwingt - und ein Test koennte ihr ein Raster
   * zum falschen Monat geben. Eine reine Funktion zweimal aufzurufen ist
   * billiger als eine Zusage, die nur im Kopf existiert.
   *
   * ==========================================================================
   * WARUM `useMemo`
   * ==========================================================================
   * Nicht wegen der 42 `Date`-Objekte - die sind billig. Sondern weil `von`
   * und `bis` in den `queryKey` gehen und weiter unten in die
   * Abhaengigkeiten des Hooks. Ein bei jedem Rendern neu gebautes Objekt waere
   * dort der Unterschied zwischen "einmal fragen" und "immer wieder fragen".
   */
  const zeitraum = useMemo(() => rasterZeitraum(monatsraster(monat)), [monat]);

  const {
    data: termine,
    isPending,
    isError,
    isFetching,
  } = useKalender(aktive?.id, zeitraum.von, zeitraum.bis);

  const heute = new Date();
  const imLaufendenMonat =
    monat.jahr === heute.getFullYear() && monat.monat === heute.getMonth();

  return (
    <SeitenKopf
      titel="Kalender"
      beschreibung={aktive?.name}
      // `weit`, weil sieben Spalten mit Terminen in 4xl-Breite unlesbar
      // schmal werden. Die Projektseite nutzt denselben Schalter fuer das
      // Board.
      weit
      aktionen={
        <div className="flex items-center gap-1">
          <MonatsKnopf
            beschriftung="Voriger Monat"
            zeichen="‹"
            beiKlick={() => setzeMonat((m) => verschiebeMonat(m, -1))}
          />
          <button
            type="button"
            onClick={() => {
              const jetzt = new Date();
              setzeMonat({
                jahr: jetzt.getFullYear(),
                monat: jetzt.getMonth(),
              });
            }}
            disabled={imLaufendenMonat}
            className="rounded-lg border border-rand px-3 py-1.5 text-sm transition
              hover:bg-flaeche-gedaempft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Heute
          </button>
          <MonatsKnopf
            beschriftung="Nächster Monat"
            zeichen="›"
            beiKlick={() => setzeMonat((m) => verschiebeMonat(m, 1))}
          />
        </div>
      }
    >
      <div className="flex items-baseline gap-3">
        {/*
          `aria-live="polite"` sagt den Monatswechsel an. Ohne das aendert sich
          beim Klick auf "‹" fuer einen Screenreader nichts Hoerbares - die
          Tabelle darunter ist zwar neu, aber niemand sagt es.
        */}
        <h2 aria-live="polite" className="text-lg font-medium tracking-tight">
          {monatsName(monat)}
        </h2>

        {/* Nur beim NACHladen, nicht beim ersten. Beim ersten steht unten das
            Skelett - beides gleichzeitig waere doppelt gemeldet. */}
        {isFetching && !isPending && (
          <span className="text-xs text-still">wird aktualisiert …</span>
        )}
      </div>

      {!orgsLaden && !aktive && (
        <section className="rounded-xl border border-dashed border-rand p-8 text-center">
          <p className="text-sm text-leise">
            Sie gehören noch zu keiner Organisation.
          </p>
          <Link
            href="/organizations"
            className="mt-3 inline-block text-sm text-akzent hover:underline"
          >
            Organisation anlegen
          </Link>
        </section>
      )}

      {isError && (
        <p role="alert" className="text-sm text-gefahr">
          Die Termine konnten nicht geladen werden.
        </p>
      )}

      {aktive && !isError && (
        <>
          <Monatskalender
            monat={monat}
            eintraege={termine ?? []}
            heute={heute}
            orgId={aktive.id}
          />

          {/*
            Der leere Zustand steht UNTER dem Raster, nicht an seiner Stelle.
            Ein Kalender ohne Termine ist nicht leer - er zeigt weiterhin
            einen Monat, und den will man auch dann sehen.

            Der Satz sagt ausserdem, WARUM nichts da ist. Das ist derzeit die
            haeufigste Ursache: Es gibt im Frontend bis Scheibe K.3 gar keinen
            Weg, ein Faelligkeitsdatum zu setzen.
          */}
          {!isPending && termine?.length === 0 && (
            <p className="text-center text-sm text-still">
              Keine Termine in diesem Zeitraum. Aufgaben erscheinen hier, sobald
              sie ein Fälligkeitsdatum haben.
            </p>
          )}
        </>
      )}
    </SeitenKopf>
  );
}

/**
 * Ein Blaetterknopf.
 *
 * Das Zeichen ist `aria-hidden`, die Beschriftung steht in `aria-label`: Ein
 * Screenreader liest sonst "‹" vor, was je nach Stimme "einfaches
 * Anfuehrungszeichen links" heisst oder gar nichts. Dieselbe Ueberlegung wie
 * beim ⌄ im Organisationswechsler.
 */
function MonatsKnopf({
  beschriftung,
  zeichen,
  beiKlick,
}: {
  beschriftung: string;
  zeichen: string;
  beiKlick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={beiKlick}
      aria-label={beschriftung}
      className="grid h-8 w-8 place-items-center rounded-lg border border-rand text-sm
        transition hover:bg-flaeche-gedaempft"
    >
      <span aria-hidden>{zeichen}</span>
    </button>
  );
}
