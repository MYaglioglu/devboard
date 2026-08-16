import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { Rollen } from '../organizations/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import { connectRepositorySchema } from './dto/connect-repository.dto';
import { RepositoryConnectionsService } from './repository-connections.service';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { ConnectRepositoryDto } from './dto/connect-repository.dto';
import type {
  Verbindung,
  VerbindungMitGeheimnis,
} from './repository-connections.service';

/** Wie im ProjectsController: am Rand validiert ergibt "abc" ein 400, kein 500. */
const projektIdSchema = z.uuid('Ungültige Projekt-ID');

/**
 * Die GitHub-Verbindung eines Projekts.
 *
 * ============================================================================
 * WARUM DER PFAD MIT ORG_PARAM GEBAUT WIRD
 * ============================================================================
 * Der MitgliedschaftsGuard laeuft global und erkennt eine mandantengebundene
 * Route daran, dass sie einen Parameter dieses Namens hat. Stuende hier
 * `:organizationId`, faende der Guard nichts, gaebe `true` zurueck - und diese
 * Endpoints waeren OHNE PRUEFUNG erreichbar. Mit der geteilten Konstanten
 * waere ein Tippfehler ein Compilerfehler.
 *
 * ============================================================================
 * WER DARF WAS
 * ============================================================================
 * LESEN darf jedes Mitglied - wer im Projekt arbeitet, darf wissen, woher die
 * Ereignisse kommen. Das Geheimnis steht dabei nicht in der Antwort.
 *
 * VERBINDEN und TRENNEN sind OWNER und ADMIN vorbehalten. Dieselbe Grenze wie
 * beim Projekt selbst: Ein Repository anzubinden ist eine Entscheidung ueber
 * die STRUKTUR, nicht ueber die Arbeit darin. Und sie hat eine Aussenwirkung -
 * wer trennt, macht einen in GitHub eingetragenen Webhook unbrauchbar.
 *
 * ============================================================================
 * WARUM DIESE ROUTEN NICHT IM PROJECTSCONTROLLER STEHEN
 * ============================================================================
 * Sie haengen an einem Projekt, gehoeren aber fachlich zur GitHub-Integration:
 * Ihre Nachbarn sind der Webhook-Endpoint und die Verarbeitung, nicht das
 * Anlegen von Projekten. Waeren sie dort, wuechse der ProjectsController mit
 * jeder Integration weiter, und der Ort einer Aenderung waere nicht mehr
 * vorhersagbar.
 */
@Controller(`organizations/:${ORG_PARAM}/projects/:projectId/repository`)
export class RepositoryConnectionsController {
  constructor(private readonly verbindungen: RepositoryConnectionsService) {}

  /**
   * POST /organizations/:orgId/projects/:projectId/repository
   *
   * Die einzige Antwort im ganzen Projekt, die ein Geheimnis im Klartext
   * enthaelt - und sie kommt genau einmal. Danach steht es nur noch
   * verschluesselt in der Datenbank und ist von dort nicht mehr abrufbar.
   *
   * 201 Created ist hier richtig und nicht 200: Es entsteht eine neue
   * Ressource, die vorher nicht existierte.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Post()
  async verbinde(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Body(new ZodValidationPipe(connectRepositorySchema))
    daten: ConnectRepositoryDto,
  ): Promise<VerbindungMitGeheimnis> {
    // `mitgliedschaft.organizationId`, NICHT @Param(ORG_PARAM). Beide tragen
    // denselben Wert - aber nur der eine ist durch die Pruefung gegangen.
    return this.verbindungen.verbinde(
      mitgliedschaft.organizationId,
      projektId,
      mitgliedschaft.userId,
      daten,
    );
  }

  /**
   * GET /organizations/:orgId/projects/:projectId/repository
   *
   * Fuer jedes Mitglied lesbar, deshalb kein @Rollen(). Liefert `null`, wenn
   * das Projekt kein Repository hat - das ist eine gueltige Auskunft, kein
   * Fehler.
   */
  @Get()
  async zeige(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
  ): Promise<Verbindung | null> {
    return this.verbindungen.zeige(mitgliedschaft.organizationId, projektId);
  }

  /**
   * DELETE /organizations/:orgId/projects/:projectId/repository
   *
   * 204 No Content: erfolgreich, nichts zurueckzugeben.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async trenne(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
  ): Promise<void> {
    return this.verbindungen.trenne(mitgliedschaft.organizationId, projektId);
  }
}
