import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type {
  AnfrageMitNutzer,
  AngemeldeterNutzer,
} from '../guards/access-token.guard';

/**
 * Liefert den angemeldeten Nutzer als Parameter im Controller.
 *
 *     @Get('me')
 *     profil(@AktuellerNutzer() nutzer: AngemeldeterNutzer) { ... }
 *
 * ============================================================================
 * WOZU EIN EIGENER DECORATOR?
 * ============================================================================
 * Ohne ihn stuende in jedem Controller:
 *
 *     @Req() anfrage: AnfrageMitNutzer
 *     const nutzer = anfrage.nutzer;
 *
 * Drei Nachteile: Der Controller kennt plotzlich das Express-Objekt (und ist
 * damit an HTTP gebunden), die Zeile wiederholt sich ueberall, und im Test
 * muesste man einen kompletten Request nachbauen statt nur ein Nutzerobjekt
 * zu uebergeben.
 *
 * ============================================================================
 * WARUM DER NICHT-NULL-ZUGRIFF HIER SICHER IST
 * ============================================================================
 * `nutzer` kann laut Typ `undefined` sein - gesetzt wird es erst vom Guard.
 * Da der Guard global laeuft und jede nicht als @Oeffentlich() markierte Route
 * schuetzt, ist der Wert hier immer vorhanden.
 *
 * Der Vollstaendigkeit halber wird der Fall trotzdem behandelt: Wer diesen
 * Decorator versehentlich in einer oeffentlichen Route benutzt, bekommt
 * `undefined` - und soll das am Typ sehen, statt spaeter an einem
 * Laufzeitfehler.
 */
export const AktuellerNutzer = createParamDecorator(
  (
    _daten: unknown,
    context: ExecutionContext,
  ): AngemeldeterNutzer | undefined =>
    context.switchToHttp().getRequest<AnfrageMitNutzer>().nutzer,
);
