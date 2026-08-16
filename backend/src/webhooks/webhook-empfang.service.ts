import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { entschluessele, leseSchluessel } from './krypto';
import { pruefeSignatur } from './signatur';
import type { Env } from '../config/env.schema';

/**
 * Nimmt Zustellungen von GitHub entgegen (ADR-015).
 *
 * ============================================================================
 * WARUM DAS EIN EIGENER DIENST IST UND NICHT EINE METHODE NEBENAN
 * ============================================================================
 * Der `RepositoryConnectionsService` arbeitet IMMER mit einem geprueften
 * Mandanten: Jede seiner Methoden bekommt eine `organizationId`, die aus einer
 * vom Guard geprueften Mitgliedschaft stammt.
 *
 * Hier gibt es keinen Mandanten. Es gibt keine Sitzung, kein Token, keinen
 * angemeldeten Nutzer - GitHub ruft an. Die Organisation ERGIBT SICH erst aus
 * der Verbindung, und die wird ueber die ID im Pfad gefunden.
 *
 * Zwei Dienste machen diesen Unterschied im Dateibaum sichtbar. Waeren beide
 * Faelle in einer Klasse, stuenden Methoden mit und ohne Mandantenpflicht
 * nebeneinander - und die Frage "muss hier eine organizationId hin?" haette
 * keine Antwort mehr, die man am Ort ablesen kann. Dasselbe Argument wie beim
 * getrennten Lese-Dienst fuer den Aktivitaets-Feed in Sprint 4.
 */
@Injectable()
export class WebhookEmpfangService {
  private readonly logger = new Logger(WebhookEmpfangService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Prueft die Signatur und schreibt die Zustellung weg.
   *
   * Gibt zurueck, ob es eine NEUE Zustellung war. `false` heisst: schon
   * gesehen, nichts zu tun - siehe unten.
   *
   * @throws NotFoundException wenn die Verbindung nicht existiert ODER die
   *         Signatur nicht stimmt.
   */
  async nimmAn(
    verbindungsId: string,
    rohrumpf: Buffer,
    signatur: string | undefined,
    ereignisTyp: string,
    zustellungsId: string,
  ): Promise<{ neu: boolean }> {
    const verbindung = await this.prisma.repositoryConnection.findUnique({
      where: { id: verbindungsId },
      select: {
        id: true,
        secretCiphertext: true,
        secretIv: true,
        secretAuthTag: true,
      },
    });

    /**
     * ========================================================================
     * WARUM UNBEKANNTE VERBINDUNG UND FALSCHE SIGNATUR DIESELBE ANTWORT GEBEN
     * ========================================================================
     * Beides ist 404, und beides ohne Hinweis darauf, was gefehlt hat.
     *
     * Waeren die Antworten unterscheidbar, waere dieser Endpoint ein
     * Auskunftsdienst darueber, welche Verbindungs-IDs es gibt: 404 fuer
     * "kenne ich nicht", 401 fuer "kenne ich, aber Signatur falsch". Wer IDs
     * durchprobiert, haette damit ein Ja/Nein-Orakel.
     *
     * Dieselbe Ueberlegung wie bei 404 statt 403 fuer fremde Organisationen
     * (Sprint 2) und wie beim Login, der nicht verraet, ob die E-Mail-Adresse
     * existiert (Sprint 1). Es ist dieselbe Regel in ihrer dritten Auspraegung:
     * EINE FEHLERMELDUNG DARF NICHT MEHR VERRATEN, ALS DER FRAGENDE SEHEN DARF.
     */
    if (!verbindung) {
      throw new NotFoundException();
    }

    const geheimnis = entschluessele(
      {
        ciphertext: verbindung.secretCiphertext,
        iv: verbindung.secretIv,
        authTag: verbindung.secretAuthTag,
      },
      leseSchluessel(
        this.config.get('WEBHOOK_ENCRYPTION_KEY', { infer: true }),
      ),
    );

    if (!pruefeSignatur(rohrumpf, signatur, geheimnis)) {
      // Protokolliert wird, DASS eine Signatur nicht stimmte - nicht die
      // gelieferte Signatur und erst recht nicht das Geheimnis. Ein Protokoll
      // ist eine Datei, die kopiert und weitergereicht wird.
      this.logger.warn(
        `Ungueltige Signatur fuer Verbindung ${verbindungsId} (Zustellung ${zustellungsId})`,
      );
      throw new NotFoundException();
    }

    /**
     * ========================================================================
     * ERST HIER WIRD GEPARST - NACH DER PRUEFUNG, NICHT DAVOR
     * ========================================================================
     * Die Reihenfolge ist Absicht. Bis zu dieser Zeile ist der Rumpf nichts
     * als eine Folge von Bytes aus dem Internet. Wer vorher parst, laesst
     * ungeprueftes Material in die eigene Verarbeitung - und bei einem
     * fehlerhaften JSON entstuende ein Fehler, der nichts mit der eigentlichen
     * Frage zu tun hat.
     *
     * Nest hat den Rumpf zwar ohnehin schon geparst - wir benutzen das
     * Ergebnis aber erst jetzt.
     */
    const nutzlast: unknown = JSON.parse(rohrumpf.toString('utf8'));

    /**
     * ========================================================================
     * DER SCHUTZ GEGEN MEHRFACHZUSTELLUNG - IM CONSTRAINT, NICHT IN EINEM `if`
     * ========================================================================
     * GitHub stellt bei jedem Fehlschlag erneut zu, mit DERSELBEN
     * `X-GitHub-Delivery`. Der naheliegende Code waere: nachsehen, ob es die
     * Zeile schon gibt, und nur sonst schreiben. Zwischen dem Lesen und dem
     * Schreiben passen aber zwei gleichzeitige Zustellungen durch - beide
     * finden nichts, beide schreiben, das Ereignis steht doppelt im Feed.
     *
     * Deshalb wird blind geschrieben und genau die Verletzung des
     * UNIQUE-Constraints abgefangen. Zum vierten Mal dieselbe Lehre nach
     * ADR-010, ADR-012 und dem `create` beim Verbinden.
     */
    try {
      await this.prisma.webhookDelivery.create({
        data: {
          connectionId: verbindung.id,
          eventType: ereignisTyp,
          deliveryId: zustellungsId,
          payload: nutzlast as never,
        },
      });

      return { neu: true };
    } catch (fehler) {
      if (istEindeutigkeitVerletzt(fehler)) {
        return { neu: false };
      }

      throw fehler;
    }
  }
}

/** Prisma meldet eine verletzte Eindeutigkeit mit P2002. */
const istEindeutigkeitVerletzt = (fehler: unknown): boolean =>
  typeof fehler === 'object' &&
  fehler !== null &&
  'code' in fehler &&
  fehler.code === 'P2002';
