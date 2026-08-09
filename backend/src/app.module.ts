import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
  ],
})
export class AppModule {}
