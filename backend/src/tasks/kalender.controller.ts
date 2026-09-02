import { Controller, Get, Query } from '@nestjs/common';

import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { KalenderService } from './kalender.service';
import { kalenderQuerySchema } from './dto/kalender-query.dto';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { KalenderQueryDto } from './dto/kalender-query.dto';
import type { Kalendereintrag } from './kalender.service';

/**
 * Die Termine einer Organisation.
 *
 * ============================================================================
 * WARUM DIESER PFAD KEIN PROJEKT ENTHAELT
 * ============================================================================
 * Alle anderen Aufgaben-Routen liegen unter
 * `/organizations/:orgId/projects/:projectId/tasks`. Der Kalender nicht - und
 * das ist keine Nachlaessigkeit, sondern die Fachlichkeit: Er zeigt den
 * Kalender der ORGANISATION. Auf demselben Dienstag liegen Aufgaben aus drei
 * Projekten; das ist der Zweck der Ansicht.
 *
 * Ein `:projectId` im Pfad wuerde genau das ausschliessen. Ein Filter auf ein
 * einzelnes Projekt gehoert deshalb spaeter in die Query-Parameter, nicht in
 * den Pfad - so wie beim Feed, wo `?projectId=` aus demselben Grund optional
 * ist.
 *
 * Der Schutz bleibt derselbe: `:orgId` ist der Parameter, an dem der globale
 * MitgliedschaftsGuard greift.
 *
 * ============================================================================
 * WARUM `calendar` UND NICHT `tasks`
 * ============================================================================
 * `GET /organizations/:orgId/tasks` waere naheliegender - es sind ja Aufgaben.
 * Es waere aber ein Versprechen, das dieser Endpoint nicht haelt: Er liefert
 * nur Aufgaben MIT Faelligkeitsdatum, aus nicht archivierten Projekten, in
 * einem Pflicht-Zeitraum, ohne `position` und ohne `description`.
 *
 * Wer `/tasks` liest, erwartet "alle Aufgaben" und bekaeme stillschweigend
 * eine Auswahl. Ein Name, der die Einschraenkung verschweigt, ist die
 * teuerste Sorte von Fehler - sie faellt erst dem naechsten Entwickler auf.
 * `calendar` sagt, was es ist: eine Ansicht, kein Ressourcen-Zugriff.
 *
 * Deshalb steht der Name auch im Singular, wie `activity` - gemeint ist "der
 * Kalender dieser Organisation", nicht eine Liste einzeln adressierbarer
 * Dinge. Es gibt bewusst kein `GET .../calendar/:id`; einen Termin holt man
 * ueber seine Aufgabe.
 *
 * ============================================================================
 * WER DARF LESEN
 * ============================================================================
 * Kein `@Rollen()` - jedes Mitglied. Aufgaben sind die Arbeit, und der
 * Kalender zeigt nur, was ohnehin auf den Boards steht, die dasselbe Mitglied
 * sehen darf. Ihn Verwaltern vorzubehalten waere die Umkehrung seines Zwecks.
 */
@Controller(`organizations/:${ORG_PARAM}/calendar`)
export class KalenderController {
  constructor(private readonly kalender: KalenderService) {}

  /**
   * GET /organizations/:orgId/calendar?von=…&bis=…
   *
   * Beide Parameter sind Pflicht, der Zeitraum ist halboffen und hoechstens
   * 92 Tage breit - begruendet im Query-DTO.
   */
  @Get()
  async lies(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Query(new ZodValidationPipe(kalenderQuerySchema))
    zeitraum: KalenderQueryDto,
  ): Promise<Kalendereintrag[]> {
    // `mitgliedschaft.organizationId` und nicht @Param(ORG_PARAM): Beide
    // tragen denselben Wert, aber nur der eine ist durch die Pruefung des
    // Guards gegangen. Dieselbe Zeile steht aus demselben Grund im
    // ActivitiesController.
    return this.kalender.findeZeitraum(mitgliedschaft.organizationId, zeitraum);
  }
}
