import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface OrganisationAntwort {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
}

interface LoginAntwort {
  accessToken: string;
}

interface FehlerAntwort {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Eigene Kennung je Lauf. Sonst haengen die Tests von Rueckstaenden
  // frueherer Laeufe ab - eine der haeufigsten Ursachen fuer Tests, die
  // "manchmal" fehlschlagen.
  const lauf = Date.now();
  const email = (kennung: string) => `e2e-org-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E ${kennung} ${lauf}`;

  /** Legt ein Konto an, meldet es an und liefert seinen Access-Token. */
  const meldeAn = async (kennung: string): Promise<string> => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email(kennung), password: 'einSicheresPasswort' })
      .expect(201);

    const antwort = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(kennung), password: 'einSicheresPasswort' })
      .expect(200);

    return (antwort.body as LoginAntwort).accessToken;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Organisationen zuerst: Sie haengen NICHT am Nutzer. Ein geloeschter
    // Nutzer nimmt per Cascade nur seine Mitgliedschaften mit, die
    // Organisation selbst bliebe stehen - genau der verwaiste Zustand, den
    // wir in 08_DATABASE.md beschrieben haben. Hier faellt er als
    // Testrueckstand auf, in Produktion waere er ein Datenleichenproblem.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST /organizations', () => {
    it('legt eine Organisation an und macht den Ersteller zum OWNER', async () => {
      const token = await meldeAn('ersteller');

      const antwort = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: orgName('Acme') })
        .expect(201);

      const koerper = antwort.body as OrganisationAntwort;

      expect(koerper.name).toBe(orgName('Acme'));
      expect(koerper.role).toBe('OWNER');
      expect(koerper.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    /**
     * Der Nachweis, dass die Transaktion wirkt - gegen die ECHTE Datenbank.
     *
     * Der Unit-Test prueft die Form des Aufrufs, dieser hier das Ergebnis:
     * Nach dem Anlegen existiert tatsaechlich eine Mitgliedschaft. Ohne die
     * waere die Organisation unverwaltbar und taeuchte in keiner Liste auf.
     */
    it('erzeugt die Mitgliedschaft tatsaechlich in der Datenbank', async () => {
      const token = await meldeAn('transaktion');

      const antwort = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: orgName('Transaktion') })
        .expect(201);

      const { id } = antwort.body as OrganisationAntwort;

      const mitglieder = await prisma.membership.findMany({
        where: { organizationId: id },
      });

      expect(mitglieder).toHaveLength(1);
      expect(mitglieder[0].role).toBe('OWNER');
    });

    it('weist einen zu kurzen Namen mit 400 ab', async () => {
      const token = await meldeAn('kurzer-name');

      const antwort = await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'A' })
        .expect(400);

      expect((antwort.body as FehlerAntwort).errors).toHaveProperty('name');
    });

    /**
     * `trim()` steht im Zod-Schema VOR `min(2)`. Stuende es danach, kaeme
     * dieser Name durch die Pruefung und landete als leere Zeichenkette in der
     * Datenbank.
     */
    it('weist einen Namen aus reinen Leerzeichen mit 400 ab', async () => {
      const token = await meldeAn('leerzeichen');

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' })
        .expect(400);
    });

    it('antwortet ohne Access-Token mit 401', async () => {
      await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: orgName('Ohne Token') })
        .expect(401);
    });
  });

  describe('GET /organizations', () => {
    it('liefert die eigenen Organisationen mit der eigenen Rolle', async () => {
      const token = await meldeAn('liste');

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: orgName('Liste') })
        .expect(201);

      const antwort = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const koerper = antwort.body as OrganisationAntwort[];

      expect(koerper).toHaveLength(1);
      expect(koerper[0].name).toBe(orgName('Liste'));
      expect(koerper[0].role).toBe('OWNER');
    });

    /**
     * ========================================================================
     * DER WICHTIGSTE TEST DIESER DATEI
     * ========================================================================
     * Er prueft nicht, dass etwas funktioniert, sondern dass etwas NICHT
     * geht: Nutzer B darf die Organisation von Nutzer A nicht sehen.
     *
     * Genau diese Art Test fehlt in den meisten Projekten. Der Erfolgspfad
     * ("ich lege an, ich sehe es") ist auch dann gruen, wenn der
     * Mandantenfilter fehlt - denn wenn nur ein Nutzer existiert, gehoert ihm
     * ohnehin alles. Die Luecke faellt erst mit einem ZWEITEN Nutzer auf.
     *
     * Ab hier hat jede Scheibe von Sprint 2 einen solchen Test.
     */
    it('zeigt einem fremden Nutzer die Organisation NICHT', async () => {
      const tokenA = await meldeAn('besitzer');
      const tokenB = await meldeAn('fremder');

      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: orgName('Geheim') })
        .expect(201);

      const antwort = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const koerper = antwort.body as OrganisationAntwort[];

      // Nicht nur "leer", sondern gezielt: der fremde Name kommt nirgends vor.
      // `toHaveLength(0)` allein waere schwaecher - es wuerde auch dann
      // bestehen, wenn der Test versehentlich den falschen Nutzer abfragt.
      expect(koerper.map((o) => o.name)).not.toContain(orgName('Geheim'));
      expect(koerper).toHaveLength(0);
    });

    it('liefert eine leere Liste statt 404, wenn es keine Mitgliedschaft gibt', async () => {
      const token = await meldeAn('ohne-organisation');

      const antwort = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Ein 404 waere hier falsch: Die Liste EXISTIERT, sie ist nur leer.
      // 404 hiesse "diese Ressource gibt es nicht" - das stimmt nicht.
      expect(antwort.body).toEqual([]);
    });

    it('antwortet ohne Access-Token mit 401', async () => {
      await request(app.getHttpServer()).get('/organizations').expect(401);
    });
  });
});
