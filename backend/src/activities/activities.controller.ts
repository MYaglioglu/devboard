import { Controller, Get, Query } from '@nestjs/common';

import { ActivityFeedService } from './activity-feed.service';
import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { feedQuerySchema } from './dto/feed-query.dto';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { FeedQueryDto } from './dto/feed-query.dto';
import type { FeedSeite } from './activity-feed.service';

/**
 * Der Aktivitaets-Feed einer Organisation.
 *
 * ============================================================================
 * WARUM ES KEINEN SCHREIBENDEN ENDPOINT GIBT
 * ============================================================================
 * Nur `GET`. Es gibt kein `POST /activity`, und das ist keine Luecke: Ein
 * Ereignis entsteht dadurch, dass etwas GESCHIEHT - nicht dadurch, dass jemand
 * es behauptet. Waere der Feed von aussen beschreibbar, koennte jedes Mitglied
 * einen Verlauf erfinden, und die Zusage aus ADR-012 (Eintrag und Aenderung
 * gelten gemeinsam) waere von aussen aushebelbar.
 *
 * Dasselbe gilt fuer `PATCH` und `DELETE`: Ein Protokoll, das sich aendern
 * laesst, ist als Protokoll wertlos. Deshalb hat die Tabelle auch kein
 * `updatedAt`.
 *
 * ============================================================================
 * WER DARF LESEN
 * ============================================================================
 * Kein `@Rollen()` - jedes Mitglied, auch ein MEMBER. Der Feed zeigt, was im
 * eigenen Team passiert ist; ihn nur Verwaltern zu zeigen, waere die Umkehrung
 * seines Zwecks.
 *
 * Zu sehen ist ausschliesslich, was das Mitglied ohnehin sehen darf: Der
 * Mandantenfilter des Guards greift ueber `:orgId`, und der Service stellt die
 * Organisation in die WHERE-Bedingung.
 */
@Controller(`organizations/:${ORG_PARAM}/activity`)
export class ActivitiesController {
  constructor(private readonly feed: ActivityFeedService) {}

  /**
   * GET /organizations/:orgId/activity
   *
   * `?limit=20&cursor=…&projectId=…` - alle drei optional.
   *
   * Der Pfad heisst `activity` im Singular und nicht `activities`. Gemeint ist
   * "die Aktivitaet dieser Organisation" als Sammelbegriff, nicht eine Liste
   * einzeln adressierbarer Ressourcen - es gibt bewusst kein
   * `GET .../activity/:id`. Ein Eintrag ist ohne seinen Verlauf sinnlos.
   */
  @Get()
  async lies(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Query(new ZodValidationPipe(feedQuerySchema)) abfrage: FeedQueryDto,
  ): Promise<FeedSeite> {
    // Wieder `mitgliedschaft.organizationId` und nicht @Param(ORG_PARAM):
    // Beide tragen denselben Wert, aber nur der eine ist durch die Pruefung
    // gegangen.
    return this.feed.findeSeite(mitgliedschaft.organizationId, abfrage);
  }
}
