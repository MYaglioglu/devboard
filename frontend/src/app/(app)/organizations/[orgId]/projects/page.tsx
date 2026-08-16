'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Geschuetzt } from '@/components/geschuetzt';
import { Feld, Hinweis, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useOrganisation } from '@/lib/organisationen';
import { useProjekte, useProjektAnlegen } from '@/lib/projekte';
import type { Projekt } from '@/lib/projekte';

/**
 * Dieselben Regeln wie im Backend-Schema.
 *
 * Die Wiederholung ist Absicht: Die Pruefung hier ist BEQUEMLICHKEIT
 * (sofortige Rueckmeldung, keine unnoetige Anfrage), die im Backend ist
 * SICHERHEIT. Dieselbe Begruendung steht bei den Organisationen.
 */
const anlegenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein'),
  description: z
    .string()
    .trim()
    .max(2000, 'Die Beschreibung darf höchstens 2000 Zeichen lang sein')
    .optional(),
});

type AnlegenDaten = z.infer<typeof anlegenSchema>;

export default function ProjekteSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  const { orgId } = useParams<{ orgId: string }>();
  const [auchArchivierte, setAuchArchivierte] = useState(false);

  const organisation = useOrganisation(orgId);
  const projekte = useProjekte(orgId, auchArchivierte);

  /**
   * ==========================================================================
   * DIE ROLLE STEUERT DIE ANZEIGE - NICHT DEN ZUGRIFF
   * ==========================================================================
   * Ein MEMBER darf keine Projekte anlegen; das Formular auszublenden ist
   * hoeflich, aber KEIN Schutz. Wer den Endpoint direkt aufruft, bekommt 403
   * vom Backend - dort sitzt die Entscheidung.
   *
   * Die Regel dahinter: Das Frontend blendet aus, was ohnehin scheitern
   * wuerde. Es entscheidet nicht, was erlaubt ist.
   */
  const darfAnlegen =
    organisation.data?.role === 'OWNER' || organisation.data?.role === 'ADMIN';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <Link
          href={`/organizations/${orgId}`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Zurück zur Organisation
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Projekte</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Jedes Projekt gehört zu genau einer Organisation und hat ein eigenes
          Board.
        </p>
      </header>

      {projekte.isPending && <p className="text-sm text-zinc-500">Lade …</p>}

      {projekte.isError && (
        <Hinweis>
          {projekte.error instanceof ApiFehler && projekte.error.status === 404
            ? 'Diese Organisation existiert nicht oder Sie sind kein Mitglied.'
            : 'Die Projekte konnten nicht geladen werden.'}
        </Hinweis>
      )}

      {projekte.data && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {projekte.data.length === 0
                ? 'Keine Projekte'
                : `${projekte.data.length} Projekt${
                    projekte.data.length === 1 ? '' : 'e'
                  }`}
            </h2>
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              <input
                type="checkbox"
                checked={auchArchivierte}
                onChange={(ereignis) =>
                  setAuchArchivierte(ereignis.target.checked)
                }
              />
              Archivierte anzeigen
            </label>
          </div>

          {projekte.data.length === 0 ? (
            // Ein Leerzustand mit Erklaerung statt einer leeren Flaeche: Ohne
            // Text wirkt "nichts da" wie ein Ladefehler.
            <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Noch kein Projekt angelegt.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projekte.data.map((projekt) => (
                <ProjektZeile
                  key={projekt.id}
                  orgId={orgId}
                  projekt={projekt}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {darfAnlegen && <AnlegenFormular orgId={orgId} />}
    </div>
  );
}

function ProjektZeile({ orgId, projekt }: { orgId: string; projekt: Projekt }) {
  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <Link
        href={`/organizations/${orgId}/projects/${projekt.id}`}
        className="flex items-center justify-between gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{projekt.name}</span>
          {projekt.description && (
            <span className="text-sm text-zinc-500">{projekt.description}</span>
          )}
        </span>
        {projekt.archivedAt && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            archiviert
          </span>
        )}
      </Link>
    </li>
  );
}

function AnlegenFormular({ orgId }: { orgId: string }) {
  const anlegen = useProjektAnlegen(orgId);
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
      await anlegen.mutateAsync({
        name: daten.name,
        // Eine leere Beschreibung wird gar nicht erst mitgeschickt: Das
        // Backend unterscheidet zwischen "fehlt" und "ausdruecklich leer",
        // und ein leerer String waere eine Beschreibung, die aus nichts
        // besteht - nicht dasselbe wie "keine".
        description: daten.description || undefined,
      });
      reset();
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Das Projekt konnte nicht angelegt werden.',
      );
    }
  });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Neues Projekt
      </h2>

      {fehler && <Hinweis>{fehler}</Hinweis>}

      <form onSubmit={absenden} className="flex flex-col gap-4" noValidate>
        <Feld
          label="Name"
          fehler={errors.name?.message}
          {...register('name')}
        />
        <Feld
          label="Beschreibung (optional)"
          fehler={errors.description?.message}
          {...register('description')}
        />
        <Knopf laedt={isSubmitting}>Anlegen</Knopf>
      </form>
    </section>
  );
}
