import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';

import { AktuellerNutzer } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AktuelleMitgliedschaft } from './decorators/current-membership.decorator';
import { Rollen } from './decorators/roles.decorator';
import {
  acceptInvitationSchema,
  createInvitationSchema,
} from './dto/create-invitation.dto';
import { Role } from '../generated/prisma/enums';
import { ORG_PARAM } from './guards/membership.guard';
import { InvitationsService } from './invitations.service';
import type { AngemeldeterNutzer } from '../auth/guards/access-token.guard';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
} from './dto/create-invitation.dto';
import type { AktiveMitgliedschaft } from './guards/membership.guard';
import type {
  AusgestellteEinladung,
  OffeneEinladung,
} from './invitations.service';

const einladungIdSchema = z.uuid('Ungueltige Einladungs-ID');

/**
 * Einladungen INNERHALB einer Organisation.
 *
 * Der Pfad baut wieder auf ORG_PARAM auf - der Guard erkennt mandanten-
 * gebundene Routen an genau diesem Parameternamen, und ein Tippfehler waere
 * ein offener Endpoint statt eines Compilerfehlers.
 */
@Controller(`organizations/:${ORG_PARAM}/invitations`)
export class OrganizationInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * POST /organizations/:orgId/invitations
   *
   * Spricht eine Einladung aus. OWNER und ADMIN.
   *
   * Dass ein ADMIN nur MEMBER einladen darf, steht NICHT hier, sondern im
   * Service: Diese Feinheit haengt an der ZIELROLLE im Anfragekoerper, und
   * die kennt ein Guard nicht. Wieder dieselbe Trennung - der Decorator
   * regelt den Zugang, der Service den Einzelfall.
   *
   * Die Antwort ist bewusst IMMER dieselbe, ob unter der Adresse ein Konto
   * existiert oder nicht. Alles andere waere ein Prueffdienst fuer fremde
   * E-Mail-Adressen.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Post()
  async lade(
    @AktuellerNutzer() nutzer: AngemeldeterNutzer,
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Body(new ZodValidationPipe(createInvitationSchema))
    daten: CreateInvitationDto,
  ): Promise<AusgestellteEinladung> {
    return this.invitations.lade(
      mitgliedschaft.organizationId,
      nutzer.id,
      mitgliedschaft.role,
      daten,
    );
  }

  /**
   * GET /organizations/:orgId/invitations
   *
   * Die offenen Einladungen. Nur OWNER und ADMIN - ein MEMBER darf sehen, WER
   * dazugehoert (die Mitgliederliste), aber nicht, wer noch eingeladen ist.
   * Das ist eine Verwaltungsinformation und verraet ausserdem E-Mail-Adressen
   * von Menschen, die (noch) nicht Teil des Teams sind.
   *
   * Der Token taucht hier NICHT auf. Er existiert genau einmal, in der
   * Antwort auf das Anlegen - erzwungen ueber einen eigenen Rueckgabetyp.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Get()
  async offene(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
  ): Promise<OffeneEinladung[]> {
    return this.invitations.findeOffene(mitgliedschaft.organizationId);
  }

  /**
   * DELETE /organizations/:orgId/invitations/:invitationId
   *
   * Zieht eine Einladung zurueck. 204 No Content.
   *
   * Die Einladung wird nicht geloescht, sondern mit `revokedAt` entwertet -
   * dieselbe Ueberlegung wie bei den Refresh-Token: Eine aufbewahrte,
   * entwertete Zeile laesst sich von einer nie existierenden unterscheiden.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ziehZurueck(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('invitationId', new ZodValidationPipe(einladungIdSchema))
    einladungId: string,
  ): Promise<void> {
    return this.invitations.ziehZurueck(
      mitgliedschaft.organizationId,
      einladungId,
    );
  }
}

/**
 * Das Einloesen einer Einladung.
 *
 * ============================================================================
 * WARUM DIESE ROUTE NICHT UNTER /organizations/:orgId LIEGT
 * ============================================================================
 * Weil der Anfragende zu diesem Zeitpunkt noch KEIN Mitglied ist - der
 * MitgliedschaftsGuard wuerde ihn mit 404 abweisen. Die Route waere nur fuer
 * die erreichbar, die sie nicht brauchen.
 *
 * Die Organisation steht ausserdem gar nicht im Pfad: Welche gemeint ist,
 * ergibt sich aus dem TOKEN. Der Eingeladene muss die ID nicht kennen, und er
 * soll sie auch nicht raten koennen.
 *
 * Angemeldet sein muss er trotzdem - der globale AccessTokenGuard greift.
 * Eine Einladung anzunehmen setzt ein Konto voraus; wer keines hat,
 * registriert sich zuerst.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * POST /invitations/accept
   *
   * POST und nicht GET, obwohl ein Klick im E-Mail-Programm ein GET ausloest:
   * Das Einloesen VERAENDERT etwas (es entsteht eine Mitgliedschaft), und GET
   * muss laut Standard nebenwirkungsfrei sein. Sonst genuegt ein
   * Link-Vorschau-Dienst oder ein Virenscanner im Postfach, der Links
   * vorsorglich oeffnet, um die Einladung ungefragt einzuloesen.
   *
   * Der Link in der E-Mail zeigt deshalb auf eine SEITE im Frontend, die den
   * Token aus der URL liest und diesen Endpoint aufruft.
   */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async nimmAn(
    @AktuellerNutzer() nutzer: AngemeldeterNutzer,
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    daten: AcceptInvitationDto,
  ): Promise<{ organizationId: string; role: Role }> {
    return this.invitations.nimmAn(nutzer.id, nutzer.email, daten);
  }
}
