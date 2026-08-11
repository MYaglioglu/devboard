'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Hinweis, Karte, Knopf } from '@/components/ui';
import { ApiFehler } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useEinladungAnnehmen } from '@/lib/organisationen';

/**
 * Die Seite, auf die ein Einladungslink zeigt.
 *
 * ============================================================================
 * WARUM DER LINK AUF EINE SEITE ZEIGT UND NICHT AUF DIE API
 * ============================================================================
 * Das Einloesen ist ein POST, weil es etwas VERAENDERT - es entsteht eine
 * Mitgliedschaft. Ein Klick in einem E-Mail-Programm loest aber ein GET aus.
 *
 * Zeigte der Link direkt auf die API, wuerde die Einladung von Dingen
 * eingeloest, die niemand als Nutzeraktion gemeint hat: Link-Vorschaudienste
 * in Chat-Programmen, Virenscanner, die Links im Postfach vorsorglich oeffnen,
 * der Prefetch des Browsers. Die Einladung waere verbraucht, bevor der
 * Empfaenger die Nachricht gelesen hat.
 *
 * Deshalb diese Zwischenseite: Sie liest den Token, zeigt, worum es geht, und
 * schickt den POST erst, wenn der Nutzer bestaetigt.
 *
 * ============================================================================
 * WARUM HIER KEIN <Geschuetzt> STEHT
 * ============================================================================
 * Weil der typische Besucher NICHT angemeldet ist - er hat gerade eine
 * Einladung bekommen. <Geschuetzt> wuerde ihn auf /login werfen und dabei den
 * Token aus der Adresszeile verlieren; nach der Anmeldung stuende er
 * ratlos auf dem Dashboard.
 *
 * Stattdessen behandelt die Seite den abgemeldeten Fall selbst und reicht das
 * Ziel ueber `?weiter=` an die Anmeldeseite weiter.
 */
export default function EinladungSeite() {
  /**
   * ==========================================================================
   * WARUM DIE SUSPENSE-GRENZE NOETIG IST
   * ==========================================================================
   * `useSearchParams` liest Daten, die es beim Vorab-Rendern noch nicht gibt -
   * der Abfrageteil der URL entsteht erst im Browser. Ohne eine
   * Suspense-Grenze wuerde der gesamte Baum bis zur naechsten hoeheren Grenze
   * clientseitig gerendert; Next meldet das ausdruecklich an.
   *
   * Mit der Grenze bleibt alles darueber vorab gerendert, und nur dieser Teil
   * wartet auf den Browser. Steht so in der mitgelieferten Doku
   * (03-api-reference/04-functions/use-search-params.md).
   */
  return (
    <Suspense
      fallback={
        <Karte titel="Einladung" untertitel="DevBoard">
          <p className="text-sm text-zinc-500">Einen Moment …</p>
        </Karte>
      }
    >
      <Inhalt />
    </Suspense>
  );
}

function Inhalt() {
  const suchparameter = useSearchParams();
  const token = suchparameter.get('token');

  const { nutzer, laedt } = useAuth();
  const router = useRouter();
  const annehmen = useEinladungAnnehmen();

  const [fehler, setFehler] = useState<string | null>(null);

  if (laedt) {
    return (
      <Karte titel="Einladung" untertitel="DevBoard">
        <p className="text-sm text-zinc-500">Sitzung wird geprüft …</p>
      </Karte>
    );
  }

  if (!token) {
    return (
      <Karte titel="Einladung" untertitel="DevBoard">
        <Hinweis>
          Dieser Link ist unvollständig. Bitten Sie um eine neue Einladung.
        </Hinweis>
      </Karte>
    );
  }

  if (!nutzer) {
    // Das Ziel wird mitgegeben, damit es nach der Anmeldung hierher
    // zurueckgeht. Die Anmeldeseite prueft den Wert, bevor sie ihm folgt -
    // ohne Pruefung waere das eine Open-Redirect-Luecke (siehe
    // lib/weiterleitung.ts).
    const ziel = `/einladung?token=${encodeURIComponent(token)}`;

    return (
      <Karte titel="Einladung" untertitel="DevBoard">
        <p className="text-sm text-zinc-500">
          Sie wurden in eine Organisation eingeladen. Melden Sie sich an oder
          legen Sie ein Konto an – danach geht es hier weiter.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/login?weiter=${encodeURIComponent(ziel)}`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white
              transition hover:bg-emerald-700"
          >
            Anmelden
          </Link>
          <Link
            href={`/register?weiter=${encodeURIComponent(ziel)}`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm
              transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Konto anlegen
          </Link>
        </div>
        <p className="text-xs text-zinc-500">
          Wichtig: Die Einladung ist an eine bestimmte E-Mail-Adresse gebunden.
          Melden Sie sich mit genau der Adresse an, an die sie geschickt wurde.
        </p>
      </Karte>
    );
  }

  const beitreten = async () => {
    setFehler(null);
    try {
      const { organizationId } = await annehmen.mutateAsync(token);
      // Direkt in die Organisation - der Nutzer hat gerade bestaetigt, dass er
      // dorthin will. Ein Umweg ueber die Uebersicht waere ein Klick zu viel.
      router.replace(`/organizations/${organizationId}`);
    } catch (problem) {
      // Unveraendert vom Server. Die Meldungen sind dort bewusst gewaehlt:
      // "Einladung ungueltig" fuer unbekannt, bereits eingeloest UND
      // zurueckgezogen - damit niemand erfaehrt, ob ein Token einmal echt war.
      setFehler(
        problem instanceof ApiFehler
          ? problem.message
          : 'Beitritt derzeit nicht möglich',
      );
    }
  };

  return (
    <Karte
      titel="Einladung annehmen"
      untertitel={`Angemeldet als ${nutzer.email}`}
    >
      {fehler && <Hinweis>{fehler}</Hinweis>}

      <p className="text-sm text-zinc-500">
        Mit dem Beitritt werden Sie Mitglied der Organisation und sehen deren
        Projekte und Aufgaben.
      </p>

      <div>
        <Knopf
          type="button"
          onClick={() => void beitreten()}
          laedt={annehmen.isPending}
        >
          Beitreten
        </Knopf>
      </div>

      <p className="text-xs text-zinc-500">
        Sie sind als <strong>{nutzer.email}</strong> angemeldet. Wurde die
        Einladung an eine andere Adresse geschickt, melden Sie sich zuerst mit
        dieser an.
      </p>
    </Karte>
  );
}
