import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import { Oeffentlich } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WebhookEmpfangService } from './webhook-empfang.service';
// `import type` ist hier Pflicht, nicht Stil: Mit `isolatedModules` und
// `emitDecoratorMetadata` versucht TypeScript sonst, den Typ aus einer
// dekorierten Signatur zur Laufzeit zu erhalten - und `RawBodyRequest`
// existiert zur Laufzeit gar nicht. Der Compilerfehler TS1272 sagt das
// ausdruecklich.
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

const verbindungsIdSchema = z.uuid('Ungültige Verbindungs-ID');

/**
 * Der Empfang von GitHub-Webhooks.
 *
 * ============================================================================
 * DER ERSTE ENDPOINT, DEN FREMDER CODE AUFRUFT
 * ============================================================================
 * Alles bisher Gebaute lief in eine Richtung: unser Frontend fragt, unser
 * Backend antwortet, und wer fragen darf, klaert ein Token. Hier ist es
 * umgekehrt - GitHub ruft an, ohne Konto, ohne Sitzung, ohne unseren Guard.
 *
 * Die Anfrage weist sich mit einer SIGNATUR aus, nicht mit einer IDENTITAET.
 * Deshalb steht hier `@Oeffentlich()`: Der globale AccessTokenGuard wuerde
 * sonst mit 401 antworten, bevor irgendetwas geprueft ist. Das ist kein Loch
 * im Schutz, sondern ein anderer Schutz - er sitzt eine Ebene tiefer, im
 * Dienst.
 *
 * Und beachte, was NICHT im Pfad steht: kein `:orgId`. Der
 * MitgliedschaftsGuard laeuft global, findet hier keinen solchen Parameter
 * und laesst die Route durch. Das ist genau der Fall, vor dem der Kommentar
 * im OrganizationScopedController warnt - hier ist er gewollt und deshalb
 * ausdruecklich hingeschrieben. Die Organisation ergibt sich aus der
 * Verbindung, nicht aus dem Pfad.
 */
@Controller('webhooks/github')
export class WebhooksController {
  constructor(private readonly empfang: WebhookEmpfangService) {}

  /**
   * POST /webhooks/github/:connectionId
   *
   * Tut drei Dinge und hoert dann auf: Signatur pruefen, Zustellung
   * wegschreiben, quittieren. Die Uebersetzung in Feed-Eintraege geschieht
   * spaeter, in einem eigenen Schritt (Scheibe 5.5).
   *
   * ==========================================================================
   * WARUM DAS SO WENIG TUT - UND WARUM DAS DER PUNKT IST
   * ==========================================================================
   * GitHub erwartet binnen zehn Sekunden eine Antwort und wertet alles
   * ausserhalb von 2xx als Fehlschlag. Die Folge eines Fehlschlags ist ERNEUTE
   * ZUSTELLUNG.
   *
   * Wer hier verarbeitet, hat bei einem Fehler nur zwei schlechte Antworten:
   * eine 5xx, dann scheitert dieselbe kaputte Nutzlast bei jedem
   * Wiederholungsversuch, bis GitHub aufgibt und die Zustellung endgueltig
   * verloren ist - oder eine 200, dann ist sie sofort weg.
   *
   * Mit der Zeile in der Tabelle ist sie DA, unabhaengig davon, ob wir sie
   * schon deuten koennen.
   */
  @Oeffentlich()
  @Post(':connectionId')
  @HttpCode(HttpStatus.ACCEPTED)
  async empfange(
    @Req() anfrage: RawBodyRequest<Request>,
    @Param('connectionId', new ZodValidationPipe(verbindungsIdSchema))
    verbindungsId: string,
    @Headers('x-hub-signature-256') signatur: string | undefined,
    @Headers('x-github-event') ereignisTyp: string | undefined,
    @Headers('x-github-delivery') zustellungsId: string | undefined,
  ): Promise<{ status: string }> {
    /**
     * ========================================================================
     * DIE PRUEFUNG, DIE EIN AUSEINANDERLAUFEN VON TEST UND PRODUKTION MELDET
     * ========================================================================
     * `rawBody` ist eine Option beim ERZEUGEN der Anwendung (`main.ts`), kein
     * Modul. Wer sie in einem Testaufbau vergisst, bekommt hier `undefined` -
     * und ohne diese Zeile waere die Folge eine Signatur, die "nicht stimmt".
     * Man suchte dann stundenlang am HMAC, waehrend die Ursache eine fehlende
     * Zeile im Anwendungsaufbau ist.
     *
     * Deshalb: laut scheitern mit der richtigen Auskunft. Der teuerste Fehler
     * aus Sprint 2 war eine Einstellung, die nur an einer von zwei Stellen
     * stand - genau diese Sorte.
     */
    if (!anfrage.rawBody) {
      throw new InternalServerErrorException(
        'Rohrumpf fehlt - die Anwendung wurde ohne { rawBody: true } erzeugt',
      );
    }

    // Fehlende Kopfzeilen sind kein Sonderfall, sondern der Normalfall bei
    // jemandem, der die URL einfach aufruft. Sie fuehren zu derselben Antwort
    // wie eine falsche Signatur - siehe die Begruendung im Dienst.
    if (!ereignisTyp || !zustellungsId) {
      throw new NotFoundException();
    }

    /**
     * `ping` schickt GitHub EINMAL beim Einrichten des Webhooks. Es hat eine
     * gueltige Signatur, aber keinen fachlichen Inhalt - es ist die Frage
     * "bist du da?".
     *
     * Es wird trotzdem erst NACH der Signaturpruefung beantwortet: Ein
     * Endpoint, der auf `ping` ungeprueft antwortet, bestaetigt jedem
     * Fremden, dass es diese Verbindung gibt.
     */
    const ergebnis = await this.empfang.nimmAn(
      verbindungsId,
      anfrage.rawBody,
      signatur,
      ereignisTyp,
      zustellungsId,
    );

    if (ereignisTyp === 'ping') {
      return { status: 'pong' };
    }

    // 202 in beiden Faellen. Eine zweite Zustellung ist kein Fehler, sondern
    // erwartetes Verhalten - GitHub soll aufhoeren zu wiederholen, und dafuer
    // braucht es ein 2xx.
    return { status: ergebnis.neu ? 'angenommen' : 'bereits bekannt' };
  }
}
