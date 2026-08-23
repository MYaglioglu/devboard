import Link from 'next/link';

import { StartAktionen } from '@/components/start-aktionen';
import { SystemStatus } from '@/components/system-status';

/**
 * Startseite.
 *
 * Bewusst KEINE 'use client'-Datei. Der Inhalt ist statisch und wird als
 * fertiges HTML ausgeliefert - wichtig fuer die erste Seite, die jemand sieht,
 * und fuer Suchmaschinen. Nur zwei Inseln brauchen den Browser: die
 * Handlungsaufforderungen (kennen den Anmeldezustand) und die Statusanzeige
 * in der Fusszeile.
 *
 * WAS HIER FRUEHER STAND: eine Systemstatus-Anzeige - "Backend erreichbar,
 * Datenbank verbunden, Laufzeit 12 s". Waehrend der Entwicklung war das genau
 * richtig, es war der Rauchtest fuer die Verbindung beider Anwendungen. Als
 * erste Seite fuer Besucher war es falsch: Wer die Adresse aus einer Bewerbung
 * anklickt, sieht dann eine technische Statusmeldung und keinen Grund
 * weiterzuklicken. Der Status ist deshalb nicht verschwunden, sondern in die
 * Fusszeile gewandert - ein Beleg statt einer Ansage.
 */

const FUNKTIONEN = [
  {
    titel: 'Organisationen und Rollen',
    text: 'Mehrere Teams in einer Anwendung, getrennt auf Datenebene. Rollen von OWNER bis MEMBER, Einladungen per Token.',
  },
  {
    titel: 'Projekte und Aufgaben',
    text: 'Aufgaben mit Status, Beschreibung und Zuordnung – gruppiert in Projekten je Organisation.',
  },
  {
    titel: 'Kanban-Board',
    text: 'Verschieben per Maus oder Tastatur. Die Reihenfolge bleibt stabil, auch wenn zwei Personen gleichzeitig sortieren.',
  },
  {
    titel: 'Dashboard und Feed',
    text: 'Kennzahlen der Organisation und ein fortlaufendes Protokoll aller Änderungen, seitenweise nachladbar.',
  },
  {
    titel: 'GitHub-Integration',
    text: 'Ein Repository verbinden, und Pushes und Pull Requests erscheinen im Feed – über signierte Webhooks.',
  },
];

const TECHNIK = [
  {
    titel: 'Mandantentrennung in der Abfrage',
    text: 'Die Organisation steht in der WHERE-Bedingung, nicht in einer Prüfung danach. Abgesichert durch Tests, die fremde Zugriffe erwarten – und durch Mutationsproben, die belegen, dass diese Tests den Schutz wirklich bewachen.',
  },
  {
    titel: 'Nebenläufigkeit, die geprüft ist',
    text: 'Sortierung per fractional indexing, optimistisches Sperren beim Verschieben mit 409 bei Konflikt, Idempotenz eingehender Webhooks über ein UNIQUE statt über ein vorheriges Nachsehen.',
  },
  {
    titel: 'Gemessen statt behauptet',
    text: 'Zwei Skripte im Repository lassen die naive und die optimierte Fassung nebeneinander laufen: 202 gegen 4 Abfragen beim Dashboard, dazu die Ausführungspläne des Feeds auf 40.000 Zeilen.',
  },
  {
    titel: 'Entscheidungen mit Preis',
    text: 'Neunzehn Architekturentscheidungen mit verworfenen Alternativen und eingestandenen Nachteilen – und ein Fehlerprotokoll mit den eigenen Fehlern statt einer Hochglanzfassung.',
  },
];

const SCHICHTEN = [
  {
    ort: 'Vercel',
    was: 'Next.js',
    text: 'Oberfläche, statisch ausgeliefert',
  },
  {
    ort: 'Hetzner',
    was: 'NestJS im Container',
    text: 'hinter einem Reverse Proxy, ohne eigenen Port nach außen',
  },
  {
    ort: 'Neon',
    was: 'PostgreSQL',
    text: 'verwaltet, mit geprüfter TLS-Verbindung',
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-16 px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">DevBoard</span>
        <nav className="flex gap-4 text-sm text-zinc-500">
          <a
            href="https://github.com/MYaglioglu/devboard"
            className="transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Quelltext
          </a>
          <a
            href="https://github.com/MYaglioglu/devboard/tree/main/docs"
            className="transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Handbuch
          </a>
        </nav>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Projektverwaltung für Entwicklerteams
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Organisationen, Projekte, ein Kanban-Board und ein Aktivitäts-Feed –
          mit Anbindung an GitHub. Gebaut als Referenzprojekt: vollständig
          getestet, dokumentiert und im echten Betrieb.
        </p>
        <StartAktionen />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Was die Anwendung kann
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FUNKTIONEN.map((funktion) => (
            <div
              key={funktion.titel}
              className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h3 className="font-medium">{funktion.titel}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {funktion.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Wie sie gebaut ist
        </h2>
        <div className="flex flex-col gap-4">
          {TECHNIK.map((punkt) => (
            <div
              key={punkt.titel}
              className="border-l-2 border-emerald-500 pl-5"
            >
              <h3 className="font-medium">{punkt.titel}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {punkt.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Aufbau
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {SCHICHTEN.map((schicht) => (
            <div
              key={schicht.ort}
              className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {schicht.ort}
              </p>
              <p className="mt-1 font-medium">{schicht.was}</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {schicht.text}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-zinc-500">
          Aufgeteilt nach Schadenshöhe: Was nur eine Wiederholung kostet, wird
          selbst betrieben. Was unwiederbringlich ist – die Daten – liegt bei
          einem Anbieter mit Sicherungen.{' '}
          <Link
            href="https://github.com/MYaglioglu/devboard/blob/main/docs/16_DECISIONS.md"
            className="underline underline-offset-4 transition hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Begründung in den Architekturentscheidungen
          </Link>
          .
        </p>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <SystemStatus />
        <span>Ein Projekt von Murat Yaglioglu</span>
      </footer>
    </div>
  );
}
