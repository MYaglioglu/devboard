import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Kennzahlen. Liest nur - deshalb kein Export: Niemand sonst braucht diesen
 * Dienst, und vorsorglich exportiert wird nichts.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
