import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Feature-Modul fuer Projekte.
 *
 * PrismaService fehlt in den `imports`, weil PrismaModule global ist -
 * Datenbankzugriff ist ein Querschnittsthema.
 *
 * Der MitgliedschaftsGuard wird hier NICHT registriert: Er laeuft global im
 * AppModule und greift ueber den `:orgId`-Parameter. Genau deshalb kann man
 * ihn bei einem neuen Modul nicht vergessen - haette jedes Modul ihn selbst
 * einzubinden, waere dieses hier der erste Kandidat fuer ein Versehen.
 *
 * `exports` bleibt leer: Ab Scheibe 3.3 braucht der TasksService die
 * Gewissheit, dass ein Projekt zur Organisation gehoert. Ob das ueber einen
 * Export dieses Services laeuft oder ueber den Mandantenfilter in der
 * Task-Abfrage selbst, entscheidet sich dort - vorsorglich exportiert wird
 * nichts.
 */
/**
 * ActivitiesModule steht ausdruecklich in den `imports` - anders als
 * PrismaModule, das global ist. Ein Dienst, der in die Transaktion des
 * Aufrufers hineinschreibt, soll an der Modulgrenze sichtbar sein: Wer hier
 * liest, sieht, dass Projekte protokollieren.
 */
@Module({
  imports: [ActivitiesModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
