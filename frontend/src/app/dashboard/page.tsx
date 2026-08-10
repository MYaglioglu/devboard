'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Geschuetzt } from '@/components/geschuetzt';
import { useAuth } from '@/lib/auth-context';
import type { Nutzer } from '@/lib/api';

export default function DashboardSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  const { nutzer, abmelden, authFetch } = useAuth();
  const router = useRouter();

  /**
   * Ruft den geschuetzten Endpoint auf.
   *
   * ==========================================================================
   * WAS TanStack QUERY HIER ABNIMMT
   * ==========================================================================
   * Ohne die Bibliothek braeuchte es fuer denselben Effekt drei useState
   * (Daten, Ladezustand, Fehler), einen useEffect, eine Abbruchbehandlung beim
   * Verlassen der Seite und eine eigene Zwischenspeicherung. Genau diese
   * Handarbeit hat frueher in jeder React-Anwendung anders ausgesehen.
   *
   * `authFetch` haengt den Bearer-Token an und holt bei 401 automatisch einen
   * neuen ueber das Refresh-Cookie - dieser Aufruf funktioniert also auch
   * dann, wenn der Access-Token gerade abgelaufen ist.
   */
  const { data, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authFetch<Nutzer>('/auth/me'),
  });

  const jetztAbmelden = async () => {
    await abmelden();
    router.replace('/login');
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DevBoard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Angemeldet als {nutzer?.email}
          </p>
        </div>
        <button
          onClick={() => void jetztAbmelden()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm
            transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Abmelden
        </button>
      </header>

      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">
          Antwort von <code>GET /auth/me</code>
        </h2>

        {isPending && <p className="mt-3 text-sm text-zinc-500">Lade …</p>}
        {isError && (
          <p className="mt-3 text-sm text-red-600">
            Profil konnte nicht geladen werden.
          </p>
        )}
        {data && (
          <dl className="mt-3 space-y-2 text-sm">
            <Zeile bezeichnung="ID" wert={data.id} />
            <Zeile bezeichnung="E-Mail" wert={data.email} />
          </dl>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Diese Seite ist nur mit gültigem Access-Token erreichbar. Der Token
        liegt ausschließlich im Arbeitsspeicher – beim Neuladen wird die Sitzung
        still über das httpOnly-Cookie wiederhergestellt.
      </p>
    </main>
  );
}

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{bezeichnung}</dt>
      <dd className="font-mono text-xs">{wert}</dd>
    </div>
  );
}
