'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Geschuetzt } from '@/components/geschuetzt';
import { Feld, Hinweis, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useAktiveOrganisation } from '@/lib/aktive-organisation';
import {
  useOrganisationAnlegen,
  useOrganisationen,
} from '@/lib/organisationen';
import type { Organisation, Rolle } from '@/lib/organisationen';

/**
 * Dieselben Regeln wie im Backend-Schema.
 *
 * Die Wiederholung ist Absicht und kein Versehen: Die Pruefung hier ist
 * BEQUEMLICHKEIT (sofortige Rueckmeldung, keine unnoetige Anfrage), die im
 * Backend ist SICHERHEIT. Sie sind nicht dieselbe Sache an zwei Orten, sondern
 * zwei verschiedene Dinge, die zufaellig dieselbe Zahl nennen.
 *
 * Wer sie zusammenlegen wollte - etwa ueber ein geteiltes Paket -, muesste
 * sicherstellen, dass das Backend seine Pruefung NIE aufgibt. Der Aufwand
 * lohnt sich bei zwei Regeln nicht.
 */
const anlegenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein'),
});

type AnlegenDaten = z.infer<typeof anlegenSchema>;

export default function OrganisationenSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  const { data, isPending, isError } = useOrganisationen();
  const { aktive, waehle } = useAktiveOrganisation(data);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Organisationen
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Jede Organisation ist ein eigener Mandant. Projekte und Aufgaben
          gehören immer zu genau einer.
        </p>
      </header>

      {isPending && <p className="text-sm text-zinc-500">Lade …</p>}
      {isError && (
        <Hinweis>Organisationen konnten nicht geladen werden.</Hinweis>
      )}

      {data &&
        (data.length === 0 ? (
          <Leerzustand />
        ) : (
          <Liste
            organisationen={data}
            aktiveId={aktive?.id ?? null}
            aufWaehlen={waehle}
          />
        ))}

      <AnlegenFormular />
    </main>
  );
}

/**
 * Was zu sehen ist, wenn der Nutzer noch nirgends Mitglied ist.
 *
 * Ein gueltiger Zustand, kein Fehler: Wir legen bei der Registrierung bewusst
 * keine Organisation automatisch an (siehe Interviewfrage 73). Deshalb bekommt
 * er hier eine Erklaerung statt einer leeren Flaeche - eine leere Liste ohne
 * Text wirkt wie ein Ladefehler.
 */
function Leerzustand() {
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">
        Noch keine Organisation
      </p>
      <p className="mt-1">
        Legen Sie eine an – Sie werden automatisch ihr Eigentümer. Oder warten
        Sie auf eine Einladung von Kolleginnen und Kollegen.
      </p>
    </section>
  );
}

function Liste({
  organisationen,
  aktiveId,
  aufWaehlen,
}: {
  organisationen: Organisation[];
  aktiveId: string | null;
  aufWaehlen: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="sr-only">Meine Organisationen</h2>
      <ul className="flex flex-col gap-2">
        {organisationen.map((organisation) => (
          <li key={organisation.id}>
            <div
              className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition
                ${
                  organisation.id === aktiveId
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
            >
              <div className="min-w-0">
                <Link
                  href={`/organizations/${organisation.id}`}
                  className="font-medium hover:underline"
                >
                  {organisation.name}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <RollenAbzeichen rolle={organisation.role} />
                </p>
              </div>

              {organisation.id === aktiveId ? (
                <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  aktiv
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => aufWaehlen(organisation.id)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs
                    transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Aktivieren
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Zeigt die eigene Rolle an.
 *
 * ============================================================================
 * DIE ROLLE STEUERT HIER NUR DIE ANZEIGE
 * ============================================================================
 * In der naechsten Scheibe entscheidet sie, welche Knoepfe erscheinen. Das ist
 * BENUTZERFUEHRUNG, kein Schutz: Wer den Knopf mit den Entwicklerwerkzeugen
 * wieder sichtbar macht, bekommt vom Backend trotzdem 403.
 *
 * Dieselbe Trennung wie bei <Geschuetzt>: Frontend-Schutz ist Fuehrung,
 * Backend-Schutz ist Sicherheit. Einen Knopf auszublenden, den das Backend
 * nicht absichert, ist keine Berechtigungspruefung - es ist Dekoration.
 */
function RollenAbzeichen({ rolle }: { rolle: Rolle }) {
  const beschriftung: Record<Rolle, string> = {
    OWNER: 'Eigentümer',
    ADMIN: 'Administrator',
    MEMBER: 'Mitglied',
  };

  return <span>{beschriftung[rolle]}</span>;
}

function AnlegenFormular() {
  const anlegen = useOrganisationAnlegen();
  const [fehler, setFehler] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AnlegenDaten>({ resolver: zodResolver(anlegenSchema) });

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      await anlegen.mutateAsync(daten.name);
      // Nach Erfolg leeren - sonst steht der alte Name noch im Feld und der
      // Nutzer legt beim zweiten Klick versehentlich dieselbe Organisation
      // noch einmal an.
      reset();
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Anlegen derzeit nicht möglich',
      );
    }
  });

  return (
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-500">
        Neue Organisation anlegen
      </h2>

      <form onSubmit={absenden} className="mt-4 flex flex-col gap-4" noValidate>
        {fehler && <Hinweis>{fehler}</Hinweis>}

        <Feld
          label="Name"
          autoComplete="organization"
          fehler={errors.name?.message}
          {...register('name')}
        />

        <div>
          <Knopf laedt={isSubmitting}>Anlegen</Knopf>
        </div>
      </form>

      <p className="mt-4 text-xs text-zinc-500">
        Sie werden automatisch Eigentümer. Diese Rolle ist die einzige, die
        Rollen vergeben und die Organisation löschen darf.
      </p>
    </section>
  );
}
