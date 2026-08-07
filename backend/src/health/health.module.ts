import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Erstes Feature-Modul. Buendelt alles zum Thema "Health":
 * Controller (HTTP) und Service (Logik).
 *
 * `exports` fehlt bewusst - der HealthService wird von keinem anderen
 * Modul gebraucht und bleibt damit privat.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
