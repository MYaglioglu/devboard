import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * `@Global` ist hier bewusst gesetzt: Datenbankzugriff ist ein
 * Querschnittsthema, das praktisch jedes Feature-Modul braucht. Ohne
 * global muesste jedes Modul PrismaModule einzeln importieren.
 *
 * Bei Feature-Modulen waere @Global dagegen ein Fehler - es hebelt genau
 * die Kapselung aus, wegen der es Module gibt.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
