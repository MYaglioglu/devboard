import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { z } from 'zod';

import { AktuellerNutzer } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AktuelleMitgliedschaft } from './decorators/current-membership.decorator';
import { Rollen } from './decorators/roles.decorator';
import { updateMemberRoleSchema } from './dto/update-member-role.dto';
import { updateOrganizationSchema } from './dto/update-organization.dto';
import { Role } from '../generated/prisma/enums';
import { ORG_PARAM } from './guards/membership.guard';
import { OrganizationsService } from './organizations.service';
import type { AngemeldeterNutzer } from '../auth/guards/access-token.guard';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import type { AktiveMitgliedschaft } from './guards/membership.guard';
import type { Mitglied, OrganisationMitRolle } from './organizations.service';

/**
 * Validiert den Nutzer-Teil des Pfads.
 *
 * Ohne diese Pruefung ginge eine ID wie "abc" bis zur Datenbank durch und
 * Prisma antwortete mit einem Fehler ueber ungueltige UUID-Syntax - also
 * einem 500er fuer eine schlicht falsche Eingabe. Am Rand validiert ergibt
 * das ein sauberes 400.
 */
const nutzerIdSchema = z.uuid('Ungueltige Nutzer-ID');

/**
 * Alles, was INNERHALB einer Organisation stattfindet.
 *
 * ============================================================================
 * WARUM DER PFAD AUS EINER KONSTANTEN GEBAUT WIRD
 * ============================================================================
 * `organizations/:${ORG_PARAM}` statt `organizations/:orgId` sieht auf den
 * ersten Blick nach Ziererei aus. Es schliesst aber ein stilles Loch:
 *
 * Der MitgliedschaftsGuard laeuft global und erkennt eine mandantengebundene
 * Route daran, dass sie einen Parameter namens `orgId` hat. Schriebe hier
 * jemand `:organizationId`, faende der Guard nichts, wuerde `true`
 * zurueckgeben - und die Route waere OHNE JEDE PRUEFUNG erreichbar. Kein
 * Fehler, keine Warnung, nur ein offener Endpoint.
 *
 * Mit der geteilten Konstanten kann das nicht passieren: Guard und Route
 * lesen denselben Wert. Ein Tippfehler waere ein Compilerfehler.
 *
 * Das ist die Kehrseite eines global laufenden Guards, ehrlich benannt: Er
 * kann nicht vergessen werden, aber er kann ins Leere greifen. Die Konstante
 * schliesst genau diese Luecke.
 *
 * ============================================================================
 * WARUM DIESE ROUTEN IN EINEM EIGENEN CONTROLLER STEHEN
 * ============================================================================
 * `POST /organizations` und `GET /organizations` gehoeren zu KEINER
 * Organisation - man legt eine an oder fragt, zu welchen man gehoert. Sie
 * haben deshalb kein :orgId und werden vom Guard nicht angefasst.
 *
 * Alles hier drin setzt eine bestehende Mitgliedschaft voraus. Zwei
 * Controller machen diesen Unterschied im Dateibaum sichtbar, statt ihn im
 * Kopf behalten zu muessen.
 */
@Controller(`organizations/:${ORG_PARAM}`)
export class OrganizationScopedController {
  constructor(private readonly organizations: OrganizationsService) {}

  /**
   * GET /organizations/:orgId
   *
   * Beachte, was hier NICHT steht: kein Laden der Mitgliedschaft, kein
   * Vergleich der Nutzer-ID, keine Rollenpruefung. Der Guard hat das erledigt
   * und reicht sein Ergebnis herein.
   *
   * Fremde Organisation ODER nicht existierende Organisation: beides 404,
   * ununterscheidbar. Ein 403 wuerde bestaetigen, dass es die Organisation
   * gibt - siehe Guard.
   */
  @Get()
  async zeige(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
  ): Promise<OrganisationMitRolle> {
    // Uebergeben wird `mitgliedschaft.organizationId`, NICHT der
    // Route-Parameter. Beide tragen denselben Wert - aber nur der eine ist
    // durch die Pruefung gegangen. Wer hier @Param() nimmt, umgeht den Guard
    // an der Stelle, an der es am wenigsten auffaellt.
    return this.organizations.findeEine(
      mitgliedschaft.organizationId,
      mitgliedschaft.role,
    );
  }

  /**
   * GET /organizations/:orgId/members
   *
   * Fuer JEDES Mitglied lesbar, auch fuer MEMBER - deshalb kein @Rollen().
   * Wer in einem Team arbeitet, darf wissen, wer sonst noch dazugehoert.
   * Verwalten darf er deshalb nichts; das steht am jeweiligen Endpoint.
   */
  @Get('members')
  async mitglieder(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
  ): Promise<Mitglied[]> {
    return this.organizations.findeMitglieder(mitgliedschaft.organizationId);
  }

  /**
   * PATCH /organizations/:orgId
   *
   * Der erste Endpoint im Projekt, der 403 liefern kann: Ein MEMBER ist
   * Mitglied - er darf die Organisation nur nicht umbenennen.
   *
   * Warum ADMIN und nicht nur OWNER: Umbenennen ist eine Verwaltungsaufgabe
   * und umkehrbar. Dem OWNER allein bleiben die Aktionen vorbehalten, die
   * sich NICHT rueckgaengig machen lassen - Organisation loeschen, den
   * letzten Eigentuemer wechseln.
   *
   * Die Rollen stehen als ausdrueckliche Liste da, nicht als "mindestens
   * ADMIN". Ein Rangvergleich auf einem Enum bricht still, sobald jemand
   * einen Wert dazwischenschiebt.
   */
  @Rollen(Role.OWNER, Role.ADMIN)
  @Patch()
  async benenneUm(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    daten: UpdateOrganizationDto,
  ): Promise<OrganisationMitRolle> {
    return this.organizations.benenneUm(
      mitgliedschaft.organizationId,
      mitgliedschaft.role,
      daten,
    );
  }

  /**
   * PATCH /organizations/:orgId/members/:userId
   *
   * Aendert die Rolle eines Mitglieds. NUR OWNER.
   *
   * ==========================================================================
   * WARUM NICHT AUCH ADMIN - DER WICHTIGSTE @Rollen() IM PROJEKT
   * ==========================================================================
   * Duerfte ein ADMIN Rollen vergeben, koennte er sich selbst zum OWNER
   * machen. Damit waere die Unterscheidung der beiden Rollen wertlos: Jeder
   * ADMIN waere ein OWNER, der es nur noch nicht ausgesprochen hat.
   *
   * Merksatz: WER RECHTE VERGEBEN DARF, HAT SIE. Die Befugnis, Rollen zu
   * aendern, ist deshalb immer die hoechste Befugnis im System - und gehoert
   * an die hoechste Rolle.
   */
  @Rollen(Role.OWNER)
  @Patch('members/:userId')
  async aendereRolle(
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('userId', new ZodValidationPipe(nutzerIdSchema))
    zielNutzerId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    daten: UpdateMemberRoleDto,
  ): Promise<Mitglied> {
    return this.organizations.aendereRolle(
      mitgliedschaft.organizationId,
      zielNutzerId,
      daten,
    );
  }

  /**
   * DELETE /organizations/:orgId/members/:userId
   *
   * Entfernt ein Mitglied. Mit der eigenen ID aufgerufen bedeutet das
   * "Organisation verlassen" - derselbe Endpoint, kein eigener.
   *
   * ==========================================================================
   * WARUM HIER KEIN @Rollen() STEHT
   * ==========================================================================
   * Weil die Antwort davon abhaengt, WEN es trifft: sich selbst darf jeder
   * entfernen, andere nur OWNER und ADMIN, einen OWNER nur ein OWNER.
   *
   * Ein Guard kennt die Zielressource nicht - er weiss, wer anfragt, aber
   * nicht, wen es betrifft. Ein @Rollen(OWNER, ADMIN) wuerde einen MEMBER
   * abweisen, bevor klar ist, dass er nur sich selbst meint.
   *
   * Faustregel: Ein Guard entscheidet ueber den ZUGANG, nicht ueber den
   * EINZELFALL. Die Pruefung liegt deshalb im Service.
   *
   * 204 No Content: erfolgreich, nichts zurueckzugeben. Ein leeres Objekt mit
   * 200 waere eine Behauptung ueber Inhalt, den es nicht gibt.
   */
  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async entferneMitglied(
    @AktuellerNutzer() nutzer: AngemeldeterNutzer,
    @AktuelleMitgliedschaft() mitgliedschaft: AktiveMitgliedschaft,
    @Param('userId', new ZodValidationPipe(nutzerIdSchema))
    zielNutzerId: string,
  ): Promise<void> {
    return this.organizations.entferneMitglied(
      mitgliedschaft.organizationId,
      nutzer.id,
      mitgliedschaft.role,
      zielNutzerId,
    );
  }
}
