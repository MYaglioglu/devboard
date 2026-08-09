import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
  };
}

/**
 * Fachlogik des Health-Checks. Kennt kein HTTP.
 *
 * Unterscheidung, die in der Praxis wichtig ist:
 * - Liveness  = "laeuft der Prozess ueberhaupt?"  -> Neustart hilft
 * - Readiness = "kann er Anfragen bedienen?"      -> Neustart hilft NICHT,
 *   wenn die Datenbank weg ist. Solange nur Readiness rot ist, nimmt ein
 *   Loadbalancer die Instanz aus dem Verkehr, statt sie neu zu starten.
 *
 * Dieser Endpoint deckt beides ab: Antwortet er, lebt der Prozess.
 * `checks.database` sagt zusaetzlich, ob er auch arbeitsfaehig ist.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    const databaseUp = await this.prisma.isReachable();

    return {
      status: databaseUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseUp ? 'up' : 'down',
      },
    };
  }
}
