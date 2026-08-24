'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
 *
 * ============================================================================
 * WARUM DIE DEMO DER ERSTE KNOPF IST
 * ============================================================================
 * Wer diese Seite aus einer Bewerbung heraus anklickt, legt sich kein Konto
 * an - er sieht ein Anmeldeformular und geht wieder. Alles, was hinter der
 * Anmeldung liegt, waere damit unsichtbar.
 *
 * Die Demo nimmt diese Huerde weg: ein Klick, und man steht in einer
 * gefuellten Anwendung. "Konto anlegen" bleibt daneben stehen, tritt aber
 * bewusst zurueck.
 */
export function StartAktionen() {
  const { nutzer, laedt, demoStarten } = useAuth();
  const router = useRouter();
  const [demoLaeuft, setDemoLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const aufDemo = async () => {
    setDemoLaeuft(true);
    setFehler(null);

    try {
      await demoStarten();
      router.push('/dashboard');
    } catch {
      // Der haeufigste Grund ist die Drosselung: Wer den Knopf mehrfach
      // drueckt, laeuft in die Grenze. Eine Fehlermeldung ist hier ehrlicher
      // als ein Knopf, der stumm nichts tut.
      setFehler(
        'Die Demo konnte nicht gestartet werden. Bitte in einigen Minuten erneut versuchen.',
      );
      // Nur im Fehlerfall zuruecksetzen: Im Erfolgsfall laeuft die
      // Weiterleitung noch, und ein wieder aktiver Knopf luede zum zweiten
      // Klick ein - der eine zweite Umgebung anlegen wuerde.
      setDemoLaeuft(false);
    }
  };

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void aufDemo()}
          disabled={demoLaeuft}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white
            transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {demoLaeuft ? 'Wird vorbereitet …' : 'Demo ansehen'}
        </button>
        <Link
          href="/register"
          className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Konto anlegen
        </Link>
        <Link
          href="/login"
          className="text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Anmelden
        </Link>
      </div>

      <p className="text-sm text-zinc-500">
        Die Demo legt eine eigene Umgebung mit Beispieldaten an – ohne
        Registrierung. Sie wird nach 24 Stunden automatisch gelöscht.
      </p>

      {fehler && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fehler}
        </p>
      )}
    </div>
  );
}
