'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Feld, Hinweis, Karte, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { sichererPfad } from '@/lib/weiterleitung';

/**
 * Validierung im Browser.
 *
 * ============================================================================
 * WARUM HIER NOCHMAL, WO DAS BACKEND DOCH SCHON PRUEFT?
 * ============================================================================
 * Aus zwei ganz verschiedenen Gruenden - und die Unterscheidung ist wichtig:
 *
 *   Frontend-Validierung = BEQUEMLICHKEIT. Sofortige Rueckmeldung, keine
 *   unnoetige Anfrage. Sie ist mit den Entwicklerwerkzeugen in Sekunden
 *   umgehbar und deshalb KEIN Schutz.
 *
 *   Backend-Validierung  = SICHERHEIT. Sie ist die einzige, auf die man sich
 *   verlassen kann, weil sie nicht im Einflussbereich des Angreifers liegt.
 *
 * Merksatz: Niemals dem Client vertrauen. Die Pruefung hier ist Komfort,
 * nicht Kontrolle.
 */
const anmeldeSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse angeben'),
  password: z.string().min(1, 'Bitte ein Passwort angeben'),
});

type AnmeldeDaten = z.infer<typeof anmeldeSchema>;

export default function LoginSeite() {
  // `useSearchParams` liest Daten, die es beim Vorab-Rendern noch nicht gibt.
  // Ohne Suspense-Grenze wuerde der Baum darueber clientseitig gerendert -
  // siehe die mitgelieferte Doku zu use-search-params.
  return (
    <Suspense
      fallback={
        <Karte titel="Anmelden" untertitel="DevBoard">
          <p className="text-sm text-zinc-500">Einen Moment …</p>
        </Karte>
      }
    >
      <Formular />
    </Suspense>
  );
}

function Formular() {
  const { anmelden, nutzer, laedt } = useAuth();
  const router = useRouter();
  const suchparameter = useSearchParams();
  const [fehler, setFehler] = useState<string | null>(null);

  /**
   * Wohin nach erfolgreicher Anmeldung?
   *
   * `?weiter=` kommt von der Einladungsseite, damit der Nutzer nach dem
   * Anmelden dorthin zurueckkehrt, statt ratlos auf dem Dashboard zu landen.
   *
   * Der Wert wird GEPRUEFT, nicht uebernommen: Ein ungefilterter Parameter
   * waere eine Open-Redirect-Luecke - der Absender eines Links koennte
   * bestimmen, wohin der Nutzer nach der Anmeldung geschickt wird, und ihm
   * eine nachgebaute Anmeldeseite unterschieben. Siehe lib/weiterleitung.ts.
   */
  const ziel = sichererPfad(suchparameter.get('weiter'), '/dashboard');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AnmeldeDaten>({ resolver: zodResolver(anmeldeSchema) });

  // Wer bereits angemeldet ist, hat auf der Anmeldeseite nichts zu suchen.
  useEffect(() => {
    if (!laedt && nutzer) router.replace(ziel);
  }, [laedt, nutzer, router, ziel]);

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      await anmelden(daten.email, daten.password);
      router.replace(ziel);
    } catch (problem) {
      // Die Meldung kommt bewusst unveraendert vom Server: Sie ist dort
      // absichtlich generisch ("E-Mail oder Passwort ist falsch"), damit
      // nicht verraten wird, welches von beidem nicht stimmte.
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Anmeldung derzeit nicht möglich',
      );
    }
  });

  return (
    <Karte titel="Anmelden" untertitel="DevBoard">
      <form onSubmit={absenden} className="flex flex-col gap-4" noValidate>
        {fehler && <Hinweis>{fehler}</Hinweis>}

        <Feld
          label="E-Mail"
          type="email"
          autoComplete="email"
          fehler={errors.email?.message}
          {...register('email')}
        />
        <Feld
          label="Passwort"
          type="password"
          // Sagt dem Passwortmanager, dass es sich um eine Anmeldung handelt.
          autoComplete="current-password"
          fehler={errors.password?.message}
          {...register('password')}
        />

        <Knopf laedt={isSubmitting}>Anmelden</Knopf>
      </form>

      <p className="text-sm text-zinc-500">
        Noch kein Konto?{' '}
        <Link
          // Das Ziel wird mitgenommen. Ohne diesen Anhang verloere ein
          // Eingeladener, der hier erst ein Konto anlegt, seine Einladung -
          // und landete nach der Registrierung auf dem Dashboard.
          href={`/register?weiter=${encodeURIComponent(ziel)}`}
          className="text-emerald-600 hover:underline"
        >
          Registrieren
        </Link>
      </p>
    </Karte>
  );
}
