import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoService } from './demo.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import type { Env } from '../config/env.schema';

/**
 * Feature-Modul fuer Authentifizierung.
 *
 * PrismaService wird nicht importiert, weil PrismaModule global ist
 * (siehe prisma.module.ts) - Datenbankzugriff ist ein Querschnittsthema.
 *
 * `exports` enthaelt bewusst nur PasswordService und TokenService: Den einen
 * brauchen spaetere Module moeglicherweise (Passwort aendern), den anderen der
 * Guard in Scheibe 4. Der AuthService bleibt privat - wer Konten anlegen will,
 * geht ueber die HTTP-Schnittstelle. Alles nicht Exportierte ist von aussen
 * unerreichbar; das ist Kapselung auf Modulebene.
 */
@Module({
  imports: [
    // `registerAsync`, weil das Geheimnis erst zur Laufzeit aus der
    // validierten Konfiguration kommt. `register` waere synchron und muesste
    // den Wert schon beim Laden der Datei kennen - dann stuende er im Code.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        // Das Signaturverfahren wird HIER festgelegt und NICHT dem Header des
        // eingehenden Tokens entnommen. Sonst waere der bekannte
        // "alg: none"-Angriff moeglich, bei dem ein Angreifer die
        // Signaturpruefung schlicht abschaltet.
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    DemoService,
    PasswordService,
    TokenService,
    RefreshTokenService,
  ],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
