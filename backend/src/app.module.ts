import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import cookieParser from 'cookie-parser';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

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
    PrismaModule,
    HealthModule,
    AuthModule,
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
    // `{*splat}` ist die Wildcard-Schreibweise von Express 5 (frueher '*').
    consumer.apply(cookieParser()).forRoutes('{*splat}');
  }
}
