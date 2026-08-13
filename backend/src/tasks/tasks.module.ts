import { Module } from '@nestjs/common';

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
 */
@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
