import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const isReachable = jest.fn<Promise<boolean>, []>();

  beforeEach(async () => {
    isReachable.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        // Hier zahlt sich Dependency Injection aus: Statt der echten
        // Datenbank bekommt der Service eine Attrappe. Kein Container,
        // keine Verbindung, Laufzeit im Millisekundenbereich - und
        // Ausfallszenarien lassen sich ueberhaupt erst pruefen.
        { provide: PrismaService, useValue: { isReachable } },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  describe('wenn die Datenbank erreichbar ist', () => {
    beforeEach(() => isReachable.mockResolvedValue(true));

    it('meldet Status ok', async () => {
      expect((await service.check()).status).toBe('ok');
    });

    it('meldet die Datenbank als up', async () => {
      expect((await service.check()).checks.database).toBe('up');
    });

    it('liefert die Laufzeit als nicht-negative Zahl', async () => {
      const { uptimeSeconds } = await service.check();

      expect(typeof uptimeSeconds).toBe('number');
      expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('liefert einen gueltigen ISO-Zeitstempel', async () => {
      const { timestamp } = await service.check();

      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('wenn die Datenbank ausgefallen ist', () => {
    beforeEach(() => isReachable.mockResolvedValue(false));

    it('meldet Status degraded', async () => {
      expect((await service.check()).status).toBe('degraded');
    });

    it('meldet die Datenbank als down', async () => {
      expect((await service.check()).checks.database).toBe('down');
    });
  });
});
