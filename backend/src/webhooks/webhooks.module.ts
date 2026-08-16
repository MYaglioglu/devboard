import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { RepositoryConnectionsController } from './repository-connections.controller';
import { RepositoryConnectionsService } from './repository-connections.service';
import { WebhookEmpfangService } from './webhook-empfang.service';
import { WebhookVerarbeitungService } from './webhook-verarbeitung.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Feature-Modul fuer die GitHub-Integration.
 *
 * PrismaService fehlt in den `imports`, weil PrismaModule global ist. Der
 * MitgliedschaftsGuard wird hier NICHT registriert: Er laeuft global im
 * AppModule und greift ueber den `:orgId`-Parameter - genau deshalb kann man
 * ihn bei einem neuen Modul nicht vergessen.
 *
 * `ActivitiesModule` steht seit Scheibe 5.5 in den `imports` - so wie bei
 * Projekten und Aufgaben. Ein Dienst, der in die Transaktion des Aufrufers
 * hineinschreibt, soll an der Modulgrenze sichtbar sein: Wer hier liest,
 * sieht, dass aus Zustellungen Feed-Eintraege werden.
 *
 * `exports` bleibt leer, bis jemand etwas braucht. Vorsorglich exportiert wird
 * nichts - dieselbe Zurueckhaltung wie beim ProjectsModule.
 */
@Module({
  imports: [ActivitiesModule],
  controllers: [RepositoryConnectionsController, WebhooksController],
  providers: [
    RepositoryConnectionsService,
    WebhookEmpfangService,
    WebhookVerarbeitungService,
  ],
})
export class WebhooksModule {}
