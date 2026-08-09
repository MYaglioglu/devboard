import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: { database: string };
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health liefert 200 mit erreichbarer Datenbank', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    // supertest liefert `body` als `any`. Einmal explizit typisieren,
    // danach pruefen wir gegen einen bekannten Typ statt gegen `any`.
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('up');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('GET / existiert nicht', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });
});
