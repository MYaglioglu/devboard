'use client';

import Link from 'next/link';

import {
  amSelbenTag,
  monatsName,
  monatsraster,
  wochentagsNamen,
} from '@/lib/kalender-raster';
import { nachTagenGruppiert, tagesSchluessel } from '@/lib/kalender';
import type { Kalendereintrag } from '@/lib/kalender';
import type { Monatszeiger } from '@/lib/kalender-raster';

/**
 * ============================================================================
 * DER MONATSKALENDER
 * ============================================================================
 * Diese Komponente RECHNET NICHT. Sie ruft `monatsraster` auf und stellt dar,
 * was zurueckkommt. Jede Datumsarithmetik steht in `kalender-raster.ts` und
 * ist dort ohne React geprueft.
 *
 * Das ist dieselbe Aufteilung wie beim Board (`board-logik.ts` gegen
 * `board.tsx`), und der Grund ist derselbe: Ein Fehler in der Rasterrechnung
 * soll von einem Test gefunden werden, der drei Zeilen lang ist - nicht von
 * einem, der einen Browser hochfaehrt.
 *
 * ============================================================================
 * WARUM `<table>` UND NICHT EIN GRID AUS DIVS
 * ============================================================================
 * Ein `grid-cols-7` mit 42 Divs saehe identisch aus und waere weniger Markup.
 * Ein Kalender IST aber eine Tabelle: Die Spalte sagt den Wochentag, die Zeile
 * die Woche. Genau diese Beziehung geht in Divs verloren.
 *
 * Fuer einen Screenreader ist der Unterschied gross: In einer Tabelle wird
 * beim Betreten einer Zelle die zugehoerige Spaltenueberschrift mitgelesen -
 * "Mittwoch, 16". Bei Divs hoert man "16" und muss selbst zaehlen.
 *
 * Deshalb steht hier auch `<th scope="col">` und nicht nur `<th>`: Ohne
 * `scope` muss der Screenreader raten, ob die Ueberschrift fuer die Spalte
 * oder die Zeile gilt.
 */
export function Monatskalender({
  monat,
  eintraege,
  heute,
  orgId,
}: {
  monat: Monatszeiger;
  eintraege: Kalendereintrag[];
  /**
   * Der heutige Tag - hineingereicht, nicht hier ermittelt.
   *
   * `new Date()` in der Komponente waere bequemer und wuerde den Test von der
   * Uhr abhaengig machen: "hebt heute hervor" waere nur an dem Tag pruefbar,
   * an dem man ihn schreibt. Die Lehre steht seit Sprint 3 dreimal im Projekt.
   */
  heute: Date;
  orgId: string;
}) {
  const raster = monatsraster(monat);

  // Einmal gruppieren statt 42 mal filtern - siehe Begruendung in
  // `nachTagenGruppiert`.
  const nachTag = nachTagenGruppiert(eintraege);

  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">
        Termine im {monatsName(monat)}, nach Kalendertagen
      </caption>

      <thead>
        <tr>
          {wochentagsNamen().map((name) => (
            <th
              key={name}
              scope="col"
              className="pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-still"
            >
              {name}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {/* In Wochen zerlegt, weil eine Tabellenzeile sieben Zellen hat. Das
            Raster selbst ist bewusst flach: Waere es verschachtelt, muesste
            die reine Funktion eine Entscheidung ueber die Darstellung
            treffen. */}
        {Array.from({ length: raster.length / 7 }, (_, woche) => (
          <tr key={woche}>
            {raster.slice(woche * 7, woche * 7 + 7).map((tag) => (
              <Tageszelle
                key={tag.datum.getTime()}
                datum={tag.datum}
                imMonat={tag.imMonat}
                istHeute={amSelbenTag(tag.datum, heute)}
                termine={nachTag.get(tagesSchluessel(tag.datum)) ?? []}
                orgId={orgId}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Die Farbe eines Termins nach seinem Status.
 *
 * Bewusst kein `never`-Vollstaendigkeitstest wie beim Erzeugen: Kommt im
 * Backend ein vierter Status dazu, soll die alte Fassung im Browser ihn
 * ertragen und grau darstellen - nicht abstuerzen. Die Regel aus Sprint 4:
 * beim Erzeugen auf Vollstaendigkeit pruefen, beim Empfangen nicht.
 */
const statusFarbe: Record<string, string> = {
  TODO: 'border-l-still',
  IN_PROGRESS: 'border-l-akzent',
  DONE: 'border-l-rand-stark',
};

function Tageszelle({
  datum,
  imMonat,
  istHeute,
  termine,
  orgId,
}: {
  datum: Date;
  imMonat: boolean;
  istHeute: boolean;
  termine: Kalendereintrag[];
  orgId: string;
}) {
  return (
    <td
      className={`h-28 border border-rand p-1 align-top ${
        // Vor- und Nachlauftage sind da, aber zurueckgenommen. Sie ganz
        // wegzulassen waere die Alternative - dann haette die erste Woche
        // Loecher, und der Blick verliert die Spalte.
        imMonat ? '' : 'bg-flaeche-gedaempft text-still'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
            istHeute ? 'bg-akzent font-medium text-akzent-text' : ''
          }`}
        >
          {datum.getDate()}
        </span>

        {/*
          Die Zahl erscheint erst, wenn mehr Termine da sind als Platz. Sie
          steht als `title` UND sichtbar - ein Zaehler, den man nur mit der
          Maus erfaehrt, ist fuer Tastaturnutzer nicht vorhanden.
        */}
        {termine.length > 2 && (
          <span className="text-[10px] text-still">+{termine.length - 2}</span>
        )}
      </div>

      <ul className="mt-0.5 flex flex-col gap-0.5">
        {termine.slice(0, 2).map((termin) => (
          <li key={termin.id}>
            <Link
              href={`/organizations/${orgId}/projects/${termin.project.id}`}
              // `title` traegt den vollen Text, weil die Kachel ihn abschneidet.
              title={`${uhrzeit(termin.dueDate)} · ${termin.title} · ${termin.project.name}`}
              className={`block truncate rounded border-l-2 bg-flaeche-gedaempft px-1 py-0.5
                text-[11px] transition hover:bg-rand ${
                  statusFarbe[termin.status] ?? 'border-l-rand-stark'
                } ${termin.status === 'DONE' ? 'text-still line-through' : ''}`}
            >
              <span className="text-still">{uhrzeit(termin.dueDate)}</span>{' '}
              {termin.title}
            </Link>
          </li>
        ))}
      </ul>
    </td>
  );
}

/**
 * Die Uhrzeit eines Termins in der Zone des Betrachters.
 *
 * `toLocaleTimeString` ohne feste Zone nimmt die des Browsers - genau das ist
 * gewollt. Der Server liefert `2026-09-15T13:30:00.000Z`; wer in Berlin sitzt,
 * soll 15:30 sehen.
 *
 * Dass die Umrechnung hier passiert und nicht auf dem Server, ist die
 * Entscheidung aus 09_API.md: Der Server kennt die Zone des Betrachters nicht
 * und muesste sie raten.
 */
const uhrzeit = (iso: string): string =>
  new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
