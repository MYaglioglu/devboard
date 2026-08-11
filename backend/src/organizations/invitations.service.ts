import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
} from './dto/create-invitation.dto';

/** Wie lange eine Einladung gueltig bleibt. */
const GUELTIGKEIT_TAGE = 7;

/**
 * Eine Einladung, wie die Verwaltungsansicht sie sieht.
 *
 * Der Token fehlt hier ABSICHTLICH - er existiert nur ein einziges Mal, in der
 * Antwort auf das Anlegen. Wer ihn spaeter noch einmal braeuchte, muesste neu
 * einladen. Ein eigener Typ macht das zur Compiler-Regel statt zur Absicht:
 * Wer den Token nachtraeglich herausgeben wollte, muesste diesen Typ aendern
 * und faellt damit im Review auf. Dasselbe Muster wie `OeffentlicherNutzer`
 * beim Passwort-Hash.
 */
export interface OffeneEinladung {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}

/** Antwort auf das Anlegen - das EINZIGE Mal, dass der Token sichtbar ist. */
export interface AusgestellteEinladung extends OffeneEinladung {
  /**
   * Der Rohwert. In einer Anwendung mit E-Mail-Versand wuerde er hier NICHT
   * zurueckgegeben, sondern ausschliesslich verschickt - der Einladende
   * bekaeme ihn nie zu sehen und koennte die Einladung nicht selbst einloesen.
   *
   * Solange DevBoard keine E-Mails versendet, waere die Einladung sonst
   * unbenutzbar. Die Abweichung steht ausdruecklich in 10_SECURITY.md, damit
   * sie nicht als Versehen durchgeht.
   */
  token: string;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Spricht eine Einladung aus.
   *
   * ==========================================================================
   * WARUM NICHT GEPRUEFT WIRD, OB ES DAS KONTO SCHON GIBT
   * ==========================================================================
   * Naheliegend waere: Nutzer vorhanden? Dann direkt als Mitglied eintragen,
   * sonst einladen. Das waere bequemer fuer den Eingeladenen - und ein
   * Informationsleck.
   *
   * Die beiden Wege haetten unterschiedliche Antworten ("hinzugefuegt" vs.
   * "eingeladen"), und damit haette jeder ADMIN einen Dienst, mit dem er
   * beliebige Adressen darauf pruefen kann, ob sie bei DevBoard ein Konto
   * haben. Das ist USER ENUMERATION, dieselbe Klasse wie unterschiedliche
   * Login-Fehlermeldungen.
   *
   * Deshalb: IMMER eine Einladung, immer dieselbe Antwort. Der Preis ist ein
   * zusaetzlicher Klick fuer bestehende Nutzer.
   */
  async lade(
    organizationId: string,
    einladenderId: string,
    einladenderRolle: Role,
    daten: CreateInvitationDto,
  ): Promise<AusgestellteEinladung> {
    // Ein ADMIN darf nur MEMBER einladen. Sonst koennte er ueber den Umweg
    // der Einladung weitere ADMIN erzeugen - also Rechte vergeben, die zu
    // vergeben ihm nicht zusteht. Dass ueberhaupt nur OWNER und ADMIN hier
    // ankommen, hat der @Rollen()-Decorator sichergestellt; diese Feinheit
    // haengt an der ZIELROLLE und gehoert deshalb in den Service.
    if (einladenderRolle === Role.ADMIN && daten.role !== Role.MEMBER) {
      throw new ForbiddenException('Als ADMIN können Sie nur MEMBER einladen');
    }

    const rohToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000,
    );

    // Beides zusammen oder gar nicht: Entwerten der alten Einladungen und
    // Anlegen der neuen. Bliebe das Entwerten allein stehen, haette der
    // Eingeladene ploetzlich gar keine gueltige Einladung mehr; bliebe das
    // Anlegen allein, gaebe es zwei.
    const einladung = await this.prisma.$transaction(async (tx) => {
      // Ersetzt statt verboten: Ein erneutes Einladen ist eine normale
      // Handlung ("die erste ist im Spam gelandet") und soll nicht mit 409
      // scheitern. Sauberer waere ein PARTIELLER Unique-Index
      // (organizationId, email) WHERE offen - den kann Prisma nicht
      // deklarieren, siehe 06_BACKLOG.md. Bis dahin setzt der Service die
      // Regel durch, und die Transaktion haelt sie zusammen.
      await tx.invitation.updateMany({
        where: {
          organizationId,
          email: daten.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      return tx.invitation.create({
        data: {
          organizationId,
          email: daten.email,
          role: daten.role,
          tokenHash: this.hashe(rohToken),
          invitedById: einladenderId,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    });

    // Ohne die Adresse: Logs werden weitergeleitet, durchsucht und aufbewahrt.
    // Dieselbe Regel wie im AuthService.
    this.logger.log(
      `Einladung ausgesprochen in ${organizationId} durch ${einladenderId}`,
    );

    return { ...einladung, token: rohToken };
  }

  /**
   * Listet die offenen Einladungen einer Organisation.
   *
   * "Offen" heisst: weder eingeloest noch zurueckgezogen noch abgelaufen.
   * Abgelaufene werden hier gefiltert und nicht geloescht - eine Zeile, die
   * belegt, dass eingeladen wurde, ist nachtraeglich nuetzlich.
   */
  async findeOffene(organizationId: string): Promise<OffeneEinladung[]> {
    return this.prisma.invitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Zieht eine Einladung zurueck. */
  async ziehZurueck(
    organizationId: string,
    einladungId: string,
  ): Promise<void> {
    // `updateMany` mit BEIDEN Bedingungen statt `update` auf der ID allein:
    // Sonst koennte ein ADMIN die Einladung einer FREMDEN Organisation
    // zurueckziehen, wenn er deren ID kennt. Der Guard hat nur geprueft, dass
    // er in SEINER Organisation etwas darf - nicht, dass diese Einladung dazu
    // gehoert.
    //
    // Das ist der vergessene Mandantenfilter in seiner typischsten Form: Die
    // ID im Pfad gehoert nicht automatisch zu der Organisation im Pfad.
    const ergebnis = await this.prisma.invitation.updateMany({
      where: { id: einladungId, organizationId, acceptedAt: null },
      data: { revokedAt: new Date() },
    });

    if (ergebnis.count === 0) {
      throw new NotFoundException('Einladung nicht gefunden');
    }
  }

  /**
   * Loest eine Einladung ein.
   *
   * ==========================================================================
   * WARUM DIE ADRESSE UEBEREINSTIMMEN MUSS
   * ==========================================================================
   * Der Token allein reicht nicht - der Anmeldende muss dieselbe Adresse
   * haben, an die eingeladen wurde.
   *
   * Die Alternative waere "wer den Link hat, ist drin", wie bei vielen
   * Produkten. Bequemer, aber dann ist ein weitergeleiteter Link ein Zugang:
   * Eine Einladung, die versehentlich in einem geteilten Postfach oder einem
   * Chat landet, oeffnet die Organisation fuer jeden, der mitliest.
   *
   * Mit der Bindung an die Adresse braucht ein Angreifer BEIDES - den Token
   * und Zugriff auf das Konto mit dieser Adresse. Der Preis: Wer sich mit
   * einer anderen Adresse registriert hat als der, an die eingeladen wurde,
   * kommt nicht hinein und muss neu eingeladen werden.
   */
  async nimmAn(
    nutzerId: string,
    nutzerEmail: string,
    daten: AcceptInvitationDto,
  ): Promise<{ organizationId: string; role: Role }> {
    const einladung = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hashe(daten.token) },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    // Bewusst dieselbe Meldung fuer "gibt es nicht", "schon eingeloest" und
    // "zurueckgezogen". Ein Angreifer, der Token durchprobiert, soll nicht
    // erfahren, ob er nur zu spaet war - das waere die Auskunft, dass dieser
    // Token einmal echt war. Dasselbe Prinzip wie bei der einheitlichen
    // Login-Fehlermeldung.
    if (!einladung || einladung.acceptedAt || einladung.revokedAt) {
      throw new NotFoundException('Einladung ungültig');
    }

    if (einladung.expiresAt <= new Date()) {
      // Der Ablauf bekommt eine EIGENE Meldung, und das ist Absicht: Wer eine
      // echte, abgelaufene Einladung in der Hand haelt, kennt sie ohnehin -
      // ihm ist mit "ungueltig" nicht geholfen, er soll um eine neue bitten.
      // Verraten wird dabei nichts, was er nicht schon weiss.
      throw new BadRequestException(
        'Diese Einladung ist abgelaufen. Bitten Sie um eine neue.',
      );
    }

    if (einladung.email !== nutzerEmail) {
      throw new ForbiddenException(
        'Diese Einladung ist an eine andere E-Mail-Adresse gerichtet',
      );
    }

    // Wieder beides zusammen oder gar nicht: Mitgliedschaft anlegen und
    // Einladung entwerten. Bliebe das Entwerten aus, waere der Token ein
    // zweites Mal einloesbar; bliebe die Mitgliedschaft aus, waere die
    // Einladung verbraucht, ohne dass jemand beigetreten ist.
    return this.prisma.$transaction(async (tx) => {
      const bereitsMitglied = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: einladung.organizationId,
            userId: nutzerId,
          },
        },
        select: { role: true },
      });

      if (bereitsMitglied) {
        // 409 Conflict: Die Anfrage ist in Ordnung, sie widerspricht nur dem
        // aktuellen Zustand. Wichtig ist vor allem, was hier NICHT passiert -
        // die bestehende Rolle wird nicht ueberschrieben. Sonst koennte ein
        // ADMIN einen OWNER als MEMBER einladen und ihn damit herabstufen.
        throw new ConflictException(
          'Sie sind bereits Mitglied dieser Organisation',
        );
      }

      await tx.membership.create({
        data: {
          organizationId: einladung.organizationId,
          userId: nutzerId,
          role: einladung.role,
        },
      });

      await tx.invitation.update({
        where: { id: einladung.id },
        data: { acceptedAt: new Date() },
      });

      this.logger.log(
        `Einladung eingeloest: ${nutzerId} tritt ${einladung.organizationId} bei`,
      );

      return { organizationId: einladung.organizationId, role: einladung.role };
    });
  }

  /**
   * SHA-256 des Tokens.
   *
   * Kein argon2: Der Token besteht aus 256 Bit Zufall und ist kein erratbares
   * Passwort - gegen Durchprobieren muss nichts gebremst werden. Bei
   * Passwoertern ist es genau umgekehrt. Dieselbe Abwaegung wie beim
   * Refresh-Token.
   */
  private hashe(rohToken: string): string {
    return createHash('sha256').update(rohToken).digest('hex');
  }
}
