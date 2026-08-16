'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Board } from '@/components/board';
import { Geschuetzt } from '@/components/geschuetzt';
import { RepositoryVerbindung } from '@/components/repository-verbindung';
import { Feld, Hinweis, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useOrganisation } from '@/lib/organisationen';
import {
  useProjekt,
  useProjektAendern,
  useProjektArchivieren,
} from '@/lib/projekte';

const aendernSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein'),
  description: z
    .string()
    .trim()
    .max(2000, 'Die Beschreibung darf höchstens 2000 Zeichen lang sein'),
});

type AendernDaten = z.infer<typeof aendernSchema>;

export default function ProjektSeite() {
  return (
    <Geschuetzt>
      <Inhalt />
    </Geschuetzt>
  );
}

function Inhalt() {
  const { orgId, projectId } = useParams<{
    orgId: string;
    projectId: string;
  }>();

  const organisation = useOrganisation(orgId);
  const projekt = useProjekt(orgId, projectId);

  const darfVerwalten =
    organisation.data?.role === 'OWNER' || organisation.data?.role === 'ADMIN';

  if (projekt.isPending) {
    return <Rahmen orgId={orgId}>Lade …</Rahmen>;
  }

  /**
   * ==========================================================================
   * 404 IST HIER KEINE STOERUNG, SONDERN EINE AUSSAGE
   * ==========================================================================
   * Das Backend antwortet mit 404, wenn das Projekt nicht existiert ODER zu
   * einer anderen Organisation gehoert - ununterscheidbar, und mit Absicht.
   *
   * Daraus darf im Frontend keine allgemeine Fehlermeldung werden ("etwas ist
   * schiefgelaufen"): Die wuerde den Nutzer zum Neuladen verleiten, und beim
   * zweiten Versuch stuende dasselbe da. Er bekommt stattdessen eine Erklaerung
   * und einen Weg zurueck.
   */
  if (projekt.isError) {
    const nichtGefunden =
      projekt.error instanceof ApiFehler && projekt.error.status === 404;

    return (
      <Rahmen orgId={orgId}>
        <Hinweis>
          {nichtGefunden
            ? 'Dieses Projekt existiert nicht oder gehört zu einer anderen Organisation.'
            : 'Das Projekt konnte nicht geladen werden.'}
        </Hinweis>
      </Rahmen>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <Link
          href={`/organizations/${orgId}/projects`}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Zurück zu den Projekten
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {projekt.data.name}
        </h1>
        {projekt.data.description && (
          <p className="mt-1 text-sm text-zinc-500">
            {projekt.data.description}
          </p>
        )}
        {projekt.data.archivedAt && (
          <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Dieses Projekt ist archiviert. Es bleibt lesbar, aber neue Aufgaben
            lassen sich nicht mehr anlegen.
          </p>
        )}
      </header>

      {/*
        Ein archiviertes Projekt bleibt LESBAR, aber nicht veraenderbar - das
        Backend lehnt neue Aufgaben darin ohnehin mit 404 ab. Die Oberflaeche
        blendet deshalb aus, was scheitern wuerde, statt es anzubieten.
      */}
      <Board
        orgId={orgId}
        projektId={projectId}
        schreibgeschuetzt={projekt.data.archivedAt !== null}
      />

      {/* Die Repository-Verbindung steht UNTER dem Board und ueber der
          Projektverwaltung: Sie gehoert zur laufenden Arbeit, nicht zu den
          Einstellungen, die man einmal setzt. Auch ein MEMBER sieht sie -
          wer im Projekt arbeitet, darf wissen, woher die Ereignisse kommen. */}
      {!projekt.data.archivedAt && (
        <RepositoryVerbindung
          orgId={orgId}
          projektId={projectId}
          darfVerwalten={darfVerwalten}
        />
      )}

      {darfVerwalten && !projekt.data.archivedAt && (
        <VerwaltungsBereich
          orgId={orgId}
          projektId={projectId}
          name={projekt.data.name}
          beschreibung={projekt.data.description}
        />
      )}
    </div>
  );
}

function Rahmen({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <Link
        href={`/organizations/${orgId}/projects`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← Zurück zu den Projekten
      </Link>
      {children}
    </div>
  );
}

function VerwaltungsBereich({
  orgId,
  projektId,
  name,
  beschreibung,
}: {
  orgId: string;
  projektId: string;
  name: string;
  beschreibung: string | null;
}) {
  const router = useRouter();
  const aendern = useProjektAendern(orgId, projektId);
  const archivieren = useProjektArchivieren(orgId);

  const [fehler, setFehler] = useState<string | null>(null);
  const [sicherheitsfrage, setSicherheitsfrage] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AendernDaten>({
    resolver: zodResolver(aendernSchema),
    // Die Felder starten mit dem aktuellen Stand - sonst muesste der Nutzer
    // den Namen abtippen, um die Beschreibung zu aendern.
    defaultValues: { name, description: beschreibung ?? '' },
  });

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      await aendern.mutateAsync({
        name: daten.name,
        // Leeres Feld heisst "Beschreibung entfernen" - dafuer erwartet das
        // Backend ausdruecklich `null`. Ein leerer String waere eine
        // Beschreibung, die aus nichts besteht; `undefined` hiesse
        // "unveraendert lassen". Drei Werte, drei verschiedene Bedeutungen.
        description: daten.description === '' ? null : daten.description,
      });
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Die Änderung konnte nicht gespeichert werden.',
      );
    }
  });

  const archiviereJetzt = async () => {
    setFehler(null);
    try {
      await archivieren.mutateAsync(projektId);
      router.push(`/organizations/${orgId}/projects`);
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Das Projekt konnte nicht archiviert werden.',
      );
    }
  };

  return (
    <section className="flex flex-col gap-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Projekt verwalten
      </h2>

      {fehler && <Hinweis>{fehler}</Hinweis>}

      <form onSubmit={absenden} className="flex flex-col gap-4" noValidate>
        <Feld
          label="Name"
          fehler={errors.name?.message}
          {...register('name')}
        />
        <Feld
          label="Beschreibung"
          fehler={errors.description?.message}
          {...register('description')}
        />
        <Knopf laedt={isSubmitting}>Speichern</Knopf>
      </form>

      <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {/*
          Archivieren ist umkehrbar gedacht, aber es gibt (noch) keinen Weg
          zurueck - siehe 06_BACKLOG.md. Deshalb eine Rueckfrage: Der Schritt
          ist fuer den Nutzer nicht selbst korrigierbar, und genau das ist das
          Kriterium fuer eine Sicherheitsabfrage - nicht die HTTP-Methode.
        */}
        {sicherheitsfrage ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Das Projekt verschwindet aus der Liste. Seine Aufgaben bleiben
              erhalten, ein Zurückholen ist derzeit nicht vorgesehen.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void archiviereJetzt()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                disabled={archivieren.isPending}
              >
                Endgültig archivieren
              </button>
              <button
                type="button"
                onClick={() => setSicherheitsfrage(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Abbrechen
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSicherheitsfrage(true)}
            className="self-start rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Projekt archivieren
          </button>
        )}
      </div>
    </section>
  );
}
