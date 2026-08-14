import { Module } from '@nestjs/common';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityFeedService } from './activity-feed.service';

/**
 * Der Aktivitaets-Feed.
 *
 * Zwei Dienste mit Absicht: `ActivitiesService` schreibt (ohne eigenen
 * `PrismaService`, damit er nur in fremden Transaktionen arbeiten KANN),
 * `ActivityFeedService` liest. Die Begruendung steht ausfuehrlich in
 * activities.service.ts - kurz: Was nicht da ist, kann man nicht versehentlich
 * benutzen.
 *
 * Exportiert wird nur der SCHREIBER, weil Projekte und Tasks ihn brauchen.
 * Der Feed-Dienst bleibt im Modul: Ihn braucht nur der eigene Controller, und
 * vorsorglich exportiert wird nichts. Er wird NICHT global
 * bereitgestellt: Wer ihn nutzt, soll das in seinem eigenen Modul sichtbar
 * importieren muessen. Bei einer Abhaengigkeit, die in fremde Transaktionen
 * hineinschreibt, ist diese Sichtbarkeit den Zeilenaufwand wert.
 */
@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityFeedService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
