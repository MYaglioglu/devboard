import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { MitgliedschaftsGuard } from './membership.guard';
import type { AnfrageMitMitgliedschaft } from './membership.guard';

describe('MitgliedschaftsGuard', () => {
  let guard: MitgliedschaftsGuard;
  let reflector: Reflector;

  const NUTZER_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
  const ORG_ID = 'b3f1c2d4-0000-4000-8000-0000000000aa';

  const findUnique = jest.fn<Promise<unknown>, [unknown]>();

  /** Ziele fuer den Reflector - siehe Kommentar in baueContext. */
  const HANDLER_ATTRAPPE = function handler(): void {};
  class KLASSEN_ATTRAPPE {}

  /**
   * Baut einen ExecutionContext nach.
   *
   * Nur so viel davon, wie der Guard tatsaechlich anfasst - `params`, `nutzer`
   * und die beiden Methoden fuer den Reflector. Ein vollstaendiger Request
   * waere aufwendig nachzubauen und wuerde den Test an Express binden, statt
   * an das, was hier geprueft wird.
   */
  const baueContext = (
    parameter: Record<string, string>,
    nutzer?: { id: string; email: string },
  ): { context: ExecutionContext; anfrage: AnfrageMitMitgliedschaft } => {
    const anfrage = {
      params: parameter,
      nutzer,
    } as unknown as AnfrageMitMitgliedschaft;

    const context = {
      switchToHttp: () => ({ getRequest: () => anfrage }),
      // Echte Objekte, keine `undefined`-Platzhalter: Der Reflector liest
      // ueber `Reflect.getMetadata`, und das braucht ein Ziel, an dem
      // Metadaten haengen KOENNTEN. Mit `undefined` wirft es einen TypeError -
      // ein Fehler im Test-Double, der wie ein Fehler im Guard aussieht.
      getHandler: () => HANDLER_ATTRAPPE,
      getClass: () => KLASSEN_ATTRAPPE,
    } as unknown as ExecutionContext;

    return { context, anfrage };
  };

  beforeEach(async () => {
    findUnique.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MitgliedschaftsGuard,
        Reflector,
        {
          provide: PrismaService,
          useValue: { membership: { findUnique } },
        },
      ],
    }).compile();

    guard = module.get(MitgliedschaftsGuard);
    reflector = module.get(Reflector);
  });

  describe('Routen ohne :orgId', () => {
    it('laesst Routen ohne Organisationsbezug unberuehrt durch', async () => {
      // GET /auth/me, POST /organizations und so weiter. Der Guard laeuft
      // global, hat hier aber nichts zu pruefen.
      const { context } = baueContext({}, { id: NUTZER_ID, email: 'a@b.de' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('Mandantenpruefung', () => {
    /**
     * Der wichtigste Test dieser Datei.
     *
     * Nicht 403, sondern 404 - und zwar mit derselben Meldung, die auch eine
     * nicht existierende Organisation bekommt. Ein 403 wuerde bestaetigen,
     * dass es die Organisation GIBT, und liesse damit fremde Mandanten
     * kartieren.
     */
    it('antwortet bei fehlender Mitgliedschaft mit 404, nicht mit 403', async () => {
      findUnique.mockResolvedValue(null);

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(guard.canActivate(context)).rejects.not.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('fragt mit BEIDEN Bedingungen ab, nicht nur mit der Organisation', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.OWNER,
      });

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );
      await guard.canActivate(context);

      // Wuerde nur ueber `organizationId` geladen und der Nutzer danach
      // verglichen, waeren die fremden Daten bereits gelesen - und aus einem
      // spaeteren `select` mehr wuerde still ein Leck.
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_userId: {
              organizationId: ORG_ID,
              userId: NUTZER_ID,
            },
          },
        }),
      );
    });

    it('haengt die geprüfte Mitgliedschaft an die Anfrage', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.ADMIN,
      });

      const { context, anfrage } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);

      // Damit der Controller mit GENAU dem arbeitet, was geprueft wurde -
      // statt es noch einmal (und moeglicherweise anders) zu laden.
      expect(anfrage.mitgliedschaft).toEqual({
        organizationId: ORG_ID,
        role: Role.ADMIN,
      });
    });

    /**
     * Ein Programmierfehler, kein Nutzerfehler: Stuende dieser Guard im
     * AppModule VOR dem AccessTokenGuard, gaebe es keinen angemeldeten Nutzer.
     * Er wirft dann laut, statt stillschweigend durchzuwinken - ein `return
     * true` waere hier ein offener Endpoint.
     */
    it('wirft laut, wenn kein angemeldeter Nutzer vorliegt', async () => {
      const { context } = baueContext({ orgId: ORG_ID }, undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(
        /AccessTokenGuard/,
      );
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('Rollenpruefung', () => {
    it('laesst ohne @Rollen() jedes Mitglied durch', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.MEMBER,
      });

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      // Der Mandantenschutz ist nie optional, die Rollenpruefung schon.
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('antwortet bei unzureichender Rolle mit 403, nicht mit 404', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.MEMBER,
      });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.OWNER, Role.ADMIN]);

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      // Hier ist 403 richtig: Die Mitgliedschaft steht, es gibt nichts mehr
      // zu verbergen. Genau der Unterschied zum Test oben.
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('laesst eine ausreichende Rolle durch', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.ADMIN,
      });
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.OWNER, Role.ADMIN]);

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    /**
     * Die Absicherung gegen eine Rangordnung auf dem Enum.
     *
     * Waere die Pruefung als `rolle >= mindestRolle` gebaut, haette OWNER hier
     * je nach Implementierung durchkommen koennen. Mit einer ausdruecklichen
     * Liste gilt genau, was dasteht.
     */
    it('prueft die Liste, nicht eine Rangordnung', async () => {
      findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        role: Role.OWNER,
      });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MEMBER]);

      const { context } = baueContext(
        { orgId: ORG_ID },
        { id: NUTZER_ID, email: 'a@b.de' },
      );

      // OWNER ist "hoeher" als MEMBER - und trotzdem nicht erlaubt, weil die
      // Liste ihn nicht enthaelt. Genau so ist es gemeint: Es gibt Aktionen,
      // die nur ein MEMBER ausfuehrt.
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
