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

  // CORS: Ein Browser darf eine Antwort nur auswerten, wenn der Server die
  // aufrufende Herkunft ausdruecklich erlaubt. Anderer Port zaehlt bereits als
  // fremde Herkunft - :3001 ist fuer :3000 fremd.
  //
  // Bewusst KEIN origin: '*' - das erlaubte jeder beliebigen Webseite, im Namen
  // eingeloggter Nutzer Anfragen zu stellen. Mit credentials: true verbietet die
  // Spezifikation den Platzhalter ohnehin.
  // Hinweis: cookieParser steht bewusst NICHT hier, sondern in AppModule -
  // sonst fehlte es in den E2E-Tests, die die Anwendung direkt aus dem Modul
  // bauen. Hier gehoert nur hinein, was den Prozess betrifft.
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((eintrag) => eintrag.trim()),
    credentials: true,
  });

  await app.listen(port);

  new Logger('Bootstrap').log(`Backend laeuft auf http://localhost:${port}`);
}

void bootstrap();
