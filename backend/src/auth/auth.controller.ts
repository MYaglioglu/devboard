import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { registerSchema } from './dto/register.dto';
import type { OeffentlicherNutzer } from './auth.service';
import type { RegisterDto } from './dto/register.dto';

/**
 * HTTP-Schnittstelle der Authentifizierung.
 *
 * Duenn wie jeder Controller: entgegennehmen, weitergeben, antworten. Die
 * einzigen Entscheidungen hier sind HTTP-Entscheidungen (Statuscode, Pipe).
 * Die Fachlogik steckt vollstaendig im AuthService - dadurch ist sie auch aus
 * einem Test, einem Cronjob oder einem Worker heraus aufrufbar.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   *
   * 201 Created ist bei NestJS fuer POST bereits die Voreinstellung; die
   * Angabe steht hier trotzdem ausdruecklich da, weil der Statuscode Teil des
   * API-Vertrags ist und nicht aus Versehen richtig sein soll.
   *
   * Die Pipe validiert VOR dem Controller. Kommt der Aufruf hier an, sind die
   * Daten garantiert gueltig und getrimmt/kleingeschrieben - der Controller
   * muss nichts pruefen.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) daten: RegisterDto,
  ): Promise<OeffentlicherNutzer> {
    return this.authService.register(daten);
  }
}
