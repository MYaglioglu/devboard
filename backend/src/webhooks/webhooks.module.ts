import { Module } from '@nestjs/common';

import { RepositoryConnectionsController } from './repository-connections.controller';
import { RepositoryConnectionsService } from './repository-connections.service';
import { WebhookEmpfangService } from './webhook-empfang.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Feature-Modul fuer die GitHub-Integration.
 *
 * PrismaService fehlt in den `imports`, weil PrismaModule global ist. Der
 * MitgliedschaftsGuard wird hier NICHT registriert: Er laeuft global im
 * AppModule und greift ueber den `:orgId`-Parameter - genau deshalb kann man
 * ihn bei einem neuen Modul nicht vergessen.
 *
 * `ActivitiesModule` fehlt noch, anders als bei Projekten und Aufgaben. Das
 * ist kein Versehen: In dieser Scheibe entsteht kein Feed-Eintrag. Ob das
 * VERBINDEN eines Repositories protokolliert werden sollte, ist eine eigene
 * Frage - und die Ereignisse, um die es in diesem Sprint wirklich geht,
 * entstehen erst in Scheibe 5.5 aus den Zustellungen.
 *
 * `exports` bleibt leer, bis jemand etwas braucht. Vorsorglich exportiert wird
 * nichts - dieselbe Zurueckhaltung wie beim ProjectsModule.
 */
@Module({
  controllers: [RepositoryConnectionsController, WebhooksController],
  providers: [RepositoryConnectionsService, WebhookEmpfangService],
})
export class WebhooksModule {}
