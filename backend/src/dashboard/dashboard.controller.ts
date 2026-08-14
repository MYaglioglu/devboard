import { Controller, Get } from '@nestjs/common';

import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { DashboardService } from './dashboard.service';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { Kennzahlen } from './dashboard.service';

/**
 * Kennzahlen einer Organisation.
 *
 * Kein `@Rollen()` - jedes Mitglied darf die Zahlen des eigenen Teams sehen.
 * Sie enthalten nichts, was ein MEMBER nicht ohnehin sehen darf: Wer die
 * Projektliste und das Board oeffnen darf, kann dieselben Zahlen von Hand
 * abzaehlen. Eine Rollenpruefung waere hier Sicherheitstheater.
 */
@Controller(`organizations/:${ORG_PARAM}/dashboard`)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /organizations/:orgId/dashboard/stats
   *
   * Der Pfad hat einen zweiten Abschnitt, obwohl es bisher nur eine Ressource
   * gibt. `/dashboard` allein waere kuerzer - und muesste beim naechsten
   * Bestandteil (etwa einer Verlaufskurve) entweder aufgebrochen oder mit
   * einem immer groesseren Objekt beantwortet werden. Ein Endpoint, der alles
   * liefert, was das Dashboard gerade braucht, ist der Anfang einer
   * Schnittstelle, die sich nach der Oberflaeche richtet statt nach den Daten.
   */
  @Get('stats')
  async stats(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
  ): Promise<Kennzahlen> {
    return this.dashboard.berechne(mitgliedschaft.organizationId);
  }
}
