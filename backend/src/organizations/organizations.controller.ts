import { Body, Controller, Get, Post } from '@nestjs/common';

import { AktuellerNutzer } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createOrganizationSchema } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';
import type { AngemeldeterNutzer } from '../auth/guards/access-token.guard';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { OrganisationMitRolle } from './organizations.service';

/**
 * HTTP-Schnittstelle der Organisationen.
 *
 * ============================================================================
 * WARUM HIER KEIN @Oeffentlich() UND KEIN @UseGuards() STEHT
 * ============================================================================
 * Beides ist richtig so. Der `AccessTokenGuard` laeuft global (siehe
 * AppModule), also sind diese Endpoints automatisch geschuetzt - ohne dass
 * hier etwas dafuer stehen muesste. Secure by default: Wer den Schutz
 * vergisst, bekommt keine offene Route, sondern gar nichts.
 *
 * ============================================================================
 * WARUM DIE NUTZER-ID AUS DEM TOKEN KOMMT UND NICHT AUS DEM KOERPER
 * ============================================================================
 * Ein `{ "name": "...", "userId": "..." }` waere bequem - und die Luecke.
 * Alles, was der Client schickt, ist eine BEHAUPTUNG. Wer die eigene ID im
 * Koerper mitschicken darf, darf auch eine fremde mitschicken.
 *
 * Die ID aus dem Token dagegen ist signiert und stammt vom Server selbst.
 * Merksatz: Identitaet kommt NIE aus dem Anfragekoerper.
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /**
   * POST /organizations
   *
   * 201 Created - hier entsteht tatsaechlich eine neue Ressource. (Der
   * Standardwert von NestJS fuer POST ist bereits 201, deshalb ohne
   * @HttpCode; beim Login stand er ausdruecklich auf 200, weil ein Login
   * nichts erzeugt.)
   *
   * Der Ersteller wird in derselben Transaktion zum OWNER - siehe Service.
   */
  @Post()
  async erstelle(
    @AktuellerNutzer() nutzer: AngemeldeterNutzer,
    @Body(new ZodValidationPipe(createOrganizationSchema))
    daten: CreateOrganizationDto,
  ): Promise<OrganisationMitRolle> {
    return this.organizations.erstelle(nutzer.id, daten);
  }

  /**
   * GET /organizations
   *
   * Liefert ausschliesslich die Organisationen des angemeldeten Nutzers.
   *
   * Beachte, was hier NICHT steht: kein Filterparameter, keine Moeglichkeit,
   * "alle" abzufragen. Es gibt gar keinen Weg, ueber diesen Endpoint fremde
   * Organisationen zu sehen - die Einschraenkung ist nicht optional, sondern
   * Teil der Abfrage im Service.
   *
   * Bewusst OHNE Paginierung: Ein Mensch ist in einer Handvoll Organisationen,
   * nicht in Tausenden. Paginierung kommt in Sprint 4 dort, wo Listen
   * tatsaechlich unbegrenzt wachsen (Tasks, Aktivitaets-Feed). Sie hier
   * einzubauen waere Aufwand ohne Nutzen - und ein Cursor, den niemand
   * benutzt, ist trotzdem Code, der getestet und gepflegt werden muss.
   */
  @Get()
  async meine(
    @AktuellerNutzer() nutzer: AngemeldeterNutzer,
  ): Promise<OrganisationMitRolle[]> {
    return this.organizations.findeMeine(nutzer.id);
  }
}
