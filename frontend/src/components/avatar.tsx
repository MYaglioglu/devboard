/**
 * ============================================================================
 * INITIALEN-AVATAR - UND WARUM ER KEIN PLATZHALTER FUER EIN BILD IST
 * ============================================================================
 * Naheliegend waere, hier spaeter ein hochgeladenes Bild einzusetzen und die
 * Initialen als Uebergangsloesung zu sehen. Das ist er nicht: Er ist der
 * RUECKFALL, den es dauerhaft braucht - fuer Konten ohne Bild, fuer geloeschte
 * Konten (`actor: null`) und fuer Ereignisse, die gar keine Person haben.
 *
 * Reine Rechnung, keine Netzwerkabfrage, kein Zustand. Deshalb laesst sich die
 * Farbwahl vollstaendig testen, ohne etwas zu rendern.
 */

/**
 * Sechs Farbpaare, hell und dunkel abgestimmt.
 *
 * ============================================================================
 * WARUM NICHT `hsl(hash % 360, ...)`
 * ============================================================================
 * Ein berechneter Farbton ueber den ganzen Kreis waere kuerzer und liefert
 * unbrauchbare Ergebnisse: Gelb und Hellgruen haben bei gleicher Saettigung
 * voellig andere wahrgenommene Helligkeit, der Text darauf ist mal lesbar und
 * mal nicht. Eine feste, geprueft kontrastreiche Liste ist die langweiligere
 * und richtige Loesung.
 *
 * Bewusst OHNE die Akzentfarbe der Anwendung: Ein Avatar in Smaragdgruen sieht
 * aus wie ein Knopf.
 */
const PALETTE = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
] as const;

/**
 * Waehlt eine Farbe anhand der Kennung.
 *
 * Wichtig ist nur, dass die Wahl STABIL ist: Derselbe Nutzer bekommt bei jedem
 * Seitenaufruf dieselbe Farbe. Ein `Math.random()` waere hier ein Flackern bei
 * jedem Rendern - und auf dem Server ein anderer Wert als im Browser, also
 * zusaetzlich eine Hydrations-Abweichung.
 */
export function farbeFuer(kennung: string): string {
  let summe = 0;

  for (let i = 0; i < kennung.length; i += 1) {
    summe = (summe + kennung.charCodeAt(i) * (i + 1)) % 4096;
  }

  return PALETTE[summe % PALETTE.length];
}

/**
 * Bildet Initialen aus einem Namen oder einer E-Mail-Adresse.
 *
 * Die Reihenfolge der Faelle ist Absicht:
 *   "Murat Yaglioglu"      -> MY   (zwei Woerter)
 *   "murat"                -> MU   (ein Wort: zwei Buchstaben, nicht einer -
 *                                   ein einzelner Buchstabe sieht aus wie ein
 *                                   Fehler)
 *   "murat@example.com"    -> MU   (vor dem @ abschneiden, sonst stuende da
 *                                   "M@" oder "ME")
 *   ""                     -> ?    (nichts Erfundenes)
 */
export function initialen(quelle: string | null | undefined): string {
  const roh = (quelle ?? '').trim();

  if (roh.length === 0) {
    return '?';
  }

  const ohneDomain = roh.includes('@') ? roh.slice(0, roh.indexOf('@')) : roh;
  const woerter = ohneDomain.split(/[\s._-]+/).filter((w) => w.length > 0);

  if (woerter.length === 0) {
    return '?';
  }

  if (woerter.length === 1) {
    return woerter[0].slice(0, 2).toUpperCase();
  }

  return (woerter[0][0] + woerter[1][0]).toUpperCase();
}

const GROESSEN = {
  klein: 'h-6 w-6 text-[10px]',
  mittel: 'h-8 w-8 text-xs',
  gross: 'h-10 w-10 text-sm',
} as const;

export function Avatar({
  name,
  kennung,
  groesse = 'mittel',
}: {
  /** Anzeigename oder E-Mail-Adresse. */
  name: string | null | undefined;
  /** Stabile Kennung fuer die Farbwahl - Nutzer-ID, Organisations-ID, … */
  kennung: string;
  groesse?: keyof typeof GROESSEN;
}) {
  return (
    <span
      // `aria-hidden`, weil der Name IMMER daneben steht. Ein Screenreader
      // laese sonst "M Y Murat" - die Initialen sind eine Wiederholung fuer
      // das Auge, keine eigene Information.
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center
        rounded-full font-medium ${GROESSEN[groesse]} ${farbeFuer(kennung)}`}
    >
      {initialen(name)}
    </span>
  );
}
