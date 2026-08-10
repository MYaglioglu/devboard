import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env.schema';

/** Ein frisch ausgestellter Refresh-Token samt Ablaufzeitpunkt. */
export interface AusgestellterToken {
  /** Der Rohwert - geht NUR in das Cookie, nie in die Datenbank. */
  token: string;
  expiresAt: Date;
  userId: string;
}

/**
 * Verwaltung der Refresh-Token.
 *
 * ============================================================================
 * WARUM ES DIESEN TOKEN UEBERHAUPT GIBT
 * ============================================================================
 * Der Access-Token ist zustandslos: Der Server speichert ihn nicht, er prueft
 * nur die Signatur. Das macht ihn schnell und gut skalierbar - aber
 * unwiderrufbar. Ein gestohlener Access-Token gilt bis zu seinem Ablauf.
 *
 * Deshalb ist er kurzlebig (15 Minuten). Damit sich niemand alle 15 Minuten
 * neu anmelden muss, gibt es den Refresh-Token: langlebig, dafuer
 * SERVERSEITIG GESPEICHERT - und damit widerrufbar. Erst dadurch wirkt ein
 * Logout wirklich.
 *
 * ============================================================================
 * ROTATION
 * ============================================================================
 * Bei jedem Erneuern wird der benutzte Token entwertet und ein neuer
 * ausgestellt. Ein Refresh-Token ist also ein EINMAL-Token.
 *
 * Der Nutzen zeigt sich erst mit dem naechsten Punkt.
 *
 * ============================================================================
 * WIEDERVERWENDUNGS-ERKENNUNG - der eigentliche Trick
 * ============================================================================
 * Wird ein bereits entwerteter Token noch einmal vorgelegt, gibt es genau
 * zwei Erklaerungen:
 *
 *   a) ein Netzwerkfehler beim letzten Erneuern, oder
 *   b) jemand hat den Token gestohlen und benutzt ihn parallel.
 *
 * Wir koennen die Faelle nicht unterscheiden - also behandeln wir sie wie den
 * schlimmeren. Alle Token derselben FAMILIE (alle, die durch Rotation
 * auseinander hervorgegangen sind) werden widerrufen. Angreifer UND
 * rechtmaessiger Nutzer fliegen raus; der Nutzer meldet sich neu an, der
 * Angreifer kann das nicht.
 *
 * Deshalb werden entwertete Token NICHT geloescht: Nur eine aufbewahrte,
 * entwertete Zeile erlaubt es, die Wiederverwendung ueberhaupt zu bemerken.
 *
 * ============================================================================
 * WARUM NUR DER HASH GESPEICHERT WIRD
 * ============================================================================
 * Wie bei Passwoertern: Bei einem Datenbankleck waeren gespeicherte Rohwerte
 * sofort verwendbare Sitzungen.
 *
 * Hier genuegt SHA-256 statt argon2 - der Token besteht aus 256 Bit Zufall
 * und ist kein erratbares Passwort. Gegen Durchprobieren muss nichts gebremst
 * werden, und Geschwindigkeit ist erwuenscht, weil bei jedem Erneuern
 * geprueft wird.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Stellt einen Token fuer eine NEUE Familie aus - beim Login.
   */
  async erstelleNeueFamilie(userId: string): Promise<AusgestellterToken> {
    return this.erstelle(userId, randomUUID());
  }

  /**
   * Loest einen Token gegen einen neuen ein (Rotation).
   *
   * Wirft `UnauthorizedException`, wenn der Token unbekannt, abgelaufen oder
   * bereits entwertet ist. Im letzten Fall wird zusaetzlich die ganze Familie
   * widerrufen.
   */
  async rotiere(rohToken: string): Promise<AusgestellterToken> {
    const vorhanden = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashe(rohToken) },
    });

    if (!vorhanden) {
      throw new UnauthorizedException('Sitzung ungueltig');
    }

    if (vorhanden.revokedAt !== null) {
      // WIEDERVERWENDUNG. Entweder Diebstahl oder ein abgebrochener Versuch -
      // beides wird gleich behandelt, weil wir es nicht unterscheiden koennen.
      this.logger.warn(
        `Wiederverwendeter Refresh-Token erkannt, Familie ${vorhanden.familyId} wird widerrufen`,
      );
      await this.widerrufeFamilie(vorhanden.familyId);
      throw new UnauthorizedException('Sitzung ungueltig');
    }

    if (vorhanden.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sitzung abgelaufen');
    }

    // Entwerten und neuen Token derselben Familie ausstellen - in EINER
    // Transaktion. Ohne sie koennte der alte Token entwertet sein, waehrend
    // das Anlegen des neuen scheitert: Der Nutzer waere ohne eigenes
    // Zutun ausgesperrt.
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: vorhanden.id },
        data: { revokedAt: new Date() },
      });

      const { token, tokenHash, expiresAt } = this.erzeugeWerte();

      await tx.refreshToken.create({
        data: {
          tokenHash,
          familyId: vorhanden.familyId,
          userId: vorhanden.userId,
          expiresAt,
        },
      });

      return { token, expiresAt, userId: vorhanden.userId };
    });
  }

  /**
   * Beendet die Sitzung, zu der dieser Token gehoert (Logout).
   *
   * Widerrufen wird die ganze Familie, nicht nur der eine Token: Sonst
   * bliebe ein zuvor rotierter Token gueltig, den ein Angreifer eventuell
   * abgegriffen hat.
   *
   * Ein unbekannter Token fuehrt NICHT zu einem Fehler. Ein Logout soll immer
   * gelingen - alles andere waere fuer Nutzer unverstaendlich und wuerde
   * ausserdem verraten, ob ein Token gueltig war.
   */
  async beendeSitzung(rohToken: string | undefined): Promise<void> {
    if (!rohToken) return;

    const vorhanden = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashe(rohToken) },
      select: { familyId: true },
    });

    if (vorhanden) {
      await this.widerrufeFamilie(vorhanden.familyId);
    }
  }

  /** Widerruft alle noch gueltigen Token einer Familie. */
  private async widerrufeFamilie(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async erstelle(
    userId: string,
    familyId: string,
  ): Promise<AusgestellterToken> {
    const { token, tokenHash, expiresAt } = this.erzeugeWerte();

    await this.prisma.refreshToken.create({
      data: { tokenHash, familyId, userId, expiresAt },
    });

    return { token, expiresAt, userId };
  }

  private erzeugeWerte(): {
    token: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    // `randomBytes` ist kryptografisch sicher. `Math.random()` waere hier ein
    // schwerer Fehler: Es ist vorhersagbar und nicht fuer Geheimnisse gedacht.
    const token = randomBytes(32).toString('base64url');

    const tage = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);

    return { token, tokenHash: this.hashe(token), expiresAt };
  }

  private hashe(rohToken: string): string {
    return createHash('sha256').update(rohToken).digest('hex');
  }
}
