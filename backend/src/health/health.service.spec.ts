import { Test, TestingModule } from '@nestjs/testing';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get(HealthService);
  });

  it('meldet den Status ok', () => {
    expect(service.check().status).toBe('ok');
  });

  it('liefert die Laufzeit als nicht-negative Zahl', () => {
    const { uptimeSeconds } = service.check();

    expect(typeof uptimeSeconds).toBe('number');
    expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('liefert einen gueltigen ISO-Zeitstempel', () => {
    const { timestamp } = service.check();

    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
