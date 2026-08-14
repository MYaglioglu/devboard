import { Module } from '@nestjs/common';

import { ActivitiesService } from './activities.service';

/**
 * Der Aktivitaets-Feed.
 *
 * In dieser Scheibe (4.2) enthaelt das Modul nur den SCHREIBER und noch keinen
 * Controller - gelesen wird der Feed erst in 4.3. Ein Modul ohne Controller
 * sieht ungewohnt aus, ist aber genau das, was eine vertikale Scheibe
 * hinterlaesst: ein lauffaehiger Stand, in dem der naechste Schritt fehlt,
 * nicht ein halber.
 *
 * `exports`, weil Projekte und Tasks den Dienst brauchen. Er wird NICHT global
 * bereitgestellt: Wer ihn nutzt, soll das in seinem eigenen Modul sichtbar
 * importieren muessen. Bei einer Abhaengigkeit, die in fremde Transaktionen
 * hineinschreibt, ist diese Sichtbarkeit den Zeilenaufwand wert.
 */
@Module({
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
