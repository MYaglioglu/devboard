'use client';

import Link from 'next/link';

import { AktivitaetsFeed } from '@/components/aktivitaets-feed';
import { SeitenKopf } from '@/components/app-huelle';
import { KennzahlenKacheln } from '@/components/kennzahlen';
import { useAktiveOrganisation } from '@/lib/aktive-organisation';
import { useOrganisationen } from '@/lib/organisationen';

/**
 * ============================================================================
 * WAS AUS DIESER SEITE VERSCHWUNDEN IST
 * ============================================================================
 * Der `Geschuetzt`-Rahmen, die Kopfzeile mit "DevBoard", der Link zu den
 * Organisationen und der Abmelden-Knopf. Alle vier stehen jetzt in der Huelle
 * beziehungsweise in der Seitenleiste - also an einer Stelle statt auf jeder
 * Seite neu.
 *
 * Uebrig bleibt das, was diese Seite AUSMACHT: die Zahlen und der Verlauf.
 * Genau das ist der Zweck einer Huelle.
 */
export default function DashboardSeite() {
  const { data: organisationen, isPending, isError } = useOrganisationen();
  const { aktive } = useAktiveOrganisation(organisationen);

  return (
    <SeitenKopf
      titel="Dashboard"
      // Die aktive Organisation steht zusaetzlich in der Seitenleiste. Hier
      // steht sie trotzdem: Jede Zahl auf dieser Seite gilt nur fuer sie, und
      // eine Kennzahl ohne sichtbaren Mandanten ist die Einladung, sie der
      // falschen Organisation zuzuordnen.
      beschreibung={aktive?.name}
      aktionen={
        aktive && (
          <Link
            href={`/organizations/${aktive.id}/projects`}
            className="rounded-lg border border-rand px-3 py-1.5 text-sm transition hover:bg-flaeche-gedaempft"
          >
            Zu den Projekten
          </Link>
        )
      }
    >
      {isError && (
        <p className="text-sm text-gefahr">
          Die Organisationen konnten nicht geladen werden.
        </p>
      )}

      {/* Der Fall "noch gar keine Organisation": Kennzahlen und Feed brauchen
          einen Mandanten. Ohne ihn saehe man zweimal "keine Daten" - und
          wuesste nicht, ob nichts passiert ist oder ob etwas fehlt. */}
      {!isPending && !isError && !aktive ? (
        <section className="rounded-xl border border-dashed border-rand p-8 text-center">
          <p className="text-sm text-leise">
            Sie gehören noch zu keiner Organisation.
          </p>
          <Link
            href="/organizations"
            className="mt-3 inline-block rounded-lg border border-rand px-3 py-1.5 text-sm transition hover:bg-flaeche-gedaempft"
          >
            Organisation anlegen
          </Link>
        </section>
      ) : (
        <>
          <section>
            <h2 className="sr-only">Kennzahlen</h2>
            <KennzahlenKacheln orgId={aktive?.id} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-leise">Aktivität</h2>
            <AktivitaetsFeed orgId={aktive?.id} />
          </section>
        </>
      )}
    </SeitenKopf>
  );
}
