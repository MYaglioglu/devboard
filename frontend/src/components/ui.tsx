/**
 * Kleine, wiederverwendbare Bausteine.
 *
 * Bewusst handgeschrieben statt shadcn/ui: In dieser Scheibe braucht es zwei
 * Eingabefelder und einen Button. shadcn kommt in Sprint 3 mit dem
 * Kanban-Board, wo die Vielfalt an Komponenten den Einrichtungsaufwand
 * rechtfertigt.
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

export function Feld({
  label,
  fehler,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  fehler?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <input
        {...rest}
        // aria-invalid teilt Screenreadern mit, dass das Feld fehlerhaft ist -
        // ohne diese Angabe waere die rote Umrandung fuer sie unsichtbar.
        aria-invalid={fehler ? true : undefined}
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
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {fehler}
        </span>
      )}
    </label>
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
