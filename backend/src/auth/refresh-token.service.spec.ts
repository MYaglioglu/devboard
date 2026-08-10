import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';

interface TokenZeile {
  id: string;
  tokenHash: string;
  familyId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const hashe = (t: string) => createHash('sha256').update(t).digest('hex');

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const findUnique = jest.fn<Promise<TokenZeile | null>, [unknown]>();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const update = jest.fn<Promise<unknown>, [unknown]>();
  const updateMany = jest.fn<Promise<unknown>, [unknown]>();

  const refreshToken = { findUnique, create, update, updateMany };

  // `$transaction` bekommt eine Rueckruffunktion und ruft sie mit einem
  // Transaktions-Client auf. Fuer den Test genuegt derselbe Attrappen-Client.
  const $transaction = jest.fn(
    async (
      cb: (tx: { refreshToken: typeof refreshToken }) => Promise<unknown>,
    ) => cb({ refreshToken }),
  );

  beforeEach(async () => {
    [findUnique, create, update, updateMany, $transaction].forEach((m) =>
      m.mockReset(),
    );
    create.mockResolvedValue({});
    update.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 1 });
    $transaction.mockImplementation(
      async (
        cb: (tx: { refreshToken: typeof refreshToken }) => Promise<unknown>,
      ) => cb({ refreshToken }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: PrismaService,
          useValue: { refreshToken, $transaction },
        },
        { provide: ConfigService, useValue: { get: () => 30 } },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
  });

  const gueltigeZeile = (
    ueberschreibe: Partial<TokenZeile> = {},
  ): TokenZeile => ({
    id: 'token-1',
    tokenHash: hashe('roher-token'),
    familyId: 'familie-1',
    userId: 'nutzer-1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...ueberschreibe,
  });

  describe('erstelleNeueFamilie', () => {
    it('speichert nur den Hash, niemals den Token selbst', async () => {
      const ergebnis = await service.erstelleNeueFamilie('nutzer-1');

      const gespeichert = create.mock.calls[0][0] as {
        data: { tokenHash: string };
      };

      expect(gespeichert.data.tokenHash).toBe(hashe(ergebnis.token));
      expect(gespeichert.data.tokenHash).not.toBe(ergebnis.token);
    });

    it('erzeugt bei jedem Aufruf einen anderen Token', async () => {
      const a = await service.erstelleNeueFamilie('nutzer-1');
      const b = await service.erstelleNeueFamilie('nutzer-1');

      expect(a.token).not.toBe(b.token);
    });

    it('erzeugt einen Token mit ausreichend Zufall', async () => {
      const { token } = await service.erstelleNeueFamilie('nutzer-1');

      // 32 Byte base64url-kodiert ergeben 43 Zeichen. Kuerzer waere ratbar.
      expect(token.length).toBeGreaterThanOrEqual(43);
    });

    it('setzt die Ablaufzeit auf 30 Tage', async () => {
      const { expiresAt } = await service.erstelleNeueFamilie('nutzer-1');
      const tage = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

      expect(Math.round(tage)).toBe(30);
    });
  });

  describe('rotiere', () => {
    it('entwertet den alten Token und stellt einen neuen aus', async () => {
      findUnique.mockResolvedValue(gueltigeZeile());

      const neu = await service.rotiere('roher-token');

      // Alter Token: revokedAt gesetzt.
      const entwertet = update.mock.calls[0][0] as {
        data: { revokedAt: Date };
      };
      expect(entwertet.data.revokedAt).toBeInstanceOf(Date);

      // Neuer Token existiert und ist ein anderer.
      expect(neu.token).not.toBe('roher-token');
    });

    it('behaelt die Familie bei', async () => {
      findUnique.mockResolvedValue(gueltigeZeile());

      await service.rotiere('roher-token');

      const angelegt = create.mock.calls[0][0] as {
        data: { familyId: string };
      };

      // Nur so laesst sich spaeter die gesamte Kette widerrufen.
      expect(angelegt.data.familyId).toBe('familie-1');
    });

    it('laeuft in einer Transaktion', async () => {
      findUnique.mockResolvedValue(gueltigeZeile());

      await service.rotiere('roher-token');

      // Ohne Transaktion koennte der alte Token entwertet sein, waehrend das
      // Anlegen des neuen scheitert - der Nutzer waere ohne eigenes Zutun
      // ausgesperrt.
      expect($transaction).toHaveBeenCalledTimes(1);
    });

    it('lehnt einen unbekannten Token ab', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.rotiere('unbekannt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lehnt einen abgelaufenen Token ab', async () => {
      findUnique.mockResolvedValue(
        gueltigeZeile({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotiere('roher-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    // ========================================================================
    // Die wichtigsten Tests des ganzen Sprints.
    // ========================================================================
    describe('Wiederverwendungs-Erkennung', () => {
      it('lehnt einen bereits entwerteten Token ab', async () => {
        findUnique.mockResolvedValue(
          gueltigeZeile({ revokedAt: new Date(Date.now() - 5000) }),
        );

        await expect(service.rotiere('roher-token')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      });

      it('widerruft dabei die GESAMTE Familie', async () => {
        findUnique.mockResolvedValue(
          gueltigeZeile({ revokedAt: new Date(Date.now() - 5000) }),
        );

        await service.rotiere('roher-token').catch(() => undefined);

        const widerruf = updateMany.mock.calls[0][0] as {
          where: { familyId: string; revokedAt: null };
          data: { revokedAt: Date };
        };

        // Ein erneut vorgelegter, verbrauchter Token bedeutet entweder einen
        // abgebrochenen Versuch oder einen Diebstahl. Da beides nicht
        // unterscheidbar ist, wird der schlimmere Fall angenommen: Angreifer
        // UND rechtmaessiger Nutzer fliegen raus. Der Nutzer meldet sich neu
        // an, der Angreifer kann das nicht.
        expect(widerruf.where.familyId).toBe('familie-1');
        expect(widerruf.where.revokedAt).toBeNull();
        expect(widerruf.data.revokedAt).toBeInstanceOf(Date);
      });

      it('stellt bei Wiederverwendung KEINEN neuen Token aus', async () => {
        findUnique.mockResolvedValue(
          gueltigeZeile({ revokedAt: new Date(Date.now() - 5000) }),
        );

        await service.rotiere('roher-token').catch(() => undefined);

        expect(create).not.toHaveBeenCalled();
      });

      it('meldet Wiederverwendung und unbekannten Token identisch', async () => {
        findUnique.mockResolvedValue(null);
        const unbekannt = await service
          .rotiere('roher-token')
          .catch((e: Error) => e);

        findUnique.mockResolvedValue(
          gueltigeZeile({ revokedAt: new Date(Date.now() - 5000) }),
        );
        const wiederverwendet = await service
          .rotiere('roher-token')
          .catch((e: Error) => e);

        // Ein Angreifer soll nicht erkennen koennen, ob sein Token einmal
        // gueltig war.
        expect(unbekannt.message).toBe(wiederverwendet.message);
      });
    });
  });

  describe('beendeSitzung', () => {
    it('widerruft die gesamte Familie', async () => {
      findUnique.mockResolvedValue(gueltigeZeile());

      await service.beendeSitzung('roher-token');

      const widerruf = updateMany.mock.calls[0][0] as {
        where: { familyId: string };
      };

      // Nicht nur den einen Token: Sonst bliebe ein zuvor rotierter Token
      // gueltig, den ein Angreifer abgegriffen haben koennte.
      expect(widerruf.where.familyId).toBe('familie-1');
    });

    it('wirft nicht, wenn gar kein Token vorliegt', async () => {
      await expect(service.beendeSitzung(undefined)).resolves.toBeUndefined();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('wirft nicht bei unbekanntem Token', async () => {
      findUnique.mockResolvedValue(null);

      // Ein Logout soll immer gelingen - alles andere waere fuer Nutzer
      // unverstaendlich und wuerde verraten, ob der Token gueltig war.
      await expect(service.beendeSitzung('unbekannt')).resolves.toBeUndefined();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });
});
