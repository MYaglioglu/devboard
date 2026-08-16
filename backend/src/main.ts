import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

/**
 * Composition Root: der einzige Ort, an dem der Objektgraph gebaut wird.
 */
async function bootstrap(): Promise<void> {
  /**
   * ==========================================================================
   * `rawBody` - DIE EINSTELLUNG, OHNE DIE DIE SIGNATURPRUEFUNG NIE STIMMT
   * ==========================================================================
   * Normalerweise parst NestJS den Rumpf zu JSON und wirft die urspruenglichen
   * Bytes weg. Fuer einen HMAC ist das toedlich: Er ist eine Aussage ueber
   * BYTES, nicht ueber Bedeutung. Ein neu serialisiertes Objekt hat andere
   * Bytes bei gleicher Bedeutung - andere Schluesselreihenfolge, andere
   * Leerzeichen - und die Signatur stimmt dann NIE.
   *
   * Mit dieser Option haelt Nest den Rohrumpf zusaetzlich vor.
   *
   * ACHTUNG, GLEICHE FALLE WIE BEI cookieParser (siehe unten): Das ist eine
   * Option beim ERZEUGEN der Anwendung, kein Modul. Die E2E-Tests bauen ihre
   * Anwendung selbst und muessen sie deshalb ebenfalls setzen - sonst laeuft
   * dort etwas anderes als in Produktion.
   *
   * Damit dieses Auseinanderlaufen nicht still bleibt, prueft der
   * Webhook-Controller ausdruecklich, ob der Rohrumpf da ist, und sagt
   * andernfalls genau das - statt eine falsche Signatur zu melden.
   */
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
