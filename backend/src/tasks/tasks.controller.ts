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
} from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AktuelleMitgliedschaft } from '../organizations/decorators/current-membership.decorator';
import { ORG_PARAM } from '../organizations/guards/membership.guard';
import { createTaskSchema } from './dto/create-task.dto';
import { updateTaskSchema } from './dto/update-task.dto';
import { TasksService } from './tasks.service';
import type { AktiveMitgliedschaft } from '../organizations/guards/membership.guard';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { Aufgabe } from './tasks.service';

const projektIdSchema = z.uuid('Ungültige Projekt-ID');
const aufgabenIdSchema = z.uuid('Ungültige Aufgaben-ID');

/**
 * Aufgaben innerhalb eines Projekts.
 *
 * ============================================================================
 * WARUM DER PFAD DAS PROJEKT ENTHAELT
 * ============================================================================
 * `/organizations/:orgId/projects/:projectId/tasks/:taskId` ist lang. Kuerzer
 * waere `/tasks/:taskId` - die ID ist schliesslich eindeutig.
 *
 * Der lange Pfad hat zwei Vorteile, die den Preis wert sind:
 *
 *   1. Der `:orgId` darin ist das, woran der globale MitgliedschaftsGuard
 *      greift. Ohne ihn muesste jede Task-Route ihren Schutz selbst
 *      mitbringen - und die erste, die es vergisst, waere offen.
 *   2. Die Zugehoerigkeit wird ueberpruefbar statt angenommen: Der Service
 *      verlangt, dass die Aufgabe zu DIESEM Projekt und das Projekt zu DIESER
 *      Organisation gehoert. Eine Aufgaben-ID aus einem fremden Projekt
 *      laeuft ins Leere, statt zufaellig zu funktionieren.
 *
 * ============================================================================
 * WARUM HIER NIRGENDS @Rollen() STEHT
 * ============================================================================
 * Aufgaben sind die ARBEIT, Projekte die Struktur. Jedes Mitglied darf
 * arbeiten - anlegen, bearbeiten, zuweisen, loeschen. Wer einem Team
 * angehoert, aber keine Aufgabe anlegen darf, ist kein Mitglied, sondern ein
 * Zuschauer; eine solche Rolle gibt es hier nicht.
 *
 * Der Mandantenschutz greift trotzdem: Der Guard laesst nur Mitglieder
 * ueberhaupt bis hierher.
 */
@Controller(`organizations/:${ORG_PARAM}/projects/:projectId/tasks`)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** POST /organizations/:orgId/projects/:projectId/tasks */
  @Post()
  async erstelle(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) daten: CreateTaskDto,
  ): Promise<Aufgabe> {
    return this.tasks.erstelle(mitgliedschaft.organizationId, projektId, daten);
  }

  /** GET /organizations/:orgId/projects/:projectId/tasks - die Board-Abfrage. */
  @Get()
  async liste(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
  ): Promise<Aufgabe[]> {
    return this.tasks.findeAlle(mitgliedschaft.organizationId, projektId);
  }

  /** GET /organizations/:orgId/projects/:projectId/tasks/:taskId */
  @Get(':taskId')
  async zeige(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Param('taskId', new ZodValidationPipe(aufgabenIdSchema))
    aufgabenId: string,
  ): Promise<Aufgabe> {
    return this.tasks.findeEine(
      mitgliedschaft.organizationId,
      projektId,
      aufgabenId,
    );
  }

  /**
   * PATCH /organizations/:orgId/projects/:projectId/tasks/:taskId
   *
   * Aendert Inhalt, NICHT die Lage auf dem Board. Spalte und Position bekommen
   * in Scheibe 3.4 einen eigenen Endpoint - siehe update-task.dto.ts.
   */
  @Patch(':taskId')
  async aendere(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Param('taskId', new ZodValidationPipe(aufgabenIdSchema))
    aufgabenId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) daten: UpdateTaskDto,
  ): Promise<Aufgabe> {
    return this.tasks.aendere(
      mitgliedschaft.organizationId,
      projektId,
      aufgabenId,
      daten,
    );
  }

  /** DELETE /organizations/:orgId/projects/:projectId/tasks/:taskId */
  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async loesche(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('projectId', new ZodValidationPipe(projektIdSchema))
    projektId: string,
    @Param('taskId', new ZodValidationPipe(aufgabenIdSchema))
    aufgabenId: string,
  ): Promise<void> {
    return this.tasks.loesche(
      mitgliedschaft.organizationId,
      projektId,
      aufgabenId,
    );
  }
}
