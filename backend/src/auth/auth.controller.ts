import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, refreshCookieOptions } from './cookie';
import { AktuellerNutzer } from './decorators/current-user.decorator';
import { Oeffentlich } from './decorators/public.decorator';
import { loginSchema } from './dto/login.dto';
import { registerSchema } from './dto/register.dto';
import type { Env } from '../config/env.schema';
import type { LoginErgebnis, OeffentlicherNutzer } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { AngemeldeterNutzer } from './guards/access-token.guard';

/** Was der Client zu sehen bekommt - OHNE den Refresh-Token. */
interface AuthAntwort {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
}

/**
 * HTTP-Schnittstelle der Authentifizierung.
 *
 * Duenn wie jeder Controller. Die einzigen Entscheidungen hier sind
 * HTTP-Entscheidungen: Statuscode, Validierungs-Pipe - und das Setzen bzw.
 * Loeschen des Cookies. Cookies sind ein reines HTTP-Thema und haben im
 * Service nichts zu suchen; der Service liefert nur den Token-Wert.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Oeffentlich()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) daten: RegisterDto,
  ): Promise<OeffentlicherNutzer> {
    return this.authService.register(daten);
  }

  /**
   * POST /auth/login
   *
   * 200 OK, nicht 201: Ein Login ERZEUGT keine Ressource, er prueft
   * Zugangsdaten.
   *
   * `passthrough: true` bei `@Res()` ist wichtig: Ohne diese Angabe uebernimmt
   * man die volle Kontrolle ueber die Antwort und muesste sie selbst senden -
   * der Rueckgabewert der Methode wuerde ignoriert. Mit `passthrough` darf man
   * nur das Cookie setzen und den Rest weiterhin NestJS ueberlassen.
   */
  @Oeffentlich()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) daten: LoginDto,
    @Res({ passthrough: true }) antwort: Response,
  ): Promise<AuthAntwort> {
    const ergebnis = await this.authService.login(daten);
    return this.setzeCookieUndAntworte(ergebnis, antwort);
  }

  /**
   * POST /auth/refresh
   *
   * Stellt einen neuen Access-Token aus. Der Nachweis ist allein das Cookie -
   * es wird vom Browser automatisch mitgeschickt, der Client muss nichts tun
   * und kann den Wert auch gar nicht lesen (httpOnly).
   */
  // Oeffentlich, obwohl er eine Sitzung voraussetzt: Der Nachweis ist hier das
  // Refresh-Cookie, nicht der Access-Token. Waere die Route geschuetzt, koennte
  // man sie mit abgelaufenem Access-Token nicht mehr aufrufen - also genau
  // dann nicht, wenn man sie braucht.
  @Oeffentlich()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() anfrage: Request,
    @Res({ passthrough: true }) antwort: Response,
  ): Promise<AuthAntwort> {
    const ergebnis = await this.authService.erneuere(
      this.leseRefreshCookie(anfrage),
    );
    return this.setzeCookieUndAntworte(ergebnis, antwort);
  }

  /**
   * POST /auth/logout
   *
   * 204 No Content: erfolgreich, nichts zurueckzugeben.
   *
   * Antwortet IMMER mit 204 - auch ohne oder mit ungueltigem Cookie. Ein
   * Fehlschlag beim Abmelden waere fuer Nutzer unverstaendlich und wuerde
   * ausserdem verraten, ob ein Token gueltig war.
   */
  // Ebenfalls oeffentlich: Ein Abmelden muss auch mit abgelaufenem
  // Access-Token funktionieren. Der Widerruf stuetzt sich auf das Cookie.
  @Oeffentlich()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() anfrage: Request,
    @Res({ passthrough: true }) antwort: Response,
  ): Promise<void> {
    await this.authService.abmelden(this.leseRefreshCookie(anfrage));

    // Zum Loeschen muessen path und die uebrigen Angaben mit denen beim Setzen
    // uebereinstimmen - sonst loescht der Browser ein anderes (nicht
    // existierendes) Cookie und das echte bleibt liegen.
    antwort.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.istProduktion(),
      sameSite: 'lax',
      path: '/auth',
    });
  }

  /**
   * GET /auth/me
   *
   * Der erste GESCHUETZTE Endpoint. Ohne gueltigen Access-Token im Header
   * `Authorization: Bearer <token>` kommt er gar nicht erst zur Ausfuehrung -
   * der globale Guard wirft vorher 401.
   *
   * Beachte, was hier NICHT steht: kein Token-Auslesen, kein Pruefen, kein
   * Datenbankzugriff fuer die Identitaet. Der Guard hat das erledigt, der
   * Decorator reicht das Ergebnis herein. Genau dafuer gibt es beide.
   *
   * Die Angaben stammen aus dem Token, nicht aus der Datenbank. Das ist
   * bewusst: Es spart eine Abfrage pro Aufruf. Der Preis ist, dass eine
   * Namensaenderung erst nach dem naechsten Erneuern sichtbar wird - bei 15
   * Minuten Tokenlaufzeit vertretbar.
   */
  @Get('me')
  profil(@AktuellerNutzer() nutzer: AngemeldeterNutzer): AngemeldeterNutzer {
    return nutzer;
  }

  private setzeCookieUndAntworte(
    ergebnis: LoginErgebnis,
    antwort: Response,
  ): AuthAntwort {
    antwort.cookie(
      REFRESH_COOKIE,
      ergebnis.refreshToken.token,
      refreshCookieOptions(
        this.istProduktion(),
        ergebnis.refreshToken.expiresAt,
      ),
    );

    // Der Refresh-Token wird bewusst NICHT in den Antwortkoerper gelegt.
    // Stuende er dort, koennte JavaScript ihn lesen - und der ganze Zweck des
    // httpOnly-Cookies waere dahin.
    return { accessToken: ergebnis.accessToken, user: ergebnis.user };
  }

  private leseRefreshCookie(anfrage: Request): string | undefined {
    const cookies = anfrage.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private istProduktion(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
