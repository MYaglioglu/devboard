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

interface MitgliedAntwort {
  userId: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  mitgliedSeit: string;
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

  /** Legt eine Organisation an und liefert ihre ID. */
  const legeAn = async (token: string, name: string): Promise<string> => {
    const antwort = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return (antwort.body as OrganisationAntwort).id;
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

  describe('GET /organizations/:orgId', () => {
    it('liefert die Organisation samt eigener Rolle', async () => {
      const token = await meldeAn('detail');
      const id = await legeAn(token, orgName('Detail'));

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const koerper = antwort.body as OrganisationAntwort;
      expect(koerper.id).toBe(id);
      expect(koerper.role).toBe('OWNER');
    });

    /**
     * ========================================================================
     * DER TEST, DER DIE 404-ENTSCHEIDUNG FESTSCHREIBT
     * ========================================================================
     * Nutzer B ist angemeldet und kennt die ID - er ist nur kein Mitglied.
     * Die Antwort ist 404, NICHT 403.
     *
     * Ein 403 wuerde bestaetigen, dass es diese Organisation gibt. Damit
     * liessen sich IDs durchprobieren und existierende Mandanten kartieren.
     * Fuer Nutzer B existiert sie schlicht nicht.
     */
    it('antwortet bei fremder Organisation mit 404, nicht mit 403', async () => {
      const tokenA = await meldeAn('eigner-detail');
      const tokenB = await meldeAn('fremder-detail');
      const id = await legeAn(tokenA, orgName('Fremd'));

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      // Die Meldung darf keinen Hinweis darauf geben, dass es die
      // Organisation gibt - sonst waere der Statuscode umsonst vorsichtig.
      const koerper = antwort.body as FehlerAntwort;
      expect(koerper.message).toBe('Organisation nicht gefunden');
    });

    it('antwortet bei nicht existierender Organisation mit derselben 404', async () => {
      const token = await meldeAn('gibt-es-nicht');

      const antwort = await request(app.getHttpServer())
        .get('/organizations/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // Wortgleich mit dem Test darueber. Genau darum geht es: Die beiden
      // Faelle duerfen von aussen nicht zu unterscheiden sein.
      expect((antwort.body as FehlerAntwort).message).toBe(
        'Organisation nicht gefunden',
      );
    });

    it('antwortet ohne Access-Token mit 401, nicht mit 404', async () => {
      const token = await meldeAn('reihenfolge');
      const id = await legeAn(token, orgName('Reihenfolge'));

      // Beweist die Guard-Reihenfolge: Erst Authentifizierung (401), dann
      // Autorisierung (404/403). Andersherum wuerde die Antwort verraten,
      // ob eine ID existiert, noch bevor jemand angemeldet ist.
      await request(app.getHttpServer())
        .get(`/organizations/${id}`)
        .expect(401);
    });
  });

  describe('GET /organizations/:orgId/members', () => {
    it('listet die Mitglieder mit Rolle und Beitrittsdatum', async () => {
      const token = await meldeAn('mitglieder');
      const id = await legeAn(token, orgName('Mitglieder'));

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const koerper = antwort.body as MitgliedAntwort[];

      expect(koerper).toHaveLength(1);
      expect(koerper[0].email).toBe(email('mitglieder'));
      expect(koerper[0].role).toBe('OWNER');
      expect(koerper[0].mitgliedSeit).toBeDefined();
    });

    it('gibt niemals einen Passwort-Hash heraus', async () => {
      const token = await meldeAn('kein-hash-hier');
      const id = await legeAn(token, orgName('Kein Hash'));

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(JSON.stringify(antwort.body)).not.toContain('argon2');
      expect(JSON.stringify(antwort.body)).not.toContain('passwordHash');
    });

    it('antwortet fuer einen fremden Nutzer mit 404', async () => {
      const tokenA = await meldeAn('eigner-mitglieder');
      const tokenB = await meldeAn('fremder-mitglieder');
      const id = await legeAn(tokenA, orgName('Fremde Mitglieder'));

      await request(app.getHttpServer())
        .get(`/organizations/${id}/members`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('PATCH /organizations/:orgId', () => {
    it('erlaubt dem OWNER das Umbenennen', async () => {
      const token = await meldeAn('umbenennen');
      const id = await legeAn(token, orgName('Alt'));

      const antwort = await request(app.getHttpServer())
        .patch(`/organizations/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: orgName('Neu') })
        .expect(200);

      expect((antwort.body as OrganisationAntwort).name).toBe(orgName('Neu'));
    });

    /**
     * ========================================================================
     * DER ERSTE 403 IM PROJEKT
     * ========================================================================
     * Bis hierher gab es ausschliesslich 401 ("wer bist du?") und 404 ("fuer
     * dich existiert das nicht"). Dieser Fall ist ein dritter: Der Nutzer IST
     * Mitglied - er darf nur nicht.
     *
     * Anmelden hilft hier nicht. Genau das unterscheidet 403 von 401.
     *
     * Die Mitgliedschaft wird direkt in der Datenbank angelegt, weil der
     * Einladungs-Flow erst in einer spaeteren Scheibe kommt. Sobald es ihn
     * gibt, laeuft dieser Aufbau ueber die HTTP-Schnittstelle.
     */
    it('verbietet einem MEMBER das Umbenennen mit 403', async () => {
      const tokenOwner = await meldeAn('owner-patch');
      const tokenMember = await meldeAn('member-patch');
      const id = await legeAn(tokenOwner, orgName('Rollen'));

      const member = await prisma.user.findUniqueOrThrow({
        where: { email: email('member-patch') },
        select: { id: true },
      });
      await prisma.membership.create({
        data: { organizationId: id, userId: member.id, role: 'MEMBER' },
      });

      const antwort = await request(app.getHttpServer())
        .patch(`/organizations/${id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ name: orgName('Verboten') })
        .expect(403);

      // 403 und nicht 404: Die Mitgliedschaft steht, es gibt nichts zu
      // verbergen. Die Meldung darf deshalb konkret sein.
      expect((antwort.body as FehlerAntwort).message).toContain('OWNER');
    });

    it('laesst einen MEMBER die Organisation weiterhin LESEN', async () => {
      const tokenOwner = await meldeAn('owner-lesen');
      const tokenMember = await meldeAn('member-lesen');
      const id = await legeAn(tokenOwner, orgName('Lesen'));

      const member = await prisma.user.findUniqueOrThrow({
        where: { email: email('member-lesen') },
        select: { id: true },
      });
      await prisma.membership.create({
        data: { organizationId: id, userId: member.id, role: 'MEMBER' },
      });

      // Die Rollenpruefung haengt am einzelnen Endpoint, nicht an der
      // Organisation. Ein MEMBER darf lesen und nur nicht schreiben - waere
      // das nicht so, waere die Rolle wertlos.
      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(200);

      expect((antwort.body as OrganisationAntwort).role).toBe('MEMBER');
    });

    it('antwortet fuer einen Nichtmitglied mit 404 statt 403', async () => {
      const tokenA = await meldeAn('eigner-patch');
      const tokenB = await meldeAn('fremder-patch');
      const id = await legeAn(tokenA, orgName('Fremd Patch'));

      // Kein Mitglied: Die Organisation existiert fuer B nicht - er erfaehrt
      // nicht einmal, dass ihm die Rolle fehlen wuerde.
      await request(app.getHttpServer())
        .patch(`/organizations/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: orgName('Fremd Neu') })
        .expect(404);
    });

    it('weist einen ungueltigen Namen mit 400 ab', async () => {
      const token = await meldeAn('patch-validierung');
      const id = await legeAn(token, orgName('Validierung'));

      await request(app.getHttpServer())
        .patch(`/organizations/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' })
        .expect(400);
    });
  });
});
