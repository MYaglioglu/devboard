import {
  Body,
  Controller,
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
import { loginSchema } from './dto/login.dto';
import { registerSchema } from './dto/register.dto';
import type { Env } from '../config/env.schema';
import type { LoginErgebnis, OeffentlicherNutzer } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

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
