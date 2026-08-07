import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

/**
 * Composition Root: der einzige Ort, an dem der Objektgraph gebaut wird.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ConfigService liefert die *validierten* Werte - nicht process.env.
  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);

  new Logger('Bootstrap').log(`Backend laeuft auf http://localhost:${port}`);
}

void bootstrap();
