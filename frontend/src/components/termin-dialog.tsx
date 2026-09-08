'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Auswahl, Feld, Hinweis, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { fuerEingabefeld, langesDatum } from '@/lib/kalender-raster';
import { useTerminAnlegen } from '@/lib/kalender';
import { useMitglieder } from '@/lib/organisationen';
import { useProjekte } from '@/lib/projekte';

/**
 * ============================================================================
 * WARUM `<dialog>` UND NICHT EIN EIGENES OVERLAY
 * ============================================================================
 * Ein `<div>` mit `position: fixed` und dunklem Hintergrund waere schnell
 * gebaut - und dann faengt die Arbeit an: Escape muss schliessen, der Fokus
 * darf nicht hinter den Dialog wandern, der Rest der Seite muss fuer
 * Screenreader unsichtbar werden, und beim Schliessen muss der Fokus dorthin
 * zurueck, wo er herkam.
 *
 * Genau das leistet `showModal()` von sich aus: Fokusfalle, Escape,
 * `inert` fuer den Hintergrund, `::backdrop` als Abdunklung. Dieselbe
 * Ueberlegung wie beim `<select>` gegenueber dem handgebauten Menue in der
 * Seitenleiste - eine Plattformfunktion nimmt genau die Arbeit ab, die man
 * sonst vergisst.
 *
 * Was man dafuer wissen muss und was unten steht: `showModal()` ist ein
 * IMPERATIVER Aufruf. React kann ihn nicht aus dem Zustand ableiten, also
 * braucht es einen `useEffect` mit `ref` - eine der wenigen Stellen, an denen
 * das richtig und nicht ein Notbehelf ist.
 */

const terminSchema = z.object({
  projektId: z.uuid('Bitte ein Projekt wählen'),

  title: z
    .string()
    .trim()
    .min(2, 'Der Titel muss mindestens 2 Zeichen lang sein')
    .max(200, 'Der Titel darf höchstens 200 Zeichen lang sein'),

  /**
   * Der Wert eines `<input type="datetime-local">` - eine Zeichenkette der
   * Form `2026-09-15T09:00`, OHNE Zone.
   *
   * Hier steht bewusst kein `z.coerce.date()`: Die Umwandlung in einen
   * Zeitpunkt gehoert beim Absenden an eine Stelle, an der man sie sieht.
   * Ein stilles `coerce` mitten in der Pruefung waere genau der Ort, an dem
   * eine Zeitzone verlorengeht, ohne dass jemand hinsieht.
   *
   * Die Grenzen der Zeichenkette pruefen wir nicht selbst - das Feld laesst
   * nur gueltige Werte zu, und der Server prueft ohnehin noch einmal.
   */
  faellig: z.string().min(1, 'Bitte einen Zeitpunkt angeben'),

  /**
   * Leerer String heisst "niemand". Er wird beim Absenden zu `undefined` -
   * das Backend unterscheidet: Feld fehlt heisst "nicht zuweisen".
   */
  assigneeId: z.string(),
});

type TerminFormular = z.infer<typeof terminSchema>;

export function TerminDialog({
  orgId,
  tag,
  beimSchliessen,
}: {
  orgId: string;
  /** Der geklickte Tag samt Vorgabe-Uhrzeit. `null` heisst: Dialog zu. */
  tag: Date | null;
  beimSchliessen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const { data: projekte } = useProjekte(orgId);
  const { data: mitglieder } = useMitglieder(orgId);
  const anlegen = useTerminAnlegen(orgId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TerminFormular>({
    resolver: zodResolver(terminSchema),
    defaultValues: { projektId: '', title: '', faellig: '', assigneeId: '' },
  });

  /**
   * Oeffnen und Schliessen.
   *
   * `showModal()` statt des Attributs `open`: Nur der Aufruf erzeugt einen
   * ECHTEN modalen Dialog mit Fokusfalle und `::backdrop`. Steht bloss `open`
   * im Markup, ist es ein sichtbares Element ohne jede dieser Eigenschaften -
   * ein Unterschied, den man dem Markup nicht ansieht.
   *
   * Beim Oeffnen wird das Formular zurueckgesetzt und mit dem geklickten Tag
   * vorbelegt. Ohne `reset` stuende beim zweiten Oeffnen noch der Titel vom
   * ersten Mal drin - der Dialog wird ja nicht neu erzeugt, nur wieder
   * gezeigt.
   *
   * Was hier bewusst NICHT steht, ist `setFehler(null)`. Ein `setState` im
   * Effekt loest ein zweites Rendern aus, nur um einen Wert zu berichtigen,
   * den man auch frueher haette setzen koennen - der ESLint-Regel
   * `react-hooks/set-state-in-effect` geht es genau darum. Die Fehlermeldung
   * wird stattdessen beim SCHLIESSEN geleert (`onClose` weiter unten), also
   * in einem Ereignis. Wirkung dieselbe, ein Rendern weniger, und die
   * Ursache-Wirkung-Kette steht dort, wo sie hingehoert.
   */
  useEffect(() => {
    if (!tag) {
      dialog.current?.close();
      return;
    }

    reset({
      projektId: '',
      title: '',
      faellig: fuerEingabefeld(tag),
      assigneeId: '',
    });
    dialog.current?.showModal();
  }, [tag, reset]);

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);

    try {
      await anlegen.mutateAsync({
        projektId: daten.projektId,
        title: daten.title,
        // ==================================================================
        // HIER ENTSTEHT AUS ORTSZEIT EIN ZEITPUNKT
        // ==================================================================
        // `new Date('2026-09-15T09:00')` - ohne Zonenangabe - liest den Wert
        // als LOKALE Zeit. Genau das ist gewollt: Der Nutzer hat 09:00 auf
        // seiner Uhr gemeint.
        //
        // Stuende am Ende ein `Z`, laese JavaScript dieselbe Zeichenkette als
        // UTC, und der Termin waere im Berliner Sommer zwei Stunden zu frueh.
        // Der Unterschied ist ein einziges Zeichen und im Winter nur eine
        // Stunde gross - deshalb faellt er beim Ausprobieren fast nie auf.
        dueDate: new Date(daten.faellig).toISOString(),
        // Leere Auswahl heisst "niemand". `undefined` laesst das Feld aus dem
        // JSON verschwinden; ein leerer String waere fuer den Server eine
        // ungueltige UUID und ergaebe 400.
        assigneeId: daten.assigneeId === '' ? undefined : daten.assigneeId,
      });

      beimSchliessen();
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Die Aufgabe konnte nicht angelegt werden.',
      );
    }
  });

  return (
    <dialog
      ref={dialog}
      /*
        Ein Klick auf die Abdunklung und die Escape-Taste sollen dasselbe tun.
        `onClose` faengt beide ab - Escape loest es direkt aus, der Klick geht
        ueber `close()` weiter unten.

        Ohne diesen Rueckweg blieben Dialog und Zustand auseinander: Der
        Browser haette geschlossen, `tag` staende weiter auf einem Datum, und
        ein Klick auf denselben Tag wuerde nichts mehr tun.
      */
      onClose={() => {
        // Beides beim Schliessen: den Zustand der Seite zuruecksetzen und die
        // Fehlermeldung leeren. Ohne das Zweite staende beim naechsten
        // Oeffnen noch der Fehler vom letzten Versuch da.
        setFehler(null);
        beimSchliessen();
      }}
      onClick={(ereignis) => {
        // Der Dialog selbst fuellt den ganzen Bildschirm; sein Inhalt liegt in
        // einem Kind. Ein Klick, dessen Ziel der Dialog SELBST ist, kann also
        // nur die Abdunklung getroffen haben.
        if (ereignis.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-full max-w-md rounded-xl border border-rand bg-flaeche-erhoben
        p-0 text-text backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-medium tracking-tight">Neue Aufgabe</h2>
          {tag && (
            // Der Tag steht sichtbar da, nicht nur im Datumsfeld. Wer aus
            // Versehen auf den falschen Tag geklickt hat, sieht es hier -
            // bevor er den Titel getippt hat.
            <p className="mt-0.5 text-sm text-leise">{langesDatum(tag)}</p>
          )}
        </div>

        {fehler && <Hinweis>{fehler}</Hinweis>}

        <form onSubmit={absenden} className="flex flex-col gap-4" noValidate>
          <Auswahl
            label="Projekt"
            fehler={errors.projektId?.message}
            {...register('projektId')}
          >
            {/*
              Kein vorausgewaehltes Projekt, obwohl das bequemer waere: Eine
              Aufgabe landet sonst still im erstbesten Projekt, und der Fehler
              faellt erst auf, wenn jemand sie dort sucht. Die leere Vorgabe
              zwingt zu einer Entscheidung, und die Pruefung meldet sie.
            */}
            <option value="">Bitte wählen</option>
            {projekte?.map((projekt) => (
              <option key={projekt.id} value={projekt.id}>
                {projekt.name}
              </option>
            ))}
          </Auswahl>

          <Feld
            label="Titel"
            fehler={errors.title?.message}
            {...register('title')}
          />

          {/*
            `datetime-local` statt zweier Felder fuer Datum und Uhrzeit: Der
            Browser bringt die Eingabehilfe seines Betriebssystems mit, kennt
            das Format der Sprache des Nutzers und prueft die Gueltigkeit
            selbst.

            Das Feld hat ausdruecklich KEINE Zone - es zeigt und nimmt genau
            das, was auf der Uhr des Nutzers steht. Die Umrechnung passiert
            beim Absenden, an einer Stelle.
          */}
          <Feld
            label="Fällig am"
            type="datetime-local"
            fehler={errors.faellig?.message}
            {...register('faellig')}
          />

          <Auswahl
            label="Zuständig"
            fehler={errors.assigneeId?.message}
            {...register('assigneeId')}
          >
            <option value="">Niemand</option>
            {mitglieder?.map((mitglied) => (
              // `userId`, nicht die ID der Mitgliedschaft - so verlangt es die
              // API. Begruendung in create-task.dto.ts.
              <option key={mitglied.userId} value={mitglied.userId}>
                {mitglied.name ?? mitglied.email}
              </option>
            ))}
          </Auswahl>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-rand px-3 py-2 text-sm transition
                hover:bg-flaeche-gedaempft"
            >
              Abbrechen
            </button>
            <Knopf laedt={isSubmitting}>Anlegen</Knopf>
          </div>
        </form>
      </div>
    </dialog>
  );
}
