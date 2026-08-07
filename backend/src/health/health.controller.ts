import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
// `import type` weil HealthStatus ein Interface ist und zur Laufzeit nicht existiert.
// Noetig wegen isolatedModules + emitDecoratorMetadata (TS1272).
import type { HealthStatus } from './health.service';

/**
 * Duenner Controller: nimmt HTTP entgegen, gibt weiter, antwortet.
 * Keine Fachlogik.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }
}
