import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Fachlogik des Health-Checks. Kennt kein HTTP.
 *
 * Prueft aktuell nur, ob die Anwendung selbst laeuft (Liveness).
 * Sobald Prisma dazukommt, prueft dieser Service zusaetzlich die
 * Datenbankverbindung (Readiness).
 */
@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
