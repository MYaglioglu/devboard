'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { useAktiveOrganisation } from '@/lib/aktive-organisation';
import { useAuth } from '@/lib/auth-context';
import { useOrganisationen } from '@/lib/organisationen';
import { useProjekte } from '@/lib/projekte';
import type { Organisation } from '@/lib/organisationen';

/**
 * ============================================================================
 * DIE SEITENLEISTE
 * ============================================================================
 * Sie ersetzt das, was vorher jede Seite fuer sich hatte: einen Weg zurueck.
 * Vorher gab es acht Seiten mit eigenen Links; "Abmelden" existierte nur auf
 * dem Dashboard.
 *
 * ============================================================================
 * WARUM SIE DIE PROJEKTE ZEIGT, ABER KEINE ZAHLEN NACHLAEDT
 * ============================================================================
 * Die Projektliste kommt aus derselben Abfrage, die auch die Projektseite
 * benutzt - TanStack Query liefert sie aus dem Zwischenspeicher, es entsteht
 * keine zweite Anfrage.
 *
 * Was hier NICHT steht, ist eine Zahl je Projekt ("7 offene Aufgaben"). Sie
 * waere huebsch und der direkte Weg dorthin ist eine Abfrage PRO PROJEKT -
 * also genau das N+1, das in Sprint 4 gemessen und beseitigt wurde. Richtig
 * waere ein zusaetzliches `groupBy` nach `projectId` im Dashboard-Endpoint.
 * Das ist eine Backend-Aenderung und gehoert in eine eigene Scheibe; sie steht
 * im Backlog.
 */
export function Seitenleiste({
  beimNavigieren,
}: {
  beimNavigieren?: () => void;
}) {
  const pfad = usePathname();
  const router = useRouter();
  const { nutzer, abmelden } = useAuth();
  const { data: organisationen } = useOrganisationen();
  const { aktive, waehle } = useAktiveOrganisation(organisationen);

  const jetztAbmelden = async () => {
    await abmelden();
    router.replace('/login');
  };

  return (
    <div className="flex h-full flex-col gap-6 p-3">
      <Link
        href="/dashboard"
        onClick={beimNavigieren}
        className="flex items-center gap-2 px-2 py-1 font-medium tracking-tight"
      >
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-md bg-akzent text-[11px] font-bold text-akzent-text"
        >
          D
        </span>
        DevBoard
      </Link>

      {aktive && (
        <OrganisationsWechsler
          aktive={aktive}
          alle={organisationen ?? []}
          waehle={waehle}
          beimNavigieren={beimNavigieren}
        />
      )}

      {/*
        `aria-label` ist Pflicht, sobald es mehr als eine Navigation auf der
        Seite gibt - sonst heissen im Screenreader beide nur "Navigation" und
        sind nicht auseinanderzuhalten.
      */}
      <nav aria-label="Hauptnavigation" className="flex flex-col gap-0.5">
        <NavEintrag
          href="/dashboard"
          aktiv={pfad === '/dashboard'}
          beimNavigieren={beimNavigieren}
        >
          Dashboard
        </NavEintrag>
        <NavEintrag
          href="/organizations"
          aktiv={pfad === '/organizations'}
          beimNavigieren={beimNavigieren}
        >
          Organisationen
        </NavEintrag>
      </nav>

      {aktive && (
        <ProjektListe
          orgId={aktive.id}
          pfad={pfad}
          beimNavigieren={beimNavigieren}
        />
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-rand pt-3">
        <Avatar
          name={nutzer?.name ?? nutzer?.email}
          kennung={nutzer?.id ?? 'unbekannt'}
          groesse="klein"
        />
        <span className="min-w-0 flex-1 truncate text-xs text-leise">
          {nutzer?.name ?? nutzer?.email}
        </span>
        <button
          onClick={() => void jetztAbmelden()}
          className="rounded-md px-2 py-1 text-xs text-leise transition hover:bg-flaeche-gedaempft hover:text-text"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}

/**
 * Ein Navigationseintrag.
 *
 * ============================================================================
 * `aria-current="page"` IST HIER KEINE ZIERDE
 * ============================================================================
 * Der aktive Eintrag ist fuer das Auge an seinem Hintergrund erkennbar. Fuer
 * einen Screenreader ist er das NICHT - dort klingen alle Eintraege gleich.
 * `aria-current="page"` ist die Ansage "hier stehst du gerade", und sie kostet
 * ein Attribut.
 *
 * Genau derselbe Gedanke wie bei `aria-invalid` am Eingabefeld: Ohne das
 * Attribut existiert der Zustand nur fuer sehende Nutzer.
 */
function NavEintrag({
  href,
  aktiv,
  children,
  beimNavigieren,
}: {
  href: string;
  aktiv: boolean;
  children: React.ReactNode;
  beimNavigieren?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={beimNavigieren}
      aria-current={aktiv ? 'page' : undefined}
      className={`rounded-md px-2 py-1.5 text-sm transition ${
        aktiv
          ? 'bg-akzent-leise font-medium text-akzent'
          : 'text-leise hover:bg-flaeche-gedaempft hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}

function ProjektListe({
  orgId,
  pfad,
  beimNavigieren,
}: {
  orgId: string;
  pfad: string;
  beimNavigieren?: () => void;
}) {
  const { data: projekte, isPending } = useProjekte(orgId);
  const basis = `/organizations/${orgId}/projects`;

  return (
    // `flex-1` fehlte hier in der ersten Fassung, und das war im Browser
    // sofort zu sehen: Der Bereich nahm nur seine Mindesthoehe ein, die Liste
    // fiel auf eine winzige Box mit eigenem Scrollbalken zusammen, und der
    // Nutzerblock darunter rutschte aus dem Bild.
    //
    // `flex-1 min-h-0` ist das Paar, das man in einer Flex-Spalte fast immer
    // zusammen braucht: `flex-1` laesst den Bereich den uebrigen Platz nehmen,
    // `min-h-0` hebt die Vorgabe `min-height: auto` auf - ohne sie kann ein
    // Flex-Kind nicht kleiner werden als sein Inhalt und scrollt deshalb nie.
    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
      <div className="flex items-baseline justify-between px-2 pb-1">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-still">
          Projekte
        </h2>
        <Link
          href={basis}
          onClick={beimNavigieren}
          className="text-[11px] text-still transition hover:text-text"
        >
          alle
        </Link>
      </div>

      {isPending && (
        // Zwei graue Balken statt "Lade …": Der Platz bleibt derselbe, die
        // Liste springt beim Eintreffen nicht.
        <div className="flex flex-col gap-1 px-2 py-1" aria-hidden>
          <span className="h-4 w-24 animate-pulse rounded bg-rand" />
          <span className="h-4 w-16 animate-pulse rounded bg-rand" />
        </div>
      )}

      {projekte?.length === 0 && (
        <p className="px-2 py-1 text-xs text-still">Noch keine Projekte.</p>
      )}

      {/* `overflow-y-auto` erst hier, nicht an der ganzen Leiste: Nur die
          Projektliste darf lang werden, Kopf und Fuss bleiben stehen.
          `flex-1` gehoert dazu - ohne das bleibt die Liste auf Inhaltshoehe
          stehen und zeigt schon bei einem einzigen Projekt einen
          Scrollbalken. Genau so war es, und im Browser war es sofort zu
          sehen. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {projekte?.map((projekt) => (
          <li key={projekt.id}>
            <NavEintrag
              href={`${basis}/${projekt.id}`}
              aktiv={pfad === `${basis}/${projekt.id}`}
              beimNavigieren={beimNavigieren}
            >
              <span className="block truncate">{projekt.name}</span>
            </NavEintrag>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Der Organisationswechsler.
 *
 * ============================================================================
 * WARUM EIN EIGENES MENUE UND KEIN <select>
 * ============================================================================
 * Ein `<select>` waere zugaenglich, ohne dass man etwas tun muss, und deutlich
 * weniger Code. Es kann aber nur TEXT anzeigen - kein Avatar, keine zweite
 * Zeile, und der Eintrag "Organisation anlegen" waere darin eine Option, die
 * gar keine Auswahl ist, sondern eine Aktion.
 *
 * Der Preis ist, dass Tastatur und Screenreader von Hand bedient werden
 * muessen: Escape schliesst, ein Klick nach draussen schliesst,
 * `aria-expanded` sagt den Zustand an. Das ist genau die Arbeit, die eine
 * Bibliothek wie Radix abnimmt - und der Grund, warum man sie irgendwann
 * einsetzt.
 */
function OrganisationsWechsler({
  aktive,
  alle,
  waehle,
  beimNavigieren,
}: {
  aktive: Organisation;
  alle: Organisation[];
  waehle: (id: string) => void;
  beimNavigieren?: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);
  const menueId = useId();

  useEffect(() => {
    if (!offen) return;

    const beiTaste = (ereignis: KeyboardEvent) => {
      if (ereignis.key === 'Escape') setOffen(false);
    };

    const beiKlick = (ereignis: MouseEvent) => {
      if (!huelle.current?.contains(ereignis.target as Node)) setOffen(false);
    };

    document.addEventListener('keydown', beiTaste);
    document.addEventListener('mousedown', beiKlick);

    // Aufraeumen ist hier nicht Formsache: Ohne das blieben nach jedem
    // Oeffnen zwei Zuhoerer am Dokument haengen.
    return () => {
      document.removeEventListener('keydown', beiTaste);
      document.removeEventListener('mousedown', beiKlick);
    };
  }, [offen]);

  return (
    <div ref={huelle} className="relative">
      <button
        type="button"
        onClick={() => setOffen((z) => !z)}
        aria-expanded={offen}
        aria-controls={offen ? menueId : undefined}
        className="flex w-full items-center gap-2 rounded-lg border border-rand px-2 py-1.5
          text-left text-sm transition hover:bg-flaeche-gedaempft"
      >
        <Avatar name={aktive.name} kennung={aktive.id} groesse="klein" />
        <span className="min-w-0 flex-1 truncate">{aktive.name}</span>
        <span aria-hidden className="text-still">
          ⌄
        </span>
      </button>

      {offen && (
        <div
          id={menueId}
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg
            border border-rand bg-flaeche-erhoben py-1 shadow-lg"
        >
          {alle.map((organisation) => (
            <button
              key={organisation.id}
              type="button"
              onClick={() => {
                waehle(organisation.id);
                setOffen(false);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm
                transition hover:bg-flaeche-gedaempft"
            >
              <Avatar
                name={organisation.name}
                kennung={organisation.id}
                groesse="klein"
              />
              <span className="min-w-0 flex-1 truncate">
                {organisation.name}
              </span>
              {organisation.id === aktive.id && (
                <span aria-hidden className="text-akzent">
                  ✓
                </span>
              )}
            </button>
          ))}

          <Link
            href="/organizations"
            onClick={() => {
              setOffen(false);
              beimNavigieren?.();
            }}
            className="mt-1 block border-t border-rand px-2 pb-1 pt-2 text-sm text-leise
              transition hover:text-text"
          >
            Organisationen verwalten
          </Link>
        </div>
      )}
    </div>
  );
}
