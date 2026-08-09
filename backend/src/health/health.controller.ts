import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

/**
 * Duenner Controller: nimmt HTTP entgegen, gibt weiter, antwortet.
 * Die einzige HTTP-Entscheidung hier ist der Statuscode.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const result = await this.healthService.check();

    // 503 statt 200, wenn die Datenbank fehlt: Nur so kann ein Loadbalancer
    // oder Orchestrator die Instanz aus dem Verkehr nehmen. Ein Health-Check,
    // der immer 200 liefert, ist wertlos.
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
