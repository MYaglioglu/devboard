'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Feld, Hinweis, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import {
  useEinladen,
  useEinladungZurueckziehen,
  useEinladungen,
} from '@/lib/organisationen';
import type { AusgestellteEinladung, Rolle } from '@/lib/organisationen';

/**
 * Nur ADMIN und MEMBER sind einladbar.
 *
 * OWNER entsteht ausschliesslich durch Ernennen eines bestehenden Mitglieds.
 * Waere er hier waehlbar, gaebe es einen zweiten Weg zur hoechsten Rolle - und
 * das Backend lehnte ihn ohnehin mit 400 ab.
 */
const einladenSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse angeben'),
  role: z.enum(['ADMIN', 'MEMBER']),
});

type EinladenDaten = z.infer<typeof einladenSchema>;

const ROLLEN_TEXT: Record<Rolle, string> = {
  OWNER: 'Eigentümer',
  ADMIN: 'Administrator',
  MEMBER: 'Mitglied',
};

/**
 * Einladungen einer Organisation.
 *
 * Wird nur fuer OWNER und ADMIN gerendert. Ein MEMBER darf sehen, WER
 * dazugehoert - nicht, wer noch eingeladen ist: Das sind E-Mail-Adressen von
 * Menschen ausserhalb des Teams. Das Backend lehnt fuer ihn mit 403 ab.
 */
export function EinladungenBereich({
  orgId,
  eigeneRolle,
}: {
  orgId: string;
  eigeneRolle: Rolle;
}) {
  const darfVerwalten = eigeneRolle === 'OWNER' || eigeneRolle === 'ADMIN';

  const einladungen = useEinladungen(orgId, darfVerwalten);
  const zurueckziehen = useEinladungZurueckziehen(orgId);

  // Die zuletzt ausgestellte Einladung - der EINZIGE Ort, an dem der Token je
  // sichtbar ist.
  const [frisch, setFrisch] = useState<AusgestellteEinladung | null>(null);

  if (!darfVerwalten) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">Einladungen</h2>

      {frisch && (
        <FrischerToken
          einladung={frisch}
          aufSchliessen={() => setFrisch(null)}
        />
      )}

      <EinladenFormular
        orgId={orgId}
        eigeneRolle={eigeneRolle}
        aufAusgestellt={setFrisch}
      />

      {einladungen.isPending && <p className="text-sm text-zinc-500">Lade …</p>}
      {einladungen.isError && (
        <Hinweis>Einladungen konnten nicht geladen werden.</Hinweis>
      )}

      {einladungen.data &&
        (einladungen.data.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine offenen Einladungen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {einladungen.data.map((einladung) => (
              <li
                key={einladung.id}
                className="flex flex-wrap items-center justify-between gap-3
                  rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="font-medium">{einladung.email}</p>
                  <p className="text-xs text-zinc-500">
                    {ROLLEN_TEXT[einladung.role]} · gültig bis{' '}
                    {new Date(einladung.expiresAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void zurueckziehen.mutateAsync(einladung.id)}
                  disabled={zurueckziehen.isPending}
                  className="rounded-lg border border-zinc-300 px-2 py-1 text-xs
                    transition hover:bg-zinc-100 disabled:opacity-50
                    dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Zurückziehen
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

/**
 * Zeigt den frisch ausgestellten Token - EINMALIG.
 *
 * ============================================================================
 * WARUM DIESE ANZEIGE SO AUFDRINGLICH IST
 * ============================================================================
 * Das Backend speichert nur den SHA-256-Hash und gibt den Rohwert genau einmal
 * zurueck, in der Antwort auf das Anlegen. Er laesst sich nicht nachschlagen -
 * wer ihn verliert, muss neu einladen.
 *
 * Das ist keine Unbequemlichkeit, sondern die Folge einer Sicherheits-
 * entscheidung: Bei einem Datenbankleck waeren gespeicherte Rohwerte sofort
 * verwendbare Zugaenge zu fremden Organisationen.
 *
 * Fuer die Oberflaeche heisst das: Sie muss den Wert deutlich zeigen UND
 * deutlich sagen, dass er danach weg ist. Genau so verhalten sich frisch
 * erzeugte API-Schluessel bei GitHub oder Stripe - dieselbe Ursache, dieselbe
 * Gestaltung.
 *
 * Deshalb ist der Kasten auffaellig, deshalb gibt es einen Kopierknopf, und
 * deshalb muss der Nutzer ihn ausdruecklich schliessen. Ein Kasten, der nach
 * drei Sekunden verschwindet, waere hier eine Falle.
 */
function FrischerToken({
  einladung,
  aufSchliessen,
}: {
  einladung: AusgestellteEinladung;
  aufSchliessen: () => void;
}) {
  const [kopiert, setKopiert] = useState(false);
  const [kopierfehler, setKopierfehler] = useState(false);

  // Die vollstaendige Adresse, die der Eingeladene oeffnet. Sie entsteht erst
  // im Browser, weil `window.location.origin` auf dem Server nicht existiert -
  // die Komponente wird nur nach einer Nutzeraktion gerendert, also ist das
  // hier unproblematisch.
  const link = `${window.location.origin}/einladung?token=${encodeURIComponent(einladung.token)}`;

  const kopieren = async () => {
    setKopierfehler(false);
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
    } catch {
      // Die Zwischenablage ist nicht ueberall verfuegbar - ohne HTTPS, in
      // aelteren Browsern, bei entzogener Berechtigung. Dann muss der Nutzer
      // von Hand markieren; deshalb steht der Link ohnehin im Klartext da.
      setKopierfehler(true);
    }
  };

  return (
    <div
      role="alert"
      className="rounded-xl border border-emerald-300 bg-emerald-50 p-4
        dark:border-emerald-800 dark:bg-emerald-950/30"
    >
      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
        Einladung für {einladung.email} erstellt
      </p>
      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
        Kopieren Sie diesen Link jetzt und schicken Sie ihn der eingeladenen
        Person. <strong>Er wird nur dieses eine Mal angezeigt.</strong>
      </p>

      <code
        className="mt-3 block overflow-x-auto rounded-lg bg-white px-3 py-2
          font-mono text-xs dark:bg-zinc-900"
      >
        {link}
      </code>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void kopieren()}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium
            text-white transition hover:bg-emerald-700"
        >
          {kopiert ? 'Kopiert' : 'Link kopieren'}
        </button>
        <button
          type="button"
          onClick={aufSchliessen}
          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs
            transition hover:bg-emerald-100 dark:border-emerald-800
            dark:hover:bg-emerald-900/40"
        >
          Schließen
        </button>
      </div>

      {kopierfehler && (
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
          Kopieren nicht möglich – bitte den Link von Hand markieren.
        </p>
      )}
    </div>
  );
}

function EinladenFormular({
  orgId,
  eigeneRolle,
  aufAusgestellt,
}: {
  orgId: string;
  eigeneRolle: Rolle;
  aufAusgestellt: (einladung: AusgestellteEinladung) => void;
}) {
  const einladen = useEinladen(orgId);
  const [fehler, setFehler] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EinladenDaten>({
    resolver: zodResolver(einladenSchema),
    defaultValues: { role: 'MEMBER' },
  });

  // Ein ADMIN darf nur MEMBER einladen - sonst koennte er ueber den Umweg der
  // Einladung Rechte vergeben, die zu vergeben ihm nicht zusteht. Das Backend
  // lehnt mit 403 ab; hier verschwindet die Auswahl, damit der Versuch gar
  // nicht erst entsteht.
  const darfRolleWaehlen = eigeneRolle === 'OWNER';

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      const einladung = await einladen.mutateAsync({
        email: daten.email,
        role: darfRolleWaehlen ? daten.role : 'MEMBER',
      });
      aufAusgestellt(einladung);
      reset({ email: '', role: 'MEMBER' });
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Einladen derzeit nicht möglich',
      );
    }
  });

  return (
    <form
      onSubmit={absenden}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      noValidate
    >
      {fehler && <Hinweis>{fehler}</Hinweis>}

      <Feld
        label="E-Mail-Adresse einladen"
        type="email"
        autoComplete="off"
        fehler={errors.email?.message}
        {...register('email')}
      />

      {darfRolleWaehlen && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Rolle
          </span>
          <select
            {...register('role')}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm
              dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="MEMBER">Mitglied</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
      )}

      <div>
        <Knopf laedt={isSubmitting}>Einladen</Knopf>
      </div>

      <p className="text-xs text-zinc-500">
        Die Einladung gilt sieben Tage und ist an diese Adresse gebunden – ein
        weitergeleiteter Link genügt nicht.
      </p>
    </form>
  );
}
