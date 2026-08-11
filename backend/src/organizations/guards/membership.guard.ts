import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ERLAUBTE_ROLLEN } from '../decorators/roles.decorator';
import type { AnfrageMitNutzer } from '../../auth/guards/access-token.guard';

/**
 * Der Name des Route-Parameters, der die Organisation traegt.
 *
 * Als Konstante, weil Guard und Controller sich darauf EINIGEN muessen.
 * Schriebe ein Controller `:organizationId`, faende der Guard den Wert nicht -
 * und ein Guard, der seinen Parameter nicht findet, ist ein Guard, der nicht
 * schuetzt. Eine geteilte Konstante macht daraus einen Compilerfehler statt
 * eines stillen Lochs.
 */
export const ORG_PARAM = 'orgId';

/** Die Mitgliedschaft des Anfragenden in der angesprochenen Organisation. */
export interface AktiveMitgliedschaft {
  organizationId: string;
  role: Role;
}

/** Erweiterung des Request um die gepruefte Mitgliedschaft. */
export interface AnfrageMitMitgliedschaft extends AnfrageMitNutzer {
  mitgliedschaft?: AktiveMitgliedschaft;
}

/**
 * Prueft, ob der angemeldete Nutzer Mitglied der angesprochenen Organisation
 * ist - und ob seine Rolle ausreicht.
 *
 * ============================================================================
 * WARUM DIESER GUARD GLOBAL LAEUFT
 * ============================================================================
 * Dieselbe Begruendung wie beim AccessTokenGuard: Vergisst man ein
 * @UseGuards an einer Route, ist sie ungeschuetzt - und niemand merkt es,
 * weil alles funktioniert.
 *
 * Hier kommt ein Hebel dazu. Laut ADR-008 steht der Mandant IMMER als
 * `:orgId` im Pfad. Damit gilt:
 *
 *     Route hat :orgId  <=>  Route betrifft einen Mandanten
 *
 * Der Guard braucht also gar keine Markierung, an die man sich erinnern
 * muesste. Er prueft: Gibt es diesen Parameter? Dann muss die Mitgliedschaft
 * stimmen. Vergessen kann man ihn nicht, denn ohne den Parameter funktioniert
 * die Route ueberhaupt nicht.
 *
 * Der Preis ist, dass die Pruefung an der Route nicht sichtbar ist. Deshalb
 * steht sie hier ausfuehrlich und im AppModule bei der Registrierung.
 *
 * ============================================================================
 * 404 STATT 403 BEI EINER FREMDEN ORGANISATION
 * ============================================================================
 * Der Guard unterscheidet ABSICHTLICH nicht zwischen
 *
 *   "diese Organisation existiert nicht"  und
 *   "du bist kein Mitglied"
 *
 * Beides ist derselbe Zustand: FUER DICH existiert sie nicht.
 *
 * Ein 403 wuerde bestaetigen, dass es eine Organisation mit dieser ID gibt.
 * Damit koennte jemand IDs durchprobieren und herausfinden, welche existieren
 * - bei UUIDs muehsam, aber es ist trotzdem eine Auskunft, die niemand
 * bekommen muss. Dieselbe Ueberlegung wie bei der einheitlichen
 * Login-Fehlermeldung.
 *
 * 403 bleibt dem Fall vorbehalten, in dem die Mitgliedschaft STEHT und nur
 * die Rolle nicht reicht. Dann weiss der Anfragende ohnehin, dass es die
 * Organisation gibt - es gibt nichts mehr zu verbergen.
 */
@Injectable()
export class MitgliedschaftsGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const anfrage = context
      .switchToHttp()
      .getRequest<AnfrageMitMitgliedschaft>();

    const parameter = anfrage.params as Record<string, string | undefined>;
    const orgId = parameter[ORG_PARAM];

    // Keine :orgId in der Route - diese Route betrifft keinen Mandanten
    // (z. B. POST /organizations oder GET /auth/me). Nichts zu pruefen.
    if (!orgId) {
      return true;
    }

    // Der AccessTokenGuard laeuft VOR diesem hier und haette schon mit 401
    // abgewiesen. Faehlt der Nutzer trotzdem, ist die Guard-Reihenfolge im
    // AppModule falsch - ein Programmierfehler, kein Nutzerfehler.
    const nutzer = anfrage.nutzer;
    if (!nutzer) {
      throw new Error(
        'MitgliedschaftsGuard laeuft ohne angemeldeten Nutzer - ' +
          'steht er im AppModule vor dem AccessTokenGuard?',
      );
    }

    // ========================================================================
    // DIE ABFRAGE, UM DIE ES GEHT
    // ========================================================================
    // BEIDE Bedingungen stehen im `where`. Nicht: Mitgliedschaft ueber die
    // organizationId laden und danach den Nutzer vergleichen - dann waeren
    // die fremden Daten bereits gelesen, und aus einem spaeteren `select`
    // mehr wuerde still ein Leck.
    //
    // Das ist zugleich der Zugriff, fuer den das UNIQUE (organizationId,
    // userId) existiert: eine Abfrage auf beide Spalten, also ein exakter
    // Treffer im Index statt eines Scans.
    const mitgliedschaft = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: nutzer.id,
        },
      },
      select: { organizationId: true, role: true },
    });

    if (!mitgliedschaft) {
      // Bewusst 404 und bewusst dieselbe Meldung, egal ob die Organisation
      // fehlt oder die Mitgliedschaft - siehe Kommentar oben.
      throw new NotFoundException('Organisation nicht gefunden');
    }

    const erlaubteRollen = this.reflector.getAllAndOverride<Role[]>(
      ERLAUBTE_ROLLEN,
      [context.getHandler(), context.getClass()],
    );

    // Ohne @Rollen() ist der Endpoint fuer jedes Mitglied offen. Der
    // Mandantenschutz oben ist nie optional, die Rollenpruefung schon.
    if (erlaubteRollen && !erlaubteRollen.includes(mitgliedschaft.role)) {
      // Hier ist 403 richtig: Die Mitgliedschaft steht, es gibt nichts mehr
      // zu verbergen. Die Meldung darf konkret sein - sie hilft beim
      // Verstehen und verraet nichts, was der Anfragende nicht schon weiss.
      throw new ForbiddenException(
        `Diese Aktion erfordert eine der Rollen: ${erlaubteRollen.join(', ')}`,
      );
    }

    // Ab hier steht die gepruefte Mitgliedschaft jedem Controller zur
    // Verfuegung - ohne dass dieser sie noch einmal laden muesste. Das spart
    // nicht nur eine Abfrage, es verhindert vor allem, dass der Controller
    // eine ANDERE Mitgliedschaft laedt als die, die geprueft wurde.
    anfrage.mitgliedschaft = {
      organizationId: mitgliedschaft.organizationId,
      role: mitgliedschaft.role,
    };

    return true;
  }
}
