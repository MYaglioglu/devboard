import { Module } from '@nestjs/common';

import { OrganizationScopedController } from './organization-scoped.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Feature-Modul fuer Organisationen.
 *
 * PrismaService fehlt in den `imports`, weil PrismaModule global ist
 * (siehe prisma.module.ts) - Datenbankzugriff ist ein Querschnittsthema.
 *
 * `exports` steht hier noch nicht: Ab Scheibe 2.3 wird der
 * MitgliedschaftsGuard eine Mitgliedschaft nachschlagen muessen, und ab
 * Sprint 3 werden Projekte wissen wollen, ob eine Organisation existiert.
 * Exportiert wird dann genau das, was gebraucht wird - nicht vorsorglich
 * alles. Was nicht exportiert ist, kann von aussen nicht benutzt werden, und
 * genau das ist Kapselung auf Modulebene.
 */
@Module({
  controllers: [OrganizationsController, OrganizationScopedController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
