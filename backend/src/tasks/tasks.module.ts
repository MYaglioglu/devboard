import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';

import { KalenderController } from './kalender.controller';
import { KalenderService } from './kalender.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/**
 * Feature-Modul fuer Aufgaben.
 *
 * Eigenes Modul statt einer Erweiterung von ProjectsModule: Tasks haben eine
 * eigene Fachlichkeit (Sortierung, Zuweisung, spaeter das Verschieben) und
 * werden in Scheibe 3.4 noch deutlich wachsen. Ein Modul, das "Projekte und
 * alles darin" heisst, waere nach zwei Scheiben das groesste im Projekt.
 *
 * Der Preis ist eine Kleinigkeit, die man kennen muss: Der TasksController
 * haengt an einem Pfad, der mit `projects/:projectId` beginnt, obwohl er nicht
 * im ProjectsModule liegt. In NestJS ist das unkritisch - Routen sind global,
 * Module gruppieren nur die Bereitstellung.
 *
 * ============================================================================
 * WARUM DER KALENDER HIER MITWOHNT UND KEIN EIGENES MODUL IST
 * ============================================================================
 * Er liest Aufgaben - dieselbe Fachlichkeit, andere Blickrichtung. Ein eigenes
 * KalenderModule muesste TasksModule importieren, ohne dass es dafuer eine
 * Grenze gaebe, die man ziehen will.
 *
 * Was er dagegen SEHR WOHL ist, ist ein eigener Service neben TasksService,
 * nicht eine weitere Methode darin: Der Kalender liest nur, kennt keine
 * Sortierpositionen und schreibt keine Aktivitaeten. Waere er eine Methode auf
 * TasksService, haette er ueber `this` Zugriff auf das Schreiben mitsamt
 * ActivitiesService - und die Lehre aus Sprint 4 lautet: Was nicht da ist,
 * kann man nicht versehentlich benutzen.
 */
@Module({
  imports: [ActivitiesModule],
  controllers: [TasksController, KalenderController],
  providers: [TasksService, KalenderService],
})
export class TasksModule {}
