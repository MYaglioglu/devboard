import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TokenService } from '../token.service';
import { IST_OEFFENTLICH } from '../decorators/public.decorator';
import type { AccessTokenPayload } from '../token.service';

/**
 * Der angemeldete Nutzer, wie ihn der Guard an die Anfrage haengt.
 */
export interface AngemeldeterNutzer {
  id: string;
  email: string;
}

/**
 * Erweiterung des Express-Request um unser Feld.
 * Sauberer als `(request as any).user` - der Typ bleibt erhalten.
 */
export interface AnfrageMitNutzer extends Request {
  nutzer?: AngemeldeterNutzer;
}

/**
 * Laesst nur Anfragen mit gueltigem Access-Token durch.
 *
 * ============================================================================
 * WAS IST EIN GUARD?
 * ============================================================================
 * Ein Guard laeuft VOR dem Controller und beantwortet genau eine Frage:
 * "Darf dieser Aufruf weiter?" - `true` oder Exception.
 *
 * In Spring Boot entspricht das einem Security-Filter in der Filterkette.
 *
 * Reihenfolge in NestJS: Middleware -> Guards -> Interceptors -> Pipes ->
 * Controller. Der Guard entscheidet also, BEVOR die Eingaben validiert werden.
 * Das ist Absicht: Ein Unbefugter soll gar nicht erst Rechenzeit fuer die
 * Validierung bekommen.
 *
 * ============================================================================
 * 401 ODER 403? - die Verwechslung schlechthin
 * ============================================================================
 *   401 Unauthorized  = "Ich weiss nicht, WER du bist."
 *                       Kein Token, abgelaufen, gefaelscht.
 *                       -> Anmelden hilft.
 *
 *   403 Forbidden     = "Ich weiss, wer du bist - du darfst das nur nicht."
 *                       Gueltiger Token, aber fehlende Rolle oder fremde
 *                       Organisation.
 *                       -> Anmelden hilft NICHT.
 *
 * Dieser Guard prueft nur die IDENTITAET (Authentifizierung) und wirft deshalb
 * ausschliesslich 401. Ein 403 kommt spaeter aus dem Rollen-Guard in Sprint 2
 * (Autorisierung).
 *
 * Merksatz: 401 = wer bist du? 403 = du darfst nicht.
 * Dass "Unauthorized" im Standard faelschlich fuer Authentifizierung steht,
 * ist eine historische Fehlbenennung im HTTP-Standard - sie sorgt bis heute
 * fuer Verwirrung.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Der Reflector liest die Metadaten, die @Oeffentlich() gesetzt hat.
    // `getAllAndOverride` prueft Methode UND Klasse - eine Markierung an der
    // Methode gewinnt gegen die der Klasse.
    const istOeffentlich = this.reflector.getAllAndOverride<boolean>(
      IST_OEFFENTLICH,
      [context.getHandler(), context.getClass()],
    );

    if (istOeffentlich) {
      return true;
    }

    const anfrage = context.switchToHttp().getRequest<AnfrageMitNutzer>();
    const token = this.leseBearerToken(anfrage);

    if (!token) {
      throw new UnauthorizedException('Kein Access-Token vorhanden');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.tokens.pruefeAccessToken(token);
    } catch {
      // Bewusst dieselbe Meldung fuer abgelaufen, gefaelscht und Unsinn.
      // Ein Angreifer soll nicht erfahren, WORAN es lag.
      throw new UnauthorizedException('Access-Token ungueltig oder abgelaufen');
    }

    // Ab hier steht der Nutzer jedem Controller zur Verfuegung - ohne dass
    // dieser den Token noch einmal anfassen muesste.
    anfrage.nutzer = { id: payload.sub, email: payload.email };

    return true;
  }

  /**
   * Liest den Token aus dem Authorization-Header.
   *
   * Format laut RFC 6750:  Authorization: Bearer <token>
   *
   * "Bearer" heisst woertlich "Inhaber": Wer den Token vorlegt, gilt als
   * berechtigt - es gibt keinen zusaetzlichen Nachweis. Genau deshalb ist die
   * kurze Lebensdauer so wichtig.
   *
   * Warum der Header und nicht ein Cookie? Weil ein Header NICHT automatisch
   * mitgeschickt wird. Der Client muss ihn bewusst setzen - damit ist CSRF
   * fuer diese Endpoints strukturell ausgeschlossen.
   */
  private leseBearerToken(anfrage: Request): string | undefined {
    const kopf = anfrage.headers.authorization;
    if (!kopf) return undefined;

    const [schema, wert] = kopf.split(' ');

    // Gross-/Kleinschreibung des Schemas ist laut Standard unerheblich.
    return schema?.toLowerCase() === 'bearer' && wert ? wert : undefined;
  }
}
