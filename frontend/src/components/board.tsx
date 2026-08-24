'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';

import { Hinweis } from '@/components/ui';
import {
  useAufgabeAnlegen,
  useAufgabeLoeschen,
  useAufgabeVerschieben,
  useAufgaben,
} from '@/lib/aufgaben';
import {
  SPALTEN,
  gruppiere,
  planeVerschiebung,
  verschiebeMeldung,
  zielIndexFuer,
} from '@/lib/board-logik';
import type { Aufgabe, AufgabenStatus } from '@/lib/aufgaben';

/** Die Kennung einer Spalte als Ablageziel - vom Karten-Namensraum getrennt. */
const spaltenId = (status: AufgabenStatus) => `spalte:${status}`;

export function Board({
  orgId,
  projektId,
  schreibgeschuetzt,
}: {
  orgId: string;
  projektId: string;
  /** Archivierte Projekte sind lesbar, aber nicht mehr veraenderbar. */
  schreibgeschuetzt: boolean;
}) {
  const aufgaben = useAufgaben(orgId, projektId);
  const verschieben = useAufgabeVerschieben(orgId, projektId);
  const [meldung, setMeldung] = useState<string | null>(null);

  /**
   * ==========================================================================
   * WARUM DER ZEIGER ERST NACH 5 PIXELN ZIEHT
   * ==========================================================================
   * Ohne diese Bedingung beginnt schon ein einfacher Klick eine Ziehbewegung -
   * jeder Klick auf "Loeschen" waere dann ein Mini-Drag, und der Knopf reagiert
   * nicht mehr zuverlaessig.
   *
   * Der Tastatur-Sensor steht daneben, weil Drag & Drop sonst NUR mit der Maus
   * bedienbar waere. Mit ihm laesst sich eine Karte per Leertaste aufnehmen,
   * mit den Pfeiltasten bewegen und erneut mit Leertaste ablegen.
   */
  const sensoren = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (aufgaben.isPending) {
    return <p className="text-sm text-zinc-500">Lade Aufgaben …</p>;
  }

  if (aufgaben.isError) {
    return <Hinweis>Die Aufgaben konnten nicht geladen werden.</Hinweis>;
  }

  const gruppen = gruppiere(aufgaben.data);

  const beimAblegen = (ereignis: DragEndEvent) => {
    const { active, over } = ereignis;

    // Ausserhalb losgelassen - nichts tun. KEINE Fehlermeldung: Der Nutzer
    // hat es sich anders ueberlegt, das ist kein Fehlerfall.
    if (!over) {
      return;
    }

    const bewegteId = String(active.id);
    const ueberId = String(over.id);

    const zielStatus = ueberId.startsWith('spalte:')
      ? (ueberId.slice('spalte:'.length) as AufgabenStatus)
      : aufgaben.data.find((a) => a.id === ueberId)?.status;

    if (!zielStatus) {
      return;
    }

    const zielIndex = zielIndexFuer(
      aufgaben.data,
      bewegteId,
      zielStatus,
      ueberId.startsWith('spalte:') ? null : ueberId,
    );

    const plan = planeVerschiebung(
      aufgaben.data,
      bewegteId,
      zielStatus,
      zielIndex,
    );

    if (!plan) {
      return;
    }

    setMeldung(null);

    verschieben.mutate(
      {
        aufgabenId: bewegteId,
        verschiebung: plan.verschiebung,
        vorschau: plan.vorschau,
      },
      {
        onError: (fehler) => {
          /**
           * ==================================================================
           * EIN 409 IST KEINE STOERUNG
           * ==================================================================
           * Er sagt: Jemand anderes hat diese Karte inzwischen verschoben. Die
           * Anzeige ist durch das Rollback bereits zurueckgesetzt, und
           * `onSettled` laedt den echten Stand nach.
           *
           * Der Nutzer bekommt deshalb eine Erklaerung, keine Fehlermeldung -
           * "etwas ist schiefgelaufen" waere sachlich falsch. Es ist alles
           * richtig gelaufen, nur nicht so, wie er es sich gedacht hat.
           */
          setMeldung(verschiebeMeldung(fehler));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {meldung && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800
            dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {meldung}
        </p>
      )}

      <DndContext
        sensors={sensoren}
        // `closestCorners` statt `closestCenter`: Bei Listen unterschiedlicher
        // Laenge trifft der Mittelpunkt-Vergleich die falsche Spalte, sobald
        // eine Karte ueber den Rand hinausragt.
        collisionDetection={closestCorners}
        onDragEnd={beimAblegen}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {SPALTEN.map((spalte) => (
            <Spalte
              key={spalte.status}
              status={spalte.status}
              titel={spalte.titel}
              aufgaben={gruppen[spalte.status]}
              orgId={orgId}
              projektId={projektId}
              schreibgeschuetzt={schreibgeschuetzt}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Spalte({
  status,
  titel,
  aufgaben,
  orgId,
  projektId,
  schreibgeschuetzt,
}: {
  status: AufgabenStatus;
  titel: string;
  aufgaben: Aufgabe[];
  orgId: string;
  projektId: string;
  schreibgeschuetzt: boolean;
}) {
  // Die Spalte selbst ist ein Ablageziel - sonst liesse sich in eine LEERE
  // Spalte gar nichts ablegen, weil es dort keine Karte gibt, ueber der man
  // haengen koennte.
  const { setNodeRef, isOver } = useDroppable({ id: spaltenId(status) });

  return (
    <section
      ref={setNodeRef}
      aria-label={titel}
      className={`flex min-h-40 flex-col gap-2 rounded-lg border p-3 transition
        ${
          isOver
            ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30'
            : 'border-zinc-200 dark:border-zinc-800'
        }`}
    >
      <h3 className="flex items-center justify-between text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {titel}
        <span className="text-xs text-zinc-400">{aufgaben.length}</span>
      </h3>

      <SortableContext
        items={aufgaben.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-2">
          {aufgaben.map((aufgabe) => (
            <Karte
              key={aufgabe.id}
              aufgabe={aufgabe}
              orgId={orgId}
              projektId={projektId}
              schreibgeschuetzt={schreibgeschuetzt}
            />
          ))}
        </ul>
      </SortableContext>

      {!schreibgeschuetzt && (
        <NeueAufgabe
          orgId={orgId}
          projektId={projektId}
          status={status}
          spaltenTitel={titel}
        />
      )}
    </section>
  );
}

function Karte({
  aufgabe,
  orgId,
  projektId,
  schreibgeschuetzt,
}: {
  aufgabe: Aufgabe;
  orgId: string;
  projektId: string;
  schreibgeschuetzt: boolean;
}) {
  const loeschen = useAufgabeLoeschen(orgId, projektId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: aufgabe.id, disabled: schreibgeschuetzt });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900
        ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/*
          Die Ziehgriffe sitzen am Titel, nicht an der ganzen Karte: Sonst
          waere der Loeschen-Knopf Teil der Ziehflaeche und liesse sich kaum
          treffen. `attributes` bringt die ARIA-Angaben mit, die dnd-kit fuer
          die Tastaturbedienung braucht.
        */}
        <span
          {...attributes}
          {...listeners}
          className={schreibgeschuetzt ? '' : 'cursor-grab'}
        >
          {aufgabe.title}
        </span>

        {!schreibgeschuetzt && (
          <button
            type="button"
            aria-label={`${aufgabe.title} löschen`}
            onClick={() => loeschen.mutate(aufgabe.id)}
            className="text-xs text-zinc-400 transition hover:text-red-600"
          >
            ✕
          </button>
        )}
      </div>

      {aufgabe.assignee && (
        <p className="mt-1 text-xs text-zinc-500">
          {aufgabe.assignee.name ?? aufgabe.assignee.email}
        </p>
      )}
    </li>
  );
}

function NeueAufgabe({
  orgId,
  projektId,
  status,
  spaltenTitel,
}: {
  orgId: string;
  projektId: string;
  status: AufgabenStatus;
  /**
   * Die BESCHRIFTUNG der Spalte, nicht ihr Status-Wert.
   *
   * Das Feld hat keine sichtbare Beschriftung - es steht unter der Spalte, und
   * fuer sehende Nutzer ergibt sich der Zusammenhang aus der Anordnung. Ein
   * Screenreader hat diese Anordnung nicht; fuer ihn IST das `aria-label` der
   * Name des Feldes.
   *
   * Stuende dort der Enum-Wert, hiesse das Feld "Neue Aufgabe in IN_PROGRESS"
   * - eine interne Kennung, vorgelesen an einen Menschen. Genau die Sorte
   * Fehler, die man beim Draufschauen nie bemerkt.
   */
  spaltenTitel: string;
}) {
  const anlegen = useAufgabeAnlegen(orgId, projektId);
  const [titel, setTitel] = useState('');

  const absenden = (ereignis: React.FormEvent) => {
    ereignis.preventDefault();

    // Dieselbe Mindestlaenge wie im Backend - hier als Bequemlichkeit, damit
    // keine Anfrage laeuft, die ohnehin mit 400 endet.
    if (titel.trim().length < 2) {
      return;
    }

    anlegen.mutate(
      { title: titel.trim(), status },
      { onSuccess: () => setTitel('') },
    );
  };

  return (
    <form onSubmit={absenden} className="mt-1 flex gap-1">
      <input
        value={titel}
        onChange={(ereignis) => setTitel(ereignis.target.value)}
        aria-label={`Neue Aufgabe in ${spaltenTitel}`}
        placeholder="Neue Aufgabe …"
        className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none
          focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {/*
        Gesperrt, solange der Titel zu kurz ist.

        Vorher war der Knopf immer bedienbar und `absenden` brach still ab -
        ein Klick auf ein leeres Feld tat also NICHTS, ohne jede Rueckmeldung.
        Wer das ausprobiert, sucht die Ursache anschliessend an der falschen
        Stelle; bei einem Nutzer war es eine unabhaengige Fehlermeldung
        daneben, die er dem Klick zugeschrieben hat.

        Ein gesperrter Knopf sagt dasselbe wie das stille Abbrechen - nur
        vorher und sichtbar.
      */}
      <button
        type="submit"
        disabled={titel.trim().length < 2}
        title={titel.trim().length < 2 ? 'Mindestens zwei Zeichen' : undefined}
        className="rounded-lg border border-zinc-300 px-2 text-sm transition hover:bg-zinc-50
          disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent
          dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        +
      </button>
    </form>
  );
}
