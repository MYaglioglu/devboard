import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { Rollen } from '../organizations/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import { createProjectSchema } from './dto/create-project.dto';
import { updateProjectSchema } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { Projekt } from './projects.service';

/**
 * Validiert den Projekt-Teil des Pfads.
 *
 * Ohne das ginge "abc" bis zur Datenbank durch, Prisma meldete ungueltige
 * UUID-Syntax, und aus einer schlicht falschen Eingabe wuerde ein 500er.
 * Am Rand validiert ergibt es ein sauberes 400 - dieselbe Ueberlegung wie
 * beim `userId`-Parameter im OrganizationScopedController.
 */
const projektIdSchema = z.uuid('Ungültige Projekt-ID');

/**
 * Liest `?includeArchived=true`.
 *
 * Query-Parameter sind IMMER Zeichenketten - `?includeArchived=false` waere
 * als `Boolean('false')` ausgewertet `true`, also das genaue Gegenteil der
 * Absicht. Deshalb wird hier ausdruecklich gegen 'true' verglichen, statt
 * sich auf die Wahrheitswert-Umwandlung von JavaScript zu verlassen.
 *
 * `.catch(false)` heisst: Unsinn im Parameter fuehrt nicht zu einem Fehler,
 * sondern zur sicheren Voreinstellung. Bei einem FILTER ist das vertretbar -
 * bei allem, was schreibt, waere es das nicht.
 */
const includeArchivedSchema = z
  .enum(['true', 'false'])
  .optional()
  .catch(undefined)
  .transform((wert) => wert === 'true');

/**
 * Projekte innerhalb einer Organisation.
 *
 * ============================================================================
 * WARUM DER PFAD MIT ORG_PARAM GEBAUT WIRD
 * ============================================================================
 * Der MitgliedschaftsGuard laeuft global und erkennt eine mandantengebundene
 * Route daran, dass sie einen Parameter dieses Namens hat. Stuende hier
 * `:organizationId`, faende der Guard nichts, gaebe `true` zurueck - und
 * saemtliche Projekt-Endpoints waeren OHNE PRUEFUNG erreichbar.
 *
 * Mit der geteilten Konstanten waere ein Tippfehler ein Compilerfehler.
 * Dieselbe Begruendung wie im OrganizationScopedController; sie gilt ab jetzt
 * fuer jede neue mandantengebundene Ressource.
 *
 * ============================================================================
 * WER DARF WAS - UND WARUM DIE GRENZE HIER LIEGT
 * ============================================================================
 * LESEN darf jedes Mitglied, auch ein MEMBER: Wer in einem Team arbeitet,
 * muss die Projekte des Teams sehen.
 *
 * ANLEGEN, AENDERN und ARCHIVIEREN sind OWNER und ADMIN vorbehalten. Ein
 * Projekt ist die STRUKTUR, in der gearbeitet wird - nicht die Arbeit selbst.
 * Die Arbeit (Tasks, Scheibe 3.3) darf jedes Mitglied anlegen und verschieben.
 *
 * Die Alternative waere, auch MEMBER Projekte anlegen zu lassen. Vertretbar,
 * aber dann kann jeder die Struktur des Teams veraendern, und "wer raeumt das
 * wieder auf" ist ungeklaert. Die engere Vorgabe laesst sich spaeter oeffnen;
 * der umgekehrte Weg nimmt Rechte weg, die schon jemand benutzt.
 */
@Controller(`organizations/:${ORG_PARAM}/projects`)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /**
   * POST /organizations/:orgId/projects
   *
   * Beachte, was hier NICHT steht: kein Laden der Mitgliedschaft, keine
   * Rollenpruefung von Hand, kein Vergleich der Organisation. Der Guard hat
   * beides erledigt und reicht sein Ergebnis herein.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Post()
  async erstelle(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Body(new ZodValidationPipe(createProjectSchema)) daten: CreateProjectDto,
  ): Promise<Projekt> {
    // `mitgliedschaft.organizationId`, NICHT @Param(ORG_PARAM). Beide tragen
    // denselben Wert - aber nur der eine ist durch die Pruefung gegangen.
    return this.projects.erstelle(
      mitgliedschaft.organizationId,
      mitgliedschaft.userId,
      daten,
    );
  }

  /** GET /organizations/:orgId/projects - fuer jedes Mitglied lesbar. */
  @Get()
  async liste(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Query('includeArchived', new ZodValidationPipe(includeArchivedSchema))
    auchArchivierte: boolean,
  ): Promise<Projekt[]> {
    return this.projects.findeAlle(
      mitgliedschaft.organizationId,
      auchArchivierte,
    );
  }

  /** GET /organizations/:orgId/projects/:projectId */
  @Get(':projectId')
  async zeige(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
  ): Promise<Projekt> {
    return this.projects.findeEines(mitgliedschaft.organizationId, projektId);
  }

  /** PATCH /organizations/:orgId/projects/:projectId */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Patch(':projectId')
  async aendere(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) daten: UpdateProjectDto,
  ): Promise<Projekt> {
    return this.projects.aendere(
      mitgliedschaft.organizationId,
      mitgliedschaft.userId,
      projektId,
      daten,
    );
  }

  /**
   * DELETE /organizations/:orgId/projects/:projectId
   *
   * ==========================================================================
   * WARUM DELETE, OBWOHL NUR ARCHIVIERT WIRD
   * ==========================================================================
   * Aus Sicht des Clients ist es dasselbe: Das Projekt verschwindet aus der
   * Liste. Dass wir es in Wahrheit nur mit einem Zeitstempel versehen, ist
   * eine Entscheidung UNSERER Seite - der Verlauf bleibt erhalten, und
   * Sprint 4 zieht seine Kennzahlen daraus.
   *
   * Die Alternative waere ein eigener Endpoint `POST .../archive`. Ehrlicher
   * im Namen, aber der Client muesste dann wissen, dass DevBoard archiviert
   * statt loescht - eine interne Entscheidung, die nach aussen sichtbar wird
   * und sich spaeter nicht mehr aendern laesst.
   *
   * Wieder-Aktivieren gibt es bewusst noch nicht: vermerkt in 06_BACKLOG.md.
   *
   * 204 No Content: erfolgreich, nichts zurueckzugeben.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiviere(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
  ): Promise<void> {
    return this.projects.archiviere(
      mitgliedschaft.organizationId,
      mitgliedschaft.userId,
      projektId,
    );
  }
}
