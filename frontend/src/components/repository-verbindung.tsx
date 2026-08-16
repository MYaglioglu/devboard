'use client';

import { useState } from 'react';

import { Hinweis, Knopf } from '@/components/ui';
import {
  useRepository,
  useRepositoryTrennen,
  useRepositoryVerbinden,
} from '@/lib/repository';
import type { VerbindungMitGeheimnis } from '@/lib/repository';

/**
 * ============================================================================
 * DAS REPOSITORY EINES PROJEKTS
 * ============================================================================
 * Drei Zustaende, und alle drei muessen unterscheidbar sein:
 *
 *   nichts verbunden  -> Formular (nur OWNER und ADMIN)
 *   gerade verbunden  -> die Anleitung MIT dem Geheimnis, einmalig
 *   verbunden         -> Name, URL, Trennen
 *
 * Der mittlere ist der heikle. Er lebt nur im Zustand dieser Komponente: Wer
 * die Seite neu laedt, sieht ihn nicht wieder, und das ist Absicht.
 */
export function RepositoryVerbindung({
  orgId,
  projektId,
  darfVerwalten,
}: {
  orgId: string;
  projektId: string;
  darfVerwalten: boolean;
}) {
  const {
    data: verbindung,
    isPending,
    isError,
  } = useRepository(orgId, projektId);
  const verbinden = useRepositoryVerbinden(orgId, projektId);
  const trennen = useRepositoryTrennen(orgId, projektId);

  const [eingabe, setEingabe] = useState('');
  const [frischVerbunden, setFrischVerbunden] =
    useState<VerbindungMitGeheimnis | null>(null);

  if (isPending) {
    return (
      <div className="h-24 animate-pulse rounded-xl bg-flaeche-gedaempft" />
    );
  }

  if (isError) {
    return (
      <Hinweis>Die Repository-Verbindung konnte nicht geladen werden.</Hinweis>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-rand p-5">
      <div>
        <h2 className="font-medium">GitHub</h2>
        <p className="mt-1 text-sm text-leise">
          Pushes und Pull Requests dieses Repositories erscheinen im
          Aktivitäts-Feed.
        </p>
      </div>

      {frischVerbunden ? (
        <Anleitung
          verbindung={frischVerbunden}
          beimSchliessen={() => setFrischVerbunden(null)}
        />
      ) : verbindung ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-leise">Repository</dt>
              <dd className="font-mono">{verbindung.repositoryFullName}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-leise">Webhook-URL</dt>
              <dd>
                <Kopierfeld wert={verbindung.webhookUrl} />
              </dd>
            </div>
          </dl>

          {darfVerwalten && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => trennen.mutate()}
                disabled={trennen.isPending}
                className="rounded-lg border border-gefahr px-3 py-1.5 text-sm text-gefahr
                  transition hover:bg-gefahr-leise disabled:opacity-50"
              >
                {trennen.isPending ? 'Einen Moment …' : 'Verbindung trennen'}
              </button>
              {/* Der Nebensatz ist wichtiger als der Knopf: Trennen macht den
                  in GitHub eingetragenen Webhook unbrauchbar, und das sieht
                  man dort nicht. */}
              <p className="text-xs text-still">
                Der Webhook in GitHub hört danach auf zu funktionieren.
              </p>
            </div>
          )}
        </div>
      ) : darfVerwalten ? (
        <form
          onSubmit={(ereignis) => {
            ereignis.preventDefault();

            verbinden.mutate(eingabe.trim(), {
              onSuccess: (ergebnis) => {
                setFrischVerbunden(ergebnis);
                setEingabe('');
              },
            });
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="repository" className="text-sm text-leise">
            Repository
          </label>
          <div className="flex gap-2">
            <input
              id="repository"
              value={eingabe}
              onChange={(ereignis) => setEingabe(ereignis.target.value)}
              // Ein Platzhalter, der ein echtes Beispiel zeigt, statt die
              // Beschriftung zu wiederholen.
              placeholder="owner/repo"
              className="min-w-0 flex-1 rounded-lg border border-rand bg-transparent px-3 py-2
                font-mono text-sm outline-none transition"
            />
            <Knopf laedt={verbinden.isPending} disabled={eingabe.trim() === ''}>
              Verbinden
            </Knopf>
          </div>

          {verbinden.isError && (
            <Hinweis>
              {verbinden.error instanceof Error
                ? verbinden.error.message
                : 'Das Repository konnte nicht verbunden werden.'}
            </Hinweis>
          )}
        </form>
      ) : (
        <p className="text-sm text-still">
          Kein Repository verbunden. Nur Eigentümer und Administratoren können
          eines verbinden.
        </p>
      )}
    </section>
  );
}

/**
 * Die einmalige Anleitung nach dem Verbinden.
 *
 * ============================================================================
 * WARUM DIESER KASTEN NICHT VON SELBST VERSCHWINDET
 * ============================================================================
 * Ein Zeitgeber waere bequem und hier falsch: Wer das Geheimnis noch nicht
 * kopiert hat, verliert es. Es steht nirgends sonst - auch wir koennen es
 * nicht noch einmal anzeigen, ohne die Verbindung neu anzulegen.
 *
 * Deshalb schliesst nur ein ausdruecklicher Klick, und der Text sagt vorher,
 * was das bedeutet.
 */
function Anleitung({
  verbindung,
  beimSchliessen,
}: {
  verbindung: VerbindungMitGeheimnis;
  beimSchliessen: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-akzent bg-akzent-leise p-4">
      <p className="text-sm font-medium">
        Verbunden mit{' '}
        <span className="font-mono">{verbindung.repositoryFullName}</span>
      </p>

      <ol className="flex list-inside list-decimal flex-col gap-3 text-sm">
        <li>
          In GitHub unter <em>Settings → Webhooks → Add webhook</em> diese
          beiden Werte eintragen:
        </li>
      </ol>

      <div className="flex flex-col gap-2">
        <Kopierfeld beschriftung="Payload URL" wert={verbindung.webhookUrl} />
        <Kopierfeld beschriftung="Secret" wert={verbindung.geheimnis} />
      </div>

      <p className="text-sm">
        Als <em>Content type</em>{' '}
        <span className="font-mono">application/json</span> wählen und die
        Ereignisse <em>Pushes</em> und <em>Pull requests</em> abonnieren.
      </p>

      <p className="text-xs text-leise">
        <strong>Das Secret wird nur dieses eine Mal angezeigt.</strong> Danach
        liegt es verschlüsselt in der Datenbank und ist nicht mehr abrufbar –
        wer es verliert, trennt die Verbindung und legt sie neu an.
      </p>

      <button
        onClick={beimSchliessen}
        className="self-start rounded-lg border border-rand bg-flaeche px-3 py-1.5 text-sm
          transition hover:bg-flaeche-gedaempft"
      >
        Habe ich kopiert
      </button>
    </div>
  );
}

/**
 * Ein Wert zum Kopieren.
 *
 * `readOnly` statt `disabled`: Ein deaktiviertes Feld laesst sich nicht
 * markieren und nicht vorlesen. Es soll unveraenderbar sein, nicht
 * unerreichbar.
 */
function Kopierfeld({
  beschriftung,
  wert,
}: {
  beschriftung?: string;
  wert: string;
}) {
  const [kopiert, setKopiert] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {beschriftung && (
        <span className="text-xs text-leise">{beschriftung}</span>
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={wert}
          onFocus={(ereignis) => ereignis.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-rand bg-flaeche px-3 py-1.5
            font-mono text-xs outline-none"
        />
        <button
          type="button"
          onClick={() => {
            // `navigator.clipboard` gibt es nur in sicheren Kontexten - ueber
            // http auf einem fremden Host also nicht. Der Fehlerfall ist
            // deshalb kein Sonderfall: Dann bleibt es beim Markieren von Hand,
            // und der Knopf sagt nichts Falsches.
            void navigator.clipboard
              ?.writeText(wert)
              .then(() => setKopiert(true))
              .catch(() => undefined);
          }}
          className="shrink-0 rounded-lg border border-rand px-3 py-1.5 text-xs
            transition hover:bg-flaeche-gedaempft"
        >
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
    </div>
  );
}
