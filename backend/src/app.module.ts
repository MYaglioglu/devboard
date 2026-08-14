import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { ActivitiesModule } from './activities/activities.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { MitgliedschaftsGuard } from './organizations/guards/membership.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import type { Env } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Ohne isGlobal muesste jedes Modul das ConfigModule einzeln importieren.
      isGlobal: true,

      // Die .env liegt im Wurzelverzeichnis des Repos - dieselbe, die auch
      // Docker Compose und Prisma lesen. Eine Quelle statt drei.
      envFilePath: ['../.env'],

      // Laeuft beim Start. Wirft bei ungueltiger Konfiguration.
      validate: validateEnv,
    }),

    /**
     * Rate Limiting.
     *
     * ========================================================================
     * WARUM DAS NOETIG IST, OBWOHL ARGON2 SCHON BREMST
     * ========================================================================
     * argon2 macht EINEN Versuch teuer (~50-100 ms). Das schuetzt gegen das
     * Durchprobieren eines geklauten Hashes - aber nicht gegen jemanden, der
     * einfach viele Anfragen schickt. Zehn Versuche pro Sekunde ueber Stunden
     * reichen fuer eine Liste haeufiger Passwoerter.
     *
     * Rate Limiting begrenzt die ANZAHL, argon2 die KOSTEN pro Versuch. Beides
     * zusammen macht Brute Force unwirtschaftlich.
     *
     * ========================================================================
     * GRENZE DES AKTUELLEN AUFBAUS
     * ========================================================================
     * Der Zaehler liegt im Arbeitsspeicher. Das genuegt bei einer Instanz -
     * laufen spaeter mehrere hinter einem Loadbalancer, hat jede ihren eigenen
     * Zaehler, und die tatsaechliche Grenze vervielfacht sich. Dann braucht es
     * einen gemeinsamen Speicher (Redis). Vermerkt in 10_SECURITY.md.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const limit = config.get('THROTTLE_LIMIT', { infer: true });

        return {
          throttlers: [
            {
              ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
              // Bei 0 wird ohnehin uebersprungen; 1 nur, damit die Angabe
              // gueltig bleibt.
              limit: limit || 1,
            },
          ],
          // Bewusst EIN unbenannter Throttler statt mehrerer benannter:
          // Benannte Throttler gelten alle fuer jede Route - die strenge
          // Anmelde-Grenze wuerde damit global wirken. Strengere Grenzen
          // werden stattdessen gezielt per @Throttle ueberschrieben.
          skipIf: () => limit === 0,
        };
      },
    }),

    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    TasksModule,
    // Steht hier, obwohl ProjectsModule und TasksModule es ohnehin
    // importieren und NestJS die Controller dadurch schon faende. Ein Modul
    // mit eigener Route gehoert sichtbar in diese Liste - sonst muesste man
    // beim Suchen nach dem Feed-Endpoint erst herausfinden, ueber welchen
    // Umweg er ueberhaupt registriert ist.
    ActivitiesModule,
    DashboardModule,
  ],
  providers: [
    // ========================================================================
    // REIHENFOLGE DER GUARDS IST WICHTIG
    // ========================================================================
    // Guards laufen in der Reihenfolge ihrer Registrierung. Das Rate Limiting
    // steht ZUERST: Ein Angreifer, der den Server mit Anfragen flutet, soll
    // abgewiesen werden, BEVOR fuer jede davon ein Token geprueft wird.
    // Andersherum waere die Signaturpruefung selbst der Angriffspunkt.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Der Access-Token-Guard laeuft fuer JEDEN Endpoint. Einzelne Routen
    // werden mit @Oeffentlich() ausdruecklich freigegeben.
    //
    // Warum global statt @UseGuards pro Route: Vergisst man den Guard an einer
    // Route, waere sie versehentlich oeffentlich - und niemand merkt es, weil
    // alles funktioniert. Vergisst man umgekehrt das @Oeffentlich(), antwortet
    // der Endpoint mit 401 und der Fehler faellt sofort auf.
    //
    // SECURE BY DEFAULT: Ein Versehen muss zur sicheren Seite ausschlagen.
    { provide: APP_GUARD, useClass: AccessTokenGuard },

    // ========================================================================
    // AUTHENTIFIZIERUNG VOR AUTORISIERUNG - DIE REIHENFOLGE IST ZWINGEND
    // ========================================================================
    // Dieser Guard braucht `anfrage.nutzer`, und das setzt der AccessTokenGuard
    // eine Zeile darueber. Stuende er davor, liefe er ohne angemeldeten Nutzer
    // - er wirft dann ausdruecklich einen Fehler, statt stillschweigend
    // durchzuwinken.
    //
    // Er greift NUR bei Routen mit einem :orgId-Parameter. Laut ADR-008 steht
    // der Mandant immer im Pfad, also gilt:
    //
    //     Route hat :orgId  <=>  Route betrifft einen Mandanten
    //
    // Damit gibt es keine Markierung, die man vergessen koennte - anders als
    // bei einem @UseGuards pro Route. Der Parametername kommt aus der
    // Konstanten ORG_PARAM, die auch die Controller benutzen; sonst koennte
    // ein Tippfehler im Pfad den Guard ins Leere greifen lassen.
    { provide: APP_GUARD, useClass: MitgliedschaftsGuard },

    // Einheitliche Fehlerantworten - und keine Stacktraces nach aussen.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  /**
   * Middleware, die die Anwendung zum Funktionieren braucht.
   *
   * WICHTIG - hier statt in main.ts:
   * E2E-Tests bauen die Anwendung mit `Test.createTestingModule()` direkt aus
   * diesem Modul. `bootstrap()` in main.ts laeuft dabei NIE. Alles, was dort
   * konfiguriert wird, fehlt im Test - und dann testet man eine andere
   * Anwendung als die, die spaeter laeuft.
   *
   * Genau das ist uns hier passiert: `cookieParser()` stand in main.ts, die
   * Refresh-Tests bekamen dadurch nie ein Cookie zu sehen und schlugen mit 401
   * fehl. Der Test hatte recht - die Anwendung war falsch zusammengebaut.
   *
   * Merksatz: In main.ts gehoert nur, was den PROZESS betrifft (Port, Logger).
   * Alles, was die ANWENDUNG ausmacht, gehoert ins Modul.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        cookieParser(),
        /**
         * Helmet setzt eine Reihe von Sicherheits-Kopfzeilen. Die wichtigsten
         * fuer eine reine API:
         *
         *   X-Content-Type-Options: nosniff
         *     Verbietet dem Browser, den Inhaltstyp zu "erraten". Ohne das
         *     koennte eine als Text ausgelieferte Datei als Skript ausgefuehrt
         *     werden.
         *
         *   Strict-Transport-Security
         *     Erzwingt HTTPS fuer alle weiteren Aufrufe. Wirkt erst in
         *     Produktion, weil lokal kein HTTPS laeuft.
         *
         *   X-Frame-Options / frame-ancestors
         *     Verhindert das Einbetten in fremde Seiten (Clickjacking).
         *
         *   Content-Security-Policy
         *     Fuer eine API ohne HTML von geringem Nutzen, schadet aber nicht.
         *
         * Nicht mehr enthalten: X-XSS-Protection. Der Header ist veraltet und
         * war in manchen Browsern selbst eine Luecke.
         */
        helmet(),
      )
      // `{*splat}` ist die Wildcard-Schreibweise von Express 5 (frueher '*').
      .forRoutes('{*splat}');
  }
}
