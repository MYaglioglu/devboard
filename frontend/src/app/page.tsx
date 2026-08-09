'use client';

import { useEffect, useState } from 'react';

import { API_BASE_URL, fetchHealth, type HealthStatus } from '@/lib/api';

type Zustand =
  | { art: 'laedt' }
  | { art: 'geladen'; daten: HealthStatus }
  | { art: 'fehler'; meldung: string };

export default function Home() {
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' });

  useEffect(() => {
    let abgebrochen = false;

    fetchHealth()
      .then((daten) => {
        if (!abgebrochen) setZustand({ art: 'geladen', daten });
      })
      .catch((fehler: unknown) => {
        if (!abgebrochen) {
          setZustand({
            art: 'fehler',
            meldung: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler',
          });
        }
      });

    // Aufraeumen: verhindert setState auf einer nicht mehr sichtbaren Komponente.
    return () => {
      abgebrochen = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">DevBoard</h1>
        <p className="mt-1 text-sm text-zinc-500">Systemstatus</p>
      </header>

      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        {zustand.art === 'laedt' && (
          <p className="text-zinc-500">Frage Backend ab …</p>
        )}

        {zustand.art === 'fehler' && (
          <div className="space-y-2">
            <StatusZeile bezeichnung="Backend" wert="nicht erreichbar" gut={false} />
            <p className="text-sm text-red-600 dark:text-red-400">
              {zustand.meldung}
            </p>
            <p className="text-xs text-zinc-500">
              Konsole des Browsers öffnen (F12) – dort steht der eigentliche Grund.
            </p>
          </div>
        )}

        {zustand.art === 'geladen' && (
          <dl className="space-y-3">
            <StatusZeile
              bezeichnung="Backend"
              wert="erreichbar"
              gut={true}
            />
            <StatusZeile
              bezeichnung="Datenbank"
              wert={zustand.daten.checks.database === 'up' ? 'verbunden' : 'ausgefallen'}
              gut={zustand.daten.checks.database === 'up'}
            />
            <StatusZeile
              bezeichnung="Laufzeit"
              wert={`${zustand.daten.uptimeSeconds} s`}
              gut={true}
            />
          </dl>
        )}
      </section>

      <footer className="text-xs text-zinc-500">
        Frontend :3001 → Backend {API_BASE_URL} → PostgreSQL :5432
      </footer>
    </main>
  );
}

function StatusZeile({
  bezeichnung,
  wert,
  gut,
}: {
  bezeichnung: string;
  wert: string;
  gut: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-600 dark:text-zinc-400">{bezeichnung}</dt>
      <dd className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${
            gut ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        />
        {wert}
      </dd>
    </div>
  );
}
