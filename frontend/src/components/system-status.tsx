'use client';

import { useEffect, useState } from 'react';

import { fetchHealth, type HealthStatus } from '@/lib/api';

type Zustand =
  | { art: 'laedt' }
  | { art: 'geladen'; daten: HealthStatus }
  | { art: 'fehler' };

/**
 * Kleine Statusanzeige in der Fusszeile.
 *
 * Frueher war das die GANZE Startseite - ein Rauchtest, der beweisen sollte,
 * dass Frontend und Backend sich sehen. Als erste Seite fuer Besucher war das
 * falsch: Wer die Adresse aufruft, will wissen, was die Anwendung KANN, nicht
 * wie hoch ihre Laufzeit ist.
 *
 * Weggeworfen wurde sie trotzdem nicht. Ein sichtbarer Live-Status ist ein
 * kleiner, ehrlicher Beleg dafuer, dass hinter der Seite tatsaechlich etwas
 * laeuft - und er kostet eine Zeile in der Fusszeile statt eines Bildschirms.
 *
 * 'use client', weil hier nach dem Laden im Browser abgefragt wird. Die
 * uebrige Startseite bleibt dadurch eine Server-Komponente und wird
 * ausgeliefert, ohne auf das Backend zu warten.
 */
export function SystemStatus() {
  const [zustand, setZustand] = useState<Zustand>({ art: 'laedt' });

  useEffect(() => {
    let abgebrochen = false;

    fetchHealth()
      .then((daten) => {
        if (!abgebrochen) setZustand({ art: 'geladen', daten });
      })
      .catch(() => {
        if (!abgebrochen) setZustand({ art: 'fehler' });
      });

    // Aufraeumen: verhindert setState auf einer nicht mehr sichtbaren Komponente.
    return () => {
      abgebrochen = true;
    };
  }, []);

  if (zustand.art === 'laedt') {
    return <span className="text-zinc-400">Status wird geprüft …</span>;
  }

  const gesund =
    zustand.art === 'geladen' && zustand.daten.checks.database === 'up';

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${gesund ? 'bg-emerald-500' : 'bg-red-500'}`}
      />
      {/* Die Farbe allein waere keine Information - wer sie nicht unterscheiden
          kann, braucht den Text daneben. Deshalb ist der Punkt aria-hidden und
          die Aussage steht ausgeschrieben da. */}
      {gesund ? 'API erreichbar, Datenbank verbunden' : 'API nicht erreichbar'}
    </span>
  );
}
