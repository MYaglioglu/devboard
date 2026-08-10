import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

/**
 * Feature-Modul fuer Authentifizierung.
 *
 * PrismaService wird nicht importiert, weil PrismaModule global ist
 * (siehe prisma.module.ts) - Datenbankzugriff ist ein Querschnittsthema.
 *
 * `exports` enthaelt bewusst nur den PasswordService: Den brauchen spaetere
 * Module moeglicherweise (etwa zum Aendern eines Passworts). Der AuthService
 * bleibt privat - wer Konten anlegen will, geht ueber die HTTP-Schnittstelle
 * oder bekommt dafuer eine eigene, ausdrueckliche Methode. Alles nicht
 * Exportierte ist von aussen unerreichbar; das ist Kapselung auf Modulebene.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [PasswordService],
})
export class AuthModule {}
