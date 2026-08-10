/**
 * Zugriff auf das Backend.
 *
 * Das Frontend kennt die Datenbank nicht. Es spricht ausschliesslich ueber
 * HTTP mit dem Backend - genau diese Trennung ist der Sinn zweier getrennter
 * Anwendungen.
 */

// NEXT_PUBLIC_-Variablen werden beim Build in das Browser-Bundle eingebacken.
// Deshalb duerfen hier NIEMALS Geheimnisse stehen - alles Sichtbare ist oeffentlich.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
  };
}

export interface Nutzer {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthAntwort {
  accessToken: string;
  user: Nutzer;
}

/**
 * Fehler mit HTTP-Status und - falls vorhanden - feldbezogenen Meldungen aus
 * der Zod-Validierung des Backends.
 */
export class ApiFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly felder?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiFehler';
  }
}

interface FehlerKoerper {
  message?: string | string[];
  errors?: Record<string, string[]>;
}

async function baueFehler(antwort: Response): Promise<ApiFehler> {
  let koerper: FehlerKoerper = {};
  try {
    koerper = (await antwort.json()) as FehlerKoerper;
  } catch {
    // Antwort ohne JSON-Koerper - dann bleibt es bei der Standardmeldung.
  }

  const meldung = Array.isArray(koerper.message)
    ? koerper.message.join(', ')
    : (koerper.message ?? `Anfrage fehlgeschlagen (HTTP ${antwort.status})`);

  return new ApiFehler(meldung, antwort.status, koerper.errors);
}

/**
 * Basis-Aufruf gegen das Backend.
 *
 * ============================================================================
 * credentials: 'include' - der Punkt, an dem CORS ein zweites Mal zuschlaegt
 * ============================================================================
 * Bei Anfragen ueber Herkunftsgrenzen hinweg schickt der Browser Cookies
 * standardmaessig NICHT mit - auch dann nicht, wenn CORS grundsaetzlich
 * erlaubt ist. Ohne diese Angabe kaeme das Refresh-Cookie nie beim Backend an,
 * und /auth/refresh antwortete immer mit 401.
 *
 * Die Erlaubnis muss auf BEIDEN Seiten stehen:
 *   Client: credentials: 'include'
 *   Server: enableCors({ credentials: true, origin: <konkrete Herkunft> })
 *
 * Und deshalb ist `origin: '*'` in Verbindung mit Anmeldedaten von der
 * Spezifikation verboten: Sonst koennte jede beliebige Webseite Anfragen mit
 * den Cookies des angemeldeten Nutzers stellen und die Antworten lesen.
 */
export async function api<T>(
  pfad: string,
  optionen: RequestInit = {},
): Promise<T> {
  const antwort = await fetch(`${API_BASE_URL}${pfad}`, {
    ...optionen,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...optionen.headers,
    },
  });

  if (!antwort.ok) {
    throw await baueFehler(antwort);
  }

  // 204 No Content (z. B. Logout) hat keinen Koerper - `.json()` wuerde werfen.
  if (antwort.status === 204) {
    return undefined as T;
  }

  return (await antwort.json()) as T;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const antwort = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });

  // 503 ist hier kein Fehler, sondern eine gueltige Aussage ("Datenbank weg"),
  // die wir anzeigen wollen.
  if (!antwort.ok && antwort.status !== 503) {
    throw new ApiFehler(
      `Backend antwortete mit HTTP ${antwort.status}`,
      antwort.status,
    );
  }

  const koerper: unknown = await antwort.json();

  if (
    typeof koerper === 'object' &&
    koerper !== null &&
    'message' in koerper &&
    typeof koerper.message === 'object'
  ) {
    return koerper.message as HealthStatus;
  }

  return koerper as HealthStatus;
}
