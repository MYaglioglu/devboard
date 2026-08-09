import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env.schema';

/**
 * Duenne Huelle um den generierten PrismaClient, damit dieser vom
 * DI-Container verwaltet wird und am Lebenszyklus der Anwendung haengt.
 *
 * OnModuleInit / OnModuleDestroy sind NestJS-Lifecycle-Hooks: Nest ruft sie
 * beim Hoch- und Herunterfahren auf. Ohne sauberes $disconnect bleiben beim
 * Neustart Verbindungen im Pool der Datenbank haengen.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    // Prisma 7 spricht ueber einen Driver Adapter mit der Datenbank
    // (hier der Node-Treiber `pg`) statt ueber eine Rust-Binaerdatei.
    // Die URL kommt aus der validierten Konfiguration, nicht aus process.env.
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Datenbankverbindung hergestellt');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Prueft, ob die Datenbank tatsaechlich antwortet.
   *
   * `$connect()` allein sagt wenig: Eine Verbindung kann bestehen und die
   * Datenbank trotzdem nicht mehr antworten. Deshalb eine echte Abfrage.
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Datenbank nicht erreichbar', error);
      return false;
    }
  }
}
