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
 * Muss zu den Regeln des Backends passen (siehe register.dto.ts):
 * mindestens 10 Zeichen, keine Zeichenklassen-Pflicht - Laenge schlaegt
 * Zeichenvielfalt (NIST SP 800-63B).
 *
 * Diese Dopplung ist der Preis dafuer, dass Frontend und Backend getrennte
 * Projekte sind (ADR-005). Sie faellt auf, sobald sich eine Seite aendert -
 * deshalb steht sie hier ausdruecklich im Kommentar.
 */
const registrierSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.email('Bitte eine gueltige E-Mail-Adresse angeben'),
  password: z
    .string()
    .min(10, 'Mindestens 10 Zeichen')
    .max(128, 'Hoechstens 128 Zeichen'),
});

type RegistrierDaten = z.infer<typeof registrierSchema>;

export default function RegisterSeite() {
  // Suspense-Grenze wegen `useSearchParams` - siehe die mitgelieferte Doku
  // und den gleichlautenden Kommentar auf der Anmeldeseite.
  return (
    <Suspense
      fallback={
        <Karte titel="Konto anlegen" untertitel="DevBoard">
          <p className="text-sm text-zinc-500">Einen Moment …</p>
        </Karte>
      }
    >
      <Formular />
    </Suspense>
  );
}

function Formular() {
  const { registrieren, nutzer, laedt } = useAuth();
  const router = useRouter();
  const suchparameter = useSearchParams();
  const [fehler, setFehler] = useState<string | null>(null);

  // Geprueft, nicht uebernommen - ohne Pruefung waere das eine
  // Open-Redirect-Luecke. Siehe lib/weiterleitung.ts.
  const ziel = sichererPfad(suchparameter.get('weiter'), '/dashboard');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrierDaten>({ resolver: zodResolver(registrierSchema) });

  useEffect(() => {
    if (!laedt && nutzer) router.replace(ziel);
  }, [laedt, nutzer, router, ziel]);

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      await registrieren(daten.email, daten.password, daten.name || undefined);
      router.replace(ziel);
    } catch (problem) {
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Registrierung derzeit nicht moeglich',
      );
    }
  });

  return (
    <Karte titel="Konto anlegen" untertitel="DevBoard">
      <form onSubmit={absenden} className="flex flex-col gap-4" noValidate>
        {fehler && <Hinweis>{fehler}</Hinweis>}

        <Feld
          label="Name (optional)"
          autoComplete="name"
          fehler={errors.name?.message}
          {...register('name')}
        />
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
          // "new-password" laesst Passwortmanager einen Vorschlag anbieten.
          autoComplete="new-password"
          fehler={errors.password?.message}
          {...register('password')}
        />

        <Knopf laedt={isSubmitting}>Konto anlegen</Knopf>
      </form>

      <p className="text-sm text-zinc-500">
        Bereits registriert?{' '}
        <Link
          // Das Ziel wird mitgenommen, damit eine Einladung beim Wechsel
          // zwischen den beiden Formularen nicht verloren geht.
          href={`/login?weiter=${encodeURIComponent(ziel)}`}
          className="text-emerald-600 hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </Karte>
  );
}
