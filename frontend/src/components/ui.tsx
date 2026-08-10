/**
 * Kleine, wiederverwendbare Bausteine.
 *
 * Bewusst handgeschrieben statt shadcn/ui: In dieser Scheibe braucht es zwei
 * Eingabefelder und einen Button. shadcn kommt in Sprint 3 mit dem
 * Kanban-Board, wo die Vielfalt an Komponenten den Einrichtungsaufwand
 * rechtfertigt.
 */
'use client';

import { useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

/**
 * Beschriftetes Eingabefeld mit Fehleranzeige.
 *
 * ============================================================================
 * WARUM DIE FEHLERMELDUNG NICHT IM <label> STEHT
 * ============================================================================
 * Naheliegend waere, alles in ein umschliessendes <label> zu packen - dann
 * spart man sich `htmlFor` und `id`. Genau das war die erste Fassung, und sie
 * hatte einen Fehler, den ein Test aufgedeckt hat:
 *
 * Der ZUGAENGLICHE NAME eines Feldes ist der gesamte Textinhalt seines Labels.
 * Steht die Fehlermeldung mit darin, heisst das Feld ploetzlich
 * "E-Mail Bitte eine gueltige E-Mail-Adresse angeben" - und ein Screenreader
 * liest genau das als Feldnamen vor.
 *
 * Richtig ist die Trennung:
 *   - `htmlFor` / `id`      verbindet Label und Feld  -> der NAME
 *   - `aria-describedby`    verbindet Fehler und Feld -> die BESCHREIBUNG
 *   - `aria-invalid`        markiert den Fehlerzustand
 *
 * Screenreader lesen dann: Name, Zustand, Beschreibung - in dieser Reihenfolge.
 */
export function Feld({
  label,
  fehler,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  fehler?: string;
}) {
  // `useId` erzeugt eine Kennung, die auf Server und Client identisch ist -
  // ein selbst gebauter Zufallswert wuerde beim Hydrieren abweichen und eine
  // Hydration-Warnung ausloesen.
  const erzeugteId = useId();
  const feldId = id ?? erzeugteId;
  const fehlerId = `${feldId}-fehler`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={feldId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <input
        {...rest}
        id={feldId}
        // Ohne aria-invalid waere die rote Umrandung fuer Screenreader
        // unsichtbar - der Fehler existierte nur fuer sehende Nutzer.
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? fehlerId : undefined}
        className={`rounded-lg border px-3 py-2 text-sm outline-none transition
          focus:ring-2 focus:ring-emerald-500/40
          dark:bg-zinc-900 dark:text-zinc-100
          ${
            fehler
              ? 'border-red-500 dark:border-red-500'
              : 'border-zinc-300 dark:border-zinc-700'
          }`}
      />
      {fehler && (
        <span
          id={fehlerId}
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {fehler}
        </span>
      )}
    </div>
  );
}

export function Knopf({
  children,
  laedt,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  laedt?: boolean;
}) {
  return (
    <button
      {...rest}
      type={rest.type ?? 'submit'}
      disabled={rest.disabled ?? laedt}
      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white
        transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {laedt ? 'Einen Moment …' : children}
    </button>
  );
}

export function Hinweis({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700
        dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {children}
    </p>
  );
}

export function Karte({
  titel,
  untertitel,
  children,
}: {
  titel: string;
  untertitel?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{titel}</h1>
        {untertitel && (
          <p className="mt-1 text-sm text-zinc-500">{untertitel}</p>
        )}
      </header>
      {children}
    </main>
  );
}
