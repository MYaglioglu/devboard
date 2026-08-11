import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type {
  AktiveMitgliedschaft,
  AnfrageMitMitgliedschaft,
} from '../guards/membership.guard';

/**
 * Liefert die vom MitgliedschaftsGuard gepruefte Mitgliedschaft.
 *
 *     @Get(':orgId')
 *     zeige(@AktuelleMitgliedschaft() m: AktiveMitgliedschaft) { ... }
 *
 * ============================================================================
 * WARUM DER CONTROLLER SIE NICHT SELBST LAEDT
 * ============================================================================
 * Der offensichtliche Grund ist die gesparte Abfrage. Der wichtigere ist ein
 * anderer: Laedt der Controller die Mitgliedschaft noch einmal, koennte er
 * eine ANDERE laden als die, die geprueft wurde - ein anderer Parameter, eine
 * andere Nutzer-ID, ein Tippfehler. Dann prueft der Guard das eine und der
 * Controller arbeitet mit dem anderen.
 *
 * Geprueft und benutzt muss dasselbe Objekt sein. Deshalb reicht der Guard
 * sein Ergebnis weiter, statt den Controller noch einmal fragen zu lassen.
 *
 * Der Typ ist bewusst `| undefined`: Auf einer Route ohne :orgId laeuft die
 * Pruefung nicht, und dann gibt es nichts zurueckzugeben. Wer den Decorator
 * dort versehentlich benutzt, soll das am Typ sehen statt spaeter an einem
 * Laufzeitfehler.
 */
export const AktuelleMitgliedschaft = createParamDecorator(
  (
    _daten: unknown,
    context: ExecutionContext,
  ): AktiveMitgliedschaft | undefined =>
    context.switchToHttp().getRequest<AnfrageMitMitgliedschaft>()
      .mitgliedschaft,
);
