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

/**
 * Holt den Health-Status des Backends.
 *
 * Behandelt 503 bewusst nicht als Fehler: Das ist eine gueltige, aussagekraeftige
 * Antwort ("Datenbank weg"), die wir anzeigen wollen - kein Verbindungsproblem.
 */
export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });

  if (!response.ok && response.status !== 503) {
    throw new Error(`Backend antwortete mit HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  // Bei 503 verpackt NestJS die Nutzdaten unter `message`.
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'object'
  ) {
    return body.message as HealthStatus;
  }

  return body as HealthStatus;
}
