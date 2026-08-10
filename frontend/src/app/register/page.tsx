'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Feld, Hinweis, Karte, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

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
  const { registrieren, nutzer, laedt } = useAuth();
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrierDaten>({ resolver: zodResolver(registrierSchema) });

  useEffect(() => {
    if (!laedt && nutzer) router.replace('/dashboard');
  }, [laedt, nutzer, router]);

  const absenden = handleSubmit(async (daten) => {
    setFehler(null);
    try {
      await registrieren(daten.email, daten.password, daten.name || undefined);
      router.replace('/dashboard');
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
        <Link href="/login" className="text-emerald-600 hover:underline">
          Anmelden
        </Link>
      </p>
    </Karte>
  );
}
