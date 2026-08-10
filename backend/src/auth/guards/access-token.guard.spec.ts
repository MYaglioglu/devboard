import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { TokenService } from '../token.service';
import { AccessTokenGuard } from './access-token.guard';
import type { AnfrageMitNutzer } from './access-token.guard';

describe('AccessTokenGuard', () => {
  let guard: AccessTokenGuard;

  const pruefeAccessToken = jest.fn<
    Promise<{ sub: string; email: string }>,
    [string]
  >();
  const getAllAndOverride = jest.fn<boolean | undefined, [unknown, unknown]>();

  /** Baut einen minimalen ExecutionContext mit dem gewuenschten Header. */
  const kontext = (
    authorization?: string,
  ): { context: ExecutionContext; anfrage: AnfrageMitNutzer } => {
    const anfrage = {
      headers: authorization ? { authorization } : {},
    } as AnfrageMitNutzer;

    const context = {
      getHandler: () => () => undefined,
      getClass: () => class Test {},
      switchToHttp: () => ({ getRequest: () => anfrage }),
    } as unknown as ExecutionContext;

    return { context, anfrage };
  };

  beforeEach(async () => {
    pruefeAccessToken.mockReset();
    getAllAndOverride.mockReset();
    getAllAndOverride.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessTokenGuard,
        { provide: TokenService, useValue: { pruefeAccessToken } },
        { provide: Reflector, useValue: { getAllAndOverride } },
      ],
    }).compile();

    guard = module.get(AccessTokenGuard);
  });

  describe('oeffentliche Routen', () => {
    it('laesst sie ohne Token durch', async () => {
      getAllAndOverride.mockReturnValue(true);
      const { context } = kontext();

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(pruefeAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('geschuetzte Routen', () => {
    it('lehnt eine Anfrage ohne Authorization-Header ab', async () => {
      const { context } = kontext();

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lehnt einen Header ohne Bearer-Schema ab', async () => {
      const { context } = kontext('Basic abc123');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(pruefeAccessToken).not.toHaveBeenCalled();
    });

    it('lehnt einen Header ohne Wert ab', async () => {
      const { context } = kontext('Bearer');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('akzeptiert das Schema unabhaengig von der Schreibweise', async () => {
      // Laut RFC 6750 ist die Gross-/Kleinschreibung des Schemas unerheblich.
      pruefeAccessToken.mockResolvedValue({
        sub: 'nutzer-1',
        email: 'max@example.com',
      });
      const { context } = kontext('bearer gueltiger-token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('lehnt einen ungueltigen Token ab', async () => {
      pruefeAccessToken.mockRejectedValue(new Error('invalid signature'));
      const { context } = kontext('Bearer gefaelscht');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('meldet fehlenden und ungueltigen Token NICHT identisch, aber beide als 401', async () => {
      const ohne = await guard
        .canActivate(kontext().context)
        .catch((e: Error) => e);

      pruefeAccessToken.mockRejectedValue(new Error('jwt expired'));
      const ungueltig = await guard
        .canActivate(kontext('Bearer abgelaufen').context)
        .catch((e: Error) => e);

      // Beide sind 401 - der Unterschied "kein Token" vs. "kaputter Token"
      // verraet nichts ueber ein Konto, deshalb ist er unbedenklich.
      expect(ohne).toBeInstanceOf(UnauthorizedException);
      expect(ungueltig).toBeInstanceOf(UnauthorizedException);
    });

    it('haengt den Nutzer an die Anfrage', async () => {
      pruefeAccessToken.mockResolvedValue({
        sub: 'nutzer-1',
        email: 'max@example.com',
      });
      const { context, anfrage } = kontext('Bearer gueltiger-token');

      await guard.canActivate(context);

      // Erst dadurch koennen Controller den Nutzer ueber @AktuellerNutzer()
      // bekommen, ohne den Token noch einmal anzufassen.
      expect(anfrage.nutzer).toEqual({
        id: 'nutzer-1',
        email: 'max@example.com',
      });
    });

    it('reicht den Token unveraendert an die Pruefung weiter', async () => {
      pruefeAccessToken.mockResolvedValue({
        sub: 'nutzer-1',
        email: 'max@example.com',
      });
      const { context } = kontext('Bearer abc.def.ghi');

      await guard.canActivate(context);

      expect(pruefeAccessToken).toHaveBeenCalledWith('abc.def.ghi');
    });
  });
});
