import { SetMetadata } from '@nestjs/common';

import { Role } from '../../generated/prisma/enums';

export const ERLAUBTE_ROLLEN = 'erlaubteRollen';

/**
 * Schraenkt einen Endpoint auf bestimmte Rollen INNERHALB der Organisation ein.
 *
 *     @Rollen(Role.OWNER, Role.ADMIN)
 *     @Patch(':orgId')
 *     benenneUm(...) { ... }
 *
 * ============================================================================
 * WARUM EINE LISTE UND KEINE RANGORDNUNG
 * ============================================================================
 * Verlockend waere eine Hierarchie: OWNER > ADMIN > MEMBER, und der Guard
 * prueft `rolle >= mindestRolle`. Zwei Gruende dagegen.
 *
 * Erstens technisch: Ein Enum ist keine Zahl. `Role.OWNER <= Role.ADMIN` waere
 * ein Vergleich zweier Zeichenketten - "OWNER" <= "ADMIN" ist alphabetisch
 * FALSCH, und der Code waere still kaputt. Mit numerischen Werten liesse es
 * sich erzwingen, aber dann bricht die Ordnung, sobald jemand einen Wert
 * dazwischenschiebt.
 *
 * Zweitens fachlich: Rechte sind selten eine saubere Kette. "Wer darf die
 * Organisation loeschen?" - nur OWNER, auch wenn ADMIN sonst mehr darf als
 * MEMBER. "Wer darf sich selbst entfernen?" - jeder, auch MEMBER. Eine
 * Rangordnung suggeriert eine Ordnung, die es gar nicht gibt.
 *
 * Eine ausdrueckliche Liste zwingt dazu, bei jedem Endpoint zu ENTSCHEIDEN,
 * statt eine Grenze zu verschieben. Sie ist laenger zu tippen und im Review
 * leichter zu pruefen.
 *
 * ============================================================================
 * OHNE DIESEN DECORATOR
 * ============================================================================
 * ...ist der Endpoint fuer JEDES Mitglied erreichbar - aber eben nur fuer
 * Mitglieder. Der MitgliedschaftsGuard laeuft ohnehin; dieser Decorator
 * verschaerft nur zusaetzlich. Das ist die richtige Grundeinstellung: Der
 * Mandantenschutz ist nie optional, die Rollenpruefung ist es.
 */
export const Rollen = (...rollen: Role[]) =>
  SetMetadata(ERLAUBTE_ROLLEN, rollen);
