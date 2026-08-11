'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Geschuetzt } from '@/components/geschuetzt';
import { Hinweis } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  useMitglieder,
  useMitgliedEntfernen,
  useOrganisation,
  useRolleAendern,
} from '@/lib/organisationen';
import type { Mitglied, Rolle } from '@/lib/organisationen';

const ROLLEN_TEXT: Record<Rolle, string> = {
  OWNER: 'Eigentümer',
  ADMIN: 'Administrator',
  MEMBER: 'Mitglied',
};

export default function OrganisationSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  // `useParams` liest den dynamischen Teil der Route in einer
  // Client-Komponente. Server-Komponenten bekommen `params` stattdessen als
  // Eigenschaft - hier nicht moeglich, weil die ganze Seite am Access-Token
  // im Arbeitsspeicher haengt und deshalb im Browser laufen muss.
  const { orgId } = useParams<{ orgId: string }>();

  const organisation = useOrganisation(orgId);
  const mitglieder = useMitglieder(orgId);

  if (organisation.isPending) {
    return <Rahmen>Lade …</Rahmen>;
  }

  /**
   * ==========================================================================
   * 404 IST HIER KEIN FEHLER, SONDERN EINE AUSSAGE
   * ==========================================================================
   * Das Backend antwortet mit 404, wenn die Organisation nicht existiert ODER
   * der Nutzer kein Mitglied ist - ununterscheidbar, und das mit Absicht.
   *
   * Im Frontend darf daraus keine allgemeine Fehlermeldung werden ("etwas ist
   * schiefgelaufen"). Der Nutzer soll verstehen, dass er hier nichts zu suchen
   * hat, und einen Weg zurueck bekommen. Ein Ladefehler waere eine falsche
   * Erklaerung und wuerde ihn zum Neuladen verleiten.
   */
  if (organisation.isError) {
    const nichtGefunden =
      organisation.error instanceof ApiFehler &&
      organisation.error.status === 404;

    return (
      <Rahmen>
        <Hinweis>
          {nichtGefunden
            ? 'Diese Organisation existiert nicht oder Sie sind kein Mitglied.'
            : 'Die Organisation konnte nicht geladen werden.'}
        </Hinweis>
        <p className="mt-4 text-sm">
          <Link
            href="/organizations"
            className="text-emerald-600 hover:underline"
          >
            Zurück zur Übersicht
          </Link>
        </p>
      </Rahmen>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-8">
      <header>
        <Link
          href="/organizations"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Übersicht
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {organisation.data.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ihre Rolle: {ROLLEN_TEXT[organisation.data.role]}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">Mitglieder</h2>

        {mitglieder.isPending && (
          <p className="text-sm text-zinc-500">Lade …</p>
        )}
        {mitglieder.isError && (
          <Hinweis>Mitglieder konnten nicht geladen werden.</Hinweis>
        )}

        {mitglieder.data && (
          <ul className="flex flex-col gap-2">
            {mitglieder.data.map((mitglied) => (
              <MitgliedZeile
                key={mitglied.userId}
                orgId={orgId}
                mitglied={mitglied}
                eigeneRolle={organisation.data.role}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center p-8">
      {children}
    </main>
  );
}

function MitgliedZeile({
  orgId,
  mitglied,
  eigeneRolle,
}: {
  orgId: string;
  mitglied: Mitglied;
  eigeneRolle: Rolle;
}) {
  const { nutzer } = useAuth();
  const router = useRouter();
  const rolleAendern = useRolleAendern(orgId);
  const entfernen = useMitgliedEntfernen(orgId);

  const [fehler, setFehler] = useState<string | null>(null);
  const [fragtNach, setFragtNach] = useState(false);

  const istManSelbst = mitglied.userId === nutzer?.id;

  /**
   * ==========================================================================
   * WAS DIE OBERFLAECHE ZEIGT - UND WAS SIE NICHT ENTSCHEIDET
   * ==========================================================================
   * Diese Bedingungen bilden die Backend-Regeln nach: Nur OWNER vergibt
   * Rollen, ADMIN darf keinen OWNER entfernen, sich selbst entfernen darf
   * jeder.
   *
   * Sie sind BENUTZERFUEHRUNG, keine Berechtigungspruefung. Wer die Knoepfe
   * mit den Entwicklerwerkzeugen zurueckholt, bekommt 403 oder 409 - die
   * einzige Stelle, an der wirklich entschieden wird, ist der Server.
   *
   * Warum man sie trotzdem baut: Ein Knopf, der immer scheitert, ist eine
   * Falle. Der Nutzer soll gar nicht erst versuchen, was er nicht darf.
   */
  const darfRolleAendern = eigeneRolle === 'OWNER';
  const darfEntfernen =
    istManSelbst ||
    (eigeneRolle === 'OWNER'
      ? true
      : eigeneRolle === 'ADMIN' && mitglied.role !== 'OWNER');

  const beiRollenwechsel = async (role: Rolle) => {
    setFehler(null);
    try {
      await rolleAendern.mutateAsync({ userId: mitglied.userId, role });
    } catch (problem) {
      // Die Meldung kommt unveraendert vom Server. Sie ist dort bereits
      // verstaendlich formuliert ("Die Organisation braucht mindestens einen
      // OWNER") - eine eigene Fassung im Frontend wuerde bei jeder Aenderung
      // der Regel auseinanderlaufen.
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Änderung derzeit nicht möglich',
      );
    }
  };

  const beiEntfernen = async () => {
    setFehler(null);
    try {
      await entfernen.mutateAsync(mitglied.userId);

      /**
       * ======================================================================
       * DER FALL, DEN MAN LEICHT UEBERSIEHT
       * ======================================================================
       * Entfernt man SICH SELBST, liefert genau die Seite, auf der man steht,
       * ab diesem Moment 404 - die Mitgliedschaft ist weg, und der Guard laesst
       * niemanden mehr durch.
       *
       * Ohne diese Weiterleitung wuerde die Entwertung der Abfragen ein
       * Neuladen ausloesen, das sofort in einen Fehler laeuft. Der Nutzer saehe
       * "Diese Organisation existiert nicht" auf einer Seite, die er gerade
       * noch benutzt hat - technisch korrekt und trotzdem verwirrend.
       *
       * Deshalb: erst weg von hier, dann entwerten lassen.
       */
      if (istManSelbst) {
        router.replace('/organizations');
      }
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Entfernen derzeit nicht möglich',
      );
    } finally {
      setFragtNach(false);
    }
  };

  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {mitglied.name ?? mitglied.email}
            {istManSelbst && (
              <span className="ml-2 text-xs text-zinc-500">(Sie)</span>
            )}
          </p>
          <p className="text-xs text-zinc-500">{mitglied.email}</p>
        </div>

        <div className="flex items-center gap-2">
          {darfRolleAendern ? (
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="sr-only">Rolle von {mitglied.email}</span>
              <select
                value={mitglied.role}
                onChange={(ereignis) =>
                  void beiRollenwechsel(ereignis.target.value as Rolle)
                }
                disabled={rolleAendern.isPending}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs
                  dark:border-zinc-700 dark:bg-zinc-900"
                aria-label={`Rolle von ${mitglied.email}`}
              >
                {(['OWNER', 'ADMIN', 'MEMBER'] as const).map((rolle) => (
                  <option key={rolle} value={rolle}>
                    {ROLLEN_TEXT[rolle]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-xs text-zinc-500">
              {ROLLEN_TEXT[mitglied.role]}
            </span>
          )}

          {darfEntfernen &&
            (fragtNach ? (
              /**
               * Zweistufig statt `window.confirm`: Der Systemdialog laesst
               * sich nicht gestalten, blockiert den ganzen Tab und ist im Test
               * nur ueber eine Attrappe erreichbar. Wichtiger ist aber, DASS
               * nachgefragt wird - "Organisation verlassen" ist ohne
               * Einladung nicht rueckgaengig zu machen.
               */
              <span className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Sicher?</span>
                <button
                  type="button"
                  onClick={() => void beiEntfernen()}
                  disabled={entfernen.isPending}
                  className="rounded-lg bg-red-600 px-2 py-1 text-white
                    transition hover:bg-red-700 disabled:opacity-50"
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setFragtNach(false)}
                  className="rounded-lg border border-zinc-300 px-2 py-1
                    dark:border-zinc-700"
                >
                  Abbrechen
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFragtNach(true)}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs
                  transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {istManSelbst ? 'Verlassen' : 'Entfernen'}
              </button>
            ))}
        </div>
      </div>

      {fehler && (
        <p className="mt-3">
          <Hinweis>{fehler}</Hinweis>
        </p>
      )}
    </li>
  );
}
