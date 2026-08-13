import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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
  // Eigene Kennung je Lauf UND je Suite.
  //
  // `Date.now()` allein genuegt NICHT: Die Suiten starten parallel und
  // koennen dieselbe Millisekunde treffen. Das Aufraeumen filtert nur nach
  // dieser Kennung - bei einem Gleichstand loescht die eine Suite die
  // Testdaten der anderen mitten im Lauf. Genau das ist am 13.08.2026
  // passiert, sichtbar als Fremdschluesselverletzung in einer fremden Datei.
  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
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

  /**
   * Baut eine Organisation mit OWNER, ADMIN und MEMBER auf.
   *
   * Die beiden zusaetzlichen Mitgliedschaften entstehen direkt in der
   * Datenbank, weil der Einladungs-Flow erst in der naechsten Scheibe kommt.
   * Sobald es ihn gibt, laeuft dieser Aufbau ueber die HTTP-Schnittstelle -
   * bis dahin ist es ehrlicher, die Abkuerzung sichtbar zu nehmen, als den
   * Test um eine Mechanik herumzubauen, die es noch nicht gibt.
   */
  const baueTeam = async (kennung: string) => {
    const ownerToken = await meldeAn(`${kennung}-owner`);
    const adminToken = await meldeAn(`${kennung}-admin`);
    const memberToken = await meldeAn(`${kennung}-member`);

    const orgId = await legeAn(ownerToken, orgName(kennung));

    const idVon = async (rolle: string): Promise<string> => {
      const nutzer = await prisma.user.findUniqueOrThrow({
        where: { email: email(`${kennung}-${rolle}`) },
        select: { id: true },
      });
      return nutzer.id;
    };

    const ownerId = await idVon('owner');
    const adminId = await idVon('admin');
    const memberId = await idVon('member');

    await prisma.membership.createMany({
      data: [
        { organizationId: orgId, userId: adminId, role: 'ADMIN' },
        { organizationId: orgId, userId: memberId, role: 'MEMBER' },
      ],
    });

    return {
      orgId,
      ownerId,
      adminId,
      memberId,
      ownerToken,
      adminToken,
      memberToken,
    };
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

  describe('PATCH /organizations/:orgId/members/:userId', () => {
    it('erlaubt dem OWNER, ein Mitglied zum ADMIN zu machen', async () => {
      const { orgId, memberId, ownerToken } = await baueTeam('befoerdern');

      const antwort = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      expect((antwort.body as MitgliedAntwort).role).toBe('ADMIN');
    });

    /**
     * ========================================================================
     * DER WICHTIGSTE ROLLENTEST: KEINE RECHTEAUSWEITUNG
     * ========================================================================
     * Duerfte ein ADMIN Rollen vergeben, koennte er sich selbst zum OWNER
     * machen - und die Unterscheidung der beiden Rollen waere wertlos.
     *
     * Merksatz: Wer Rechte vergeben darf, hat sie.
     */
    it('verbietet einem ADMIN das Aendern von Rollen mit 403', async () => {
      const { orgId, memberId, adminToken } = await baueTeam('eskalation');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('verbietet einem ADMIN, sich selbst zum OWNER zu machen', async () => {
      const { orgId, adminId, adminToken } = await baueTeam('selbst-owner');

      // Derselbe Schutz, aber der Fall, der im Ernstfall wirklich versucht
      // wird - deshalb ausdruecklich als eigener Test.
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'OWNER' })
        .expect(403);
    });

    /**
     * Die Regel aus Frage 67, jetzt umgesetzt.
     *
     * 409 und nicht 403: Der OWNER IST berechtigt. Die Anfrage widerspricht
     * nur dem aktuellen Zustand - mit einem zweiten OWNER waere dieselbe
     * Anfrage erfolgreich.
     */
    it('verhindert das Herabstufen des LETZTEN OWNER mit 409', async () => {
      const { orgId, ownerId, ownerToken } = await baueTeam('letzter-owner');

      const antwort = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'MEMBER' })
        .expect(409);

      expect((antwort.body as FehlerAntwort).message).toContain('OWNER');
    });

    it('erlaubt das Herabstufen, sobald ein zweiter OWNER existiert', async () => {
      const { orgId, ownerId, memberId, ownerToken } =
        await baueTeam('zweiter-owner');

      // Erst den zweiten Eigentuemer ernennen ...
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'OWNER' })
        .expect(200);

      // ... dann darf sich der erste zurueckziehen. Die Regel lautet
      // "mindestens einer", nicht "der Ersteller fuer immer".
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'MEMBER' })
        .expect(200);
    });

    it('antwortet bei unbekanntem Mitglied mit 404', async () => {
      const { orgId, ownerToken } = await baueTeam('unbekannt');

      await request(app.getHttpServer())
        .patch(
          `/organizations/${orgId}/members/00000000-0000-4000-8000-000000000000`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(404);
    });

    it('weist eine ungueltige Rolle mit 400 ab', async () => {
      const { orgId, memberId, ownerToken } = await baueTeam('rolle-ungueltig');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'SUPERADMIN' })
        .expect(400);
    });

    it('weist eine ungueltige Nutzer-ID mit 400 statt 500 ab', async () => {
      const { orgId, ownerToken } = await baueTeam('id-ungueltig');

      // Ohne Validierung am Rand ginge "abc" bis zur Datenbank durch und
      // Prisma antwortete mit einem Fehler ueber UUID-Syntax - also 500 fuer
      // eine schlicht falsche Eingabe.
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/abc`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('DELETE /organizations/:orgId/members/:userId', () => {
    it('erlaubt dem OWNER das Entfernen eines MEMBER', async () => {
      const { orgId, memberId, ownerToken } = await baueTeam('entfernen');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const uebrig = await prisma.membership.findMany({
        where: { organizationId: orgId },
      });
      expect(uebrig.map((m) => m.userId)).not.toContain(memberId);
    });

    /**
     * ========================================================================
     * DER FALL, DEN EIN GUARD NICHT ENTSCHEIDEN KANN
     * ========================================================================
     * Ein MEMBER darf niemanden entfernen - aber sich selbst schon. Ein
     * @Rollen(OWNER, ADMIN) haette ihn abgewiesen, bevor ueberhaupt klar ist,
     * wen er meint. Der Guard kennt den Anfragenden, nicht die Zielressource.
     */
    it('laesst einen MEMBER die Organisation verlassen', async () => {
      const { orgId, memberId, memberToken } = await baueTeam('verlassen');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(204);

      // Danach ist die Organisation fuer ihn nicht mehr sichtbar - der
      // Mandantenschutz greift sofort, ohne dass sich am Token etwas aendert.
      await request(app.getHttpServer())
        .get(`/organizations/${orgId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });

    it('verbietet einem MEMBER das Entfernen eines anderen mit 403', async () => {
      const { orgId, ownerId, memberToken } = await baueTeam('member-fremd');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    /**
     * Ohne diesen Schutz koennte ein ADMIN alle OWNER entfernen und die
     * Organisation uebernehmen. Wer den Hoeherstehenden entfernen kann, steht
     * hoeher - die Rangfolge waere wirkungslos.
     */
    it('verbietet einem ADMIN das Entfernen eines OWNER mit 403', async () => {
      const { orgId, ownerId, adminToken } = await baueTeam('admin-vs-owner');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('erlaubt einem ADMIN das Entfernen eines MEMBER', async () => {
      const { orgId, memberId, adminToken } = await baueTeam('admin-entfernt');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('verhindert, dass der letzte OWNER die Organisation verlaesst (409)', async () => {
      const { orgId, ownerId, ownerToken } = await baueTeam('owner-verlaesst');

      // Derselbe Schutz wie beim Herabstufen - und genau deshalb liegt er im
      // Service. Vier Wege fuehren zu dieser Regel; am Endpoint muesste man
      // sie viermal schreiben und wuerde einen davon vergessen.
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });

    /**
     * ========================================================================
     * ZWEI GLEICHZEITIGE AUSTRITTE - EIN INVARIANTENTEST
     * ========================================================================
     * Zwei OWNER verlassen die Organisation im selben Moment. Danach muss
     * genau einer uebrig sein.
     *
     * EHRLICHE EINORDNUNG: Dieser Test ist auch dann gruen, wenn man die
     * Zeilensperre entfernt - nachgeprueft. Der Grund ist, dass zwei Anfragen
     * ueber HTTP nur selten so eng verschraenkt laufen, dass beide ihre
     * Zaehlung vor dem Schreiben der jeweils anderen abschliessen. Die
     * Race Condition ist echt, aber ueber diesen Weg nicht zuverlaessig
     * ausloesbar.
     *
     * Er bleibt trotzdem: Er sichert die INVARIANTE ("es bleibt ein OWNER")
     * und wuerde eine grobe Regression bemerken. Er beweist nur nicht, dass
     * die Sperre wirkt - das tut der Test darunter.
     *
     * Merksatz: Ein Test, der mit und ohne den Schutz gruen ist, bewacht ihn
     * nicht. Das faellt nur auf, wenn man es ausprobiert.
     */
    it('laesst bei zwei gleichzeitigen Austritten genau einen OWNER uebrig', async () => {
      const { orgId, ownerId, memberId, ownerToken, memberToken } =
        await baueTeam('gleichzeitig');

      // Zweiten OWNER ernennen - jetzt sind es zwei.
      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'OWNER' })
        .expect(200);

      // Beide verlassen gleichzeitig. Ohne Sperre kaemen beide durch.
      const ergebnisse = await Promise.all([
        request(app.getHttpServer())
          .delete(`/organizations/${orgId}/members/${ownerId}`)
          .set('Authorization', `Bearer ${ownerToken}`),
        request(app.getHttpServer())
          .delete(`/organizations/${orgId}/members/${memberId}`)
          .set('Authorization', `Bearer ${memberToken}`),
      ]);

      const status = ergebnisse.map((e) => e.status).sort();
      expect(status).toEqual([204, 409]);

      // Die eigentliche Zusicherung: Die Organisation hat noch einen
      // Eigentuemer. Der Statuscode oben ist nur das sichtbare Symptom.
      const owner = await prisma.membership.count({
        where: { organizationId: orgId, role: 'OWNER' },
      });
      expect(owner).toBe(1);
    });

    /**
     * ========================================================================
     * DER NACHWEIS, DASS DIE ZEILENSPERRE WIRKT
     * ========================================================================
     * Statt zu hoffen, dass zwei Anfragen sich zufaellig verschraenken, wird
     * der Konflikt hier ERZWUNGEN: Eine eigene Transaktion nimmt die Sperre
     * auf der Organisationszeile und haelt sie eine halbe Sekunde.
     *
     * Nimmt der Endpoint dieselbe Sperre, MUSS er warten - seine Antwort kann
     * nicht vor dem Ende der blockierenden Transaktion kommen. Genau das wird
     * gemessen.
     *
     * Ohne `FOR UPDATE` im Service laeuft die Anfrage sofort durch und der
     * Test schlaegt fehl. Damit bewacht er den Schutz tatsaechlich - anders
     * als der Test darueber.
     *
     * Warum eine Zeitmessung vertretbar ist: Gemessen wird nicht, ob etwas
     * "schnell genug" ist (das waere bruechig), sondern ob eine kuenstlich
     * erzeugte Wartezeit von 500 ms UEBERHAUPT abgewartet wurde. Der Abstand
     * zwischen "sofort" und "eine halbe Sekunde" ist gross genug, dass
     * Schwankungen keine Rolle spielen.
     */
    it('wartet auf die Zeilensperre der Organisation', async () => {
      const { orgId, memberId, ownerToken } = await baueTeam('sperre');

      const SPERRDAUER_MS = 500;
      let sperreGesetzt: () => void = () => {};
      const sperreBereit = new Promise<void>((aufloesen) => {
        sperreGesetzt = aufloesen;
      });

      // Eigene Transaktion, die die Zeile blockiert und dann losslaesst.
      const blockierer = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
        sperreGesetzt();
        await new Promise((weiter) => setTimeout(weiter, SPERRDAUER_MS));
      });

      // Erst starten, wenn die Sperre wirklich steht - sonst waere der Test
      // von der Reihenfolge zweier Verbindungen abhaengig.
      await sperreBereit;

      const start = Date.now();
      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      const dauer = Date.now() - start;

      await blockierer;

      // Grosszuegiger Abstand nach unten: Es geht um "hat gewartet" gegen
      // "lief sofort durch", nicht um Millisekunden.
      expect(dauer).toBeGreaterThan(SPERRDAUER_MS * 0.6);
    });

    it('antwortet fuer ein Nichtmitglied mit 404', async () => {
      const { orgId, memberId } = await baueTeam('fremder-loescht');
      const fremderToken = await meldeAn('fremder-loescht-b');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${fremderToken}`)
        .expect(404);
    });
  });
});
