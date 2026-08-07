import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Ohne isGlobal muesste jedes Modul das ConfigModule einzeln importieren.
      isGlobal: true,

      // Die .env liegt im Wurzelverzeichnis des Repos - dieselbe, die auch
      // Docker Compose liest. Eine Quelle statt zwei, die auseinanderlaufen.
      envFilePath: ['../.env'],

      // Laeuft beim Start. Wirft bei ungueltiger Konfiguration.
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
