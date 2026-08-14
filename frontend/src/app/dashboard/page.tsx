'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AktivitaetsFeed } from '@/components/aktivitaets-feed';
import { Geschuetzt } from '@/components/geschuetzt';
import { KennzahlenKacheln } from '@/components/kennzahlen';
import { useAktiveOrganisation } from '@/lib/aktive-organisation';
import { useAuth } from '@/lib/auth-context';
import { useOrganisationen } from '@/lib/organisationen';

/**
 * ============================================================================
 * DIESE SEITE HAT IN SPRINT 4 IHREN ZWECK BEKOMMEN
 * ============================================================================
 * Bis hierher zeigte sie die Antwort von `GET /auth/me` in einer
 * Definitionsliste - eine Sichtprobe aus Sprint 1, die belegen sollte, dass
 * der Token funktioniert. Als Nachweis war sie richtig; als Startseite war sie
 * eine Schuld, die niemand eingetragen hatte.
 *
 * Jetzt beantwortet sie die Frage, mit der man eine Anwendung oeffnet: Was ist
 * hier los? Links die Zahlen, darunter der Verlauf.
 */
export default function DashboardSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  const { nutzer, abmelden } = useAuth();
  const router = useRouter();

  const { data: organisationen, isPending, isError } = useOrganisationen();
  const { aktive } = useAktiveOrganisation(organisationen);

  const jetztAbmelden = async () => {
    await abmelden();
    router.replace('/login');
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DevBoard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {/* Die aktive Organisation gehoert in die Kopfzeile, nicht in eine
                Ecke: Jede Zahl auf dieser Seite gilt nur fuer sie. Ein
                Dashboard ohne sichtbaren Mandanten ist die Einladung, Zahlen
                der falschen Organisation zuzuordnen. */}
            {aktive ? aktive.name : `Angemeldet als ${nutzer?.email}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/organizations"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm
              transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Organisationen
          </Link>
          <button
            onClick={() => void jetztAbmelden()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm
              transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Abmelden
          </button>
        </div>
      </header>

      {isError && (
        <p className="text-sm text-red-600">
          Die Organisationen konnten nicht geladen werden.
        </p>
      )}

      {/* ====================================================================
          DER FALL "NOCH GAR KEINE ORGANISATION"
          ====================================================================
          Kennzahlen und Feed brauchen einen Mandanten. Ohne ihn saehe man
          zweimal "keine Daten" - und wuesste nicht, ob nichts passiert ist
          oder ob etwas fehlt. Die leere Ansicht sagt stattdessen, was zu tun
          ist. */}
      {!isPending && !isError && !aktive ? (
        <section className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">
            Sie gehören noch zu keiner Organisation.
          </p>
          <Link
            href="/organizations"
            className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-sm
              transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Organisation anlegen
          </Link>
        </section>
      ) : (
        <>
          <section>
            <h2 className="sr-only">Kennzahlen</h2>
            {/* `aktive?.id` ist waehrend des Ladens `undefined` - die Haken
                schalten sich dann per `enabled` selbst ab. Die Alternative
                waere, hier gar nichts zu rendern; dann spraenge das Layout,
                sobald die Zahlen da sind. */}
            <KennzahlenKacheln orgId={aktive?.id} />
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-zinc-500">Aktivität</h2>
              {aktive && (
                <Link
                  href={`/organizations/${aktive.id}/projects`}
                  className="text-sm text-zinc-500 underline-offset-4 hover:underline"
                >
                  Zu den Projekten
                </Link>
              )}
            </div>
            <AktivitaetsFeed orgId={aktive?.id} />
          </section>
        </>
      )}
    </main>
  );
}
