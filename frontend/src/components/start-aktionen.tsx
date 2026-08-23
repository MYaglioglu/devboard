'use client';

import Link from 'next/link';

import { useAuth } from '@/lib/auth-context';

/**
 * Die Handlungsaufforderungen der Startseite.
 *
 * Eigene Client-Komponente, weil sie den Anmeldezustand kennen muss - und
 * NUR sie. Der Rest der Startseite bleibt dadurch eine Server-Komponente:
 * Er wird als fertiges HTML ausgeliefert, ohne dass der Browser erst
 * JavaScript ausfuehren und den Anmeldezustand klaeren muss.
 *
 * Das ist der eigentliche Sinn der Grenze zwischen Server- und
 * Client-Komponenten: nicht "alles auf den Server", sondern die
 * Interaktivitaet auf die kleinstmoegliche Insel begrenzen.
 */
export function StartAktionen() {
  const { nutzer, laedt } = useAuth();

  // Waehrend der Klaerung bewusst die angemeldete Variante NICHT vorwegnehmen:
  // Ein Knopf, der nach einer halben Sekunde seine Beschriftung wechselt,
  // wirkt kaputt. Lieber die Variante fuer Besucher zeigen - das ist der
  // haeufigere Fall und der, der ohnehin passt, wenn niemand angemeldet ist.
  if (!laedt && nutzer) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Zum Dashboard
        </Link>
        <Link
          href="/organizations"
          className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Organisationen
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/register"
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        Konto anlegen
      </Link>
      <Link
        href="/login"
        className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Anmelden
      </Link>
    </div>
  );
}
