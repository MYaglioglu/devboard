'use client';

import { useEffect, useState } from 'react';

import { Geschuetzt } from '@/components/geschuetzt';
import { Seitenleiste } from '@/components/seitenleiste';

/**
 * ============================================================================
 * DIE HUELLE DER ANGEMELDETEN ANWENDUNG
 * ============================================================================
 * Vorher baute jede Seite ihr eigenes `<main class="mx-auto min-h-screen …">` -
 * in zwei verschiedenen Breiten und zwei Ausrichtungen. Beim Navigieren sprang
 * der Inhalt seitlich und senkrecht.
 *
 * Jetzt gibt es genau zwei Layouts in der Anwendung:
 *
 *   (app)/layout.tsx  -> diese Huelle, mit Seitenleiste
 *   alles andere      -> die zentrierte Karte fuer Anmelden, Registrieren,
 *                        Einladung und die Startseite
 *
 * Die Routengruppe `(app)` taucht in der URL NICHT auf - `/dashboard` bleibt
 * `/dashboard`. Das ist der Weg, den Next.js dafuer vorsieht, und er kostet
 * keine einzige Aenderung an einem Link.
 */
export function AppHuelle({ children }: { children: React.ReactNode }) {
  return (
    <Geschuetzt>
      <Rahmen>{children}</Rahmen>
    </Geschuetzt>
  );
}

function Rahmen({ children }: { children: React.ReactNode }) {
  const [schubladeOffen, setSchubladeOffen] = useState(false);

  // Escape schliesst die Schublade. Auf einem schmalen Fenster liegt sie ueber
  // dem Inhalt - ohne diesen Ausweg waere sie mit der Tastatur eine Sackgasse.
  useEffect(() => {
    if (!schubladeOffen) return;

    const beiTaste = (ereignis: KeyboardEvent) => {
      if (ereignis.key === 'Escape') setSchubladeOffen(false);
    };

    document.addEventListener('keydown', beiTaste);
    return () => document.removeEventListener('keydown', beiTaste);
  }, [schubladeOffen]);

  return (
    <div className="flex min-h-screen bg-flaeche">
      {/*
        ======================================================================
        DER SPRUNGLINK - DAS ERSTE FOKUSSIERBARE ELEMENT DER SEITE
        ======================================================================
        Ohne ihn muss sich jemand, der mit der Tastatur navigiert, auf JEDER
        Seite erst durch die komplette Seitenleiste tabben, bevor er beim
        Inhalt ankommt. Bei einer Leiste mit zehn Projekten sind das zehn
        Tabs, jedes Mal.

        Er ist unsichtbar, bis er den Fokus bekommt - `sr-only` mit
        `focus:not-sr-only`. Das ist kein Trick, sondern das uebliche Muster:
        Sichtbar waere er fuer alle anderen nur Rauschen.
      */}
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50
          focus:rounded-lg focus:bg-akzent focus:px-3 focus:py-2 focus:text-sm focus:text-akzent-text"
      >
        Zum Inhalt springen
      </a>

      {/*
        Die Leiste ist ab `lg` dauerhaft da und darunter eine Schublade. Zwei
        Fassungen derselben Komponente statt zweier Komponenten - der Inhalt
        ist identisch, nur die Verpackung unterscheidet sich.

        `sticky top-0 h-screen`: Die Leiste bleibt stehen, waehrend der Inhalt
        scrollt. `fixed` waere naheliegend und nimmt die Leiste aus dem Fluss -
        dann muesste der Inhalt einen Aussenabstand in genau der Breite der
        Leiste bekommen, und die beiden Zahlen liefen irgendwann auseinander.
      */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-rand bg-flaeche-gedaempft lg:block">
        <Seitenleiste />
      </aside>

      {schubladeOffen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Navigation schließen"
            onClick={() => setSchubladeOffen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-rand bg-flaeche">
            <Seitenleiste beimNavigieren={() => setSchubladeOffen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rand bg-flaeche/90 px-4 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setSchubladeOffen(true)}
            aria-expanded={schubladeOffen}
            className="rounded-md border border-rand px-2 py-1 text-sm"
          >
            <span aria-hidden>☰</span>
            <span className="sr-only">Navigation öffnen</span>
          </button>
          <span className="font-medium">DevBoard</span>
        </header>

        {/*
          `id` und `tabIndex={-1}`: Der Sprunglink zeigt hierher, und ohne
          `tabIndex` wuerde der Fokus in manchen Browsern gar nicht hierhin
          wandern - der Sprung waere nur eine Bildlaufbewegung.
        */}
        <main id="inhalt" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Die Kopfzeile einer Seite INNERHALB der Huelle.
 *
 * ============================================================================
 * WARUM ES ZWEI BREITEN GIBT UND NICHT EINE
 * ============================================================================
 * Listen und Text lesen sich schlecht, wenn sie ueber die ganze Breite eines
 * grossen Bildschirms laufen - dafuer gibt es `weit={false}` mit einer festen
 * Lesebreite.
 *
 * Das Kanban-Board braucht das Gegenteil. Es stand bisher in derselben
 * `max-w-2xl`-Spalte wie alles andere: 672 px minus Innenabstand, geteilt
 * durch drei Spalten - rund 190 px je Spalte. Das Herzstueck des Projekts
 * zeigte sich in drei Streifen.
 */
export function SeitenKopf({
  titel,
  beschreibung,
  aktionen,
  children,
  weit = false,
}: {
  titel: string;
  beschreibung?: React.ReactNode;
  aktionen?: React.ReactNode;
  children: React.ReactNode;
  weit?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 ${
        weit ? '' : 'max-w-4xl'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{titel}</h1>
          {beschreibung && (
            <div className="mt-1 text-sm text-leise">{beschreibung}</div>
          )}
        </div>
        {aktionen && (
          <div className="flex shrink-0 items-center gap-2">{aktionen}</div>
        )}
      </div>

      {children}
    </div>
  );
}
