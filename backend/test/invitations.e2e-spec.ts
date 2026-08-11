import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface EinladungAntwort {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  expiresAt: string;
  createdAt: string;
  token?: string;
}

interface BeitrittAntwort {
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

interface FehlerAntwort {
  message: string;
  statusCode: number;
}

describe('Invitations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const lauf = Date.now();
  const email = (kennung: string) => `e2e-inv-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E INV ${kennung} ${lauf}`;

  const meldeAn = async (kennung: string): Promise<string> => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email(kennung), password: 'einSicheresPasswort' })
      .expect(201);

    const antwort = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(kennung), password: 'einSicheresPasswort' })
      .expect(200);

    return (antwort.body as { accessToken: string }).accessToken;
  };

  const legeAn = async (token: string, name: string): Promise<string> => {
    const antwort = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return (antwort.body as { id: string }).id;
  };

  /** OWNER mit eigener Organisation. */
  const baueOrganisation = async (kennung: string) => {
    const ownerToken = await meldeAn(`${kennung}-owner`);
    const orgId = await legeAn(ownerToken, orgName(kennung));
    return { ownerToken, orgId };
  };

  /** Spricht eine Einladung aus und liefert Token und ID. */
  const ladeEin = async (
    token: string,
    orgId: string,
    zielEmail: string,
    rolle = 'MEMBER',
  ): Promise<{ token: string; id: string }> => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: zielEmail, role: rolle })
      .expect(201);

    const koerper = antwort.body as EinladungAntwort;
    return { token: koerper.token as string, id: koerper.id };
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
    // Einladungen haengen per Cascade an der Organisation und verschwinden
    // mit ihr - anders als die Organisation selbst, die NICHT am Nutzer
    // haengt und deshalb ausdruecklich geloescht werden muss.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST /organizations/:orgId/invitations', () => {
    it('spricht eine Einladung aus und liefert den Token genau einmal', async () => {
      const { ownerToken, orgId } = await baueOrganisation('anlegen');

      const antwort = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: email('gast'), role: 'MEMBER' })
        .expect(201);

      const koerper = antwort.body as EinladungAntwort;
      expect(koerper.email).toBe(email('gast'));
      expect(koerper.role).toBe('MEMBER');
      expect(koerper.token).toBeDefined();
    });

    /**
     * ========================================================================
     * DER TOKEN LIEGT NIEMALS IM KLARTEXT IN DER DATENBANK
     * ========================================================================
     * Dasselbe Prinzip wie beim Refresh-Token: Bei einem Datenbankleck waeren
     * gespeicherte Rohwerte sofort verwendbare Zugaenge zu fremden
     * Organisationen.
     */
    it('speichert nur den Hash, nie den Token selbst', async () => {
      const { ownerToken, orgId } = await baueOrganisation('hash');
      const { token, id } = await ladeEin(
        ownerToken,
        orgId,
        email('hash-ziel'),
      );

      const gespeichert = await prisma.invitation.findUniqueOrThrow({
        where: { id },
        select: { tokenHash: true },
      });

      expect(gespeichert.tokenHash).not.toBe(token);
      expect(gespeichert.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
    });

    /**
     * ========================================================================
     * KEINE USER ENUMERATION
     * ========================================================================
     * Ob unter der Adresse ein Konto existiert oder nicht, darf die Antwort
     * nicht verraten. Sonst haette jeder ADMIN einen Dienst, mit dem er
     * beliebige Adressen darauf pruefen kann, ob sie bei DevBoard registriert
     * sind.
     */
    it('antwortet gleich, ob das Konto existiert oder nicht', async () => {
      const { ownerToken, orgId } = await baueOrganisation('enumeration');
      await meldeAn('vorhanden');

      const mitKonto = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: email('vorhanden'), role: 'MEMBER' })
        .expect(201);

      const ohneKonto = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: email('gibt-es-nicht'), role: 'MEMBER' })
        .expect(201);

      // Gleiche Statuscodes, gleiche Feldmenge. Ein unterschiedlicher Aufbau
      // waere genauso verraeterisch wie ein unterschiedlicher Statuscode.
      expect(Object.keys(mitKonto.body as object).sort()).toEqual(
        Object.keys(ohneKonto.body as object).sort(),
      );
    });

    it('lehnt die Rolle OWNER mit 400 ab', async () => {
      const { ownerToken, orgId } = await baueOrganisation('kein-owner');

      // OWNER entsteht ausschliesslich durch Ernennen eines bestehenden
      // Mitglieds. Ueber die Einladung waere es ein zweiter Weg, der in der
      // Mitgliederliste nie sichtbar wuerde.
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: email('moechtegern'), role: 'OWNER' })
        .expect(400);
    });

    it('verbietet einem ADMIN, einen ADMIN einzuladen (403)', async () => {
      const { orgId } = await baueOrganisation('admin-laedt');
      const adminToken = await meldeAn('admin-laedt-admin');

      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: email('admin-laedt-admin') },
        select: { id: true },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: admin.id, role: 'ADMIN' },
      });

      // Sonst koennte ein ADMIN ueber den Umweg der Einladung Rechte
      // vergeben, die zu vergeben ihm nicht zusteht.
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: email('neuer-admin'), role: 'ADMIN' })
        .expect(403);

      // MEMBER einzuladen bleibt ihm erlaubt.
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: email('neues-member'), role: 'MEMBER' })
        .expect(201);
    });

    it('verbietet einem MEMBER das Einladen (403)', async () => {
      const { orgId } = await baueOrganisation('member-laedt');
      const memberToken = await meldeAn('member-laedt-jemanden');

      const member = await prisma.user.findUniqueOrThrow({
        where: { email: email('member-laedt-jemanden') },
        select: { id: true },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: member.id, role: 'MEMBER' },
      });

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: email('irgendwer'), role: 'MEMBER' })
        .expect(403);
    });

    it('antwortet fuer ein Nichtmitglied mit 404, nicht mit 403', async () => {
      const { orgId } = await baueOrganisation('fremder-laedt');
      const fremderToken = await meldeAn('fremder-laedt-b');

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${fremderToken}`)
        .send({ email: email('egal'), role: 'MEMBER' })
        .expect(404);
    });

    /**
     * Ein erneutes Einladen ist eine normale Handlung ("die erste ist im Spam
     * gelandet") und darf nicht mit 409 scheitern. Die aeltere Einladung wird
     * entwertet - sonst waeren zwei Token gleichzeitig gueltig.
     */
    it('entwertet die vorherige Einladung an dieselbe Adresse', async () => {
      const { ownerToken, orgId } = await baueOrganisation('erneut');
      const gast = await meldeAn('erneut-gast');

      const ersteEinladung = await ladeEin(
        ownerToken,
        orgId,
        email('erneut-gast'),
      );
      const zweiteEinladung = await ladeEin(
        ownerToken,
        orgId,
        email('erneut-gast'),
      );

      // Der alte Token gilt nicht mehr ...
      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: ersteEinladung.token })
        .expect(404);

      // ... der neue schon.
      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: zweiteEinladung.token })
        .expect(200);
    });
  });

  describe('GET /organizations/:orgId/invitations', () => {
    it('listet offene Einladungen OHNE den Token', async () => {
      const { ownerToken, orgId } = await baueOrganisation('liste');
      await ladeEin(ownerToken, orgId, email('liste-gast'));

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const koerper = antwort.body as EinladungAntwort[];

      expect(koerper).toHaveLength(1);
      expect(koerper[0].email).toBe(email('liste-gast'));
      // Der Token existiert genau einmal - in der Antwort auf das Anlegen.
      expect(koerper[0].token).toBeUndefined();
      expect(JSON.stringify(koerper)).not.toContain('token');
    });

    it('verbirgt offene Einladungen vor einem MEMBER (403)', async () => {
      const { orgId } = await baueOrganisation('liste-member');
      const memberToken = await meldeAn('liste-member-b');

      const member = await prisma.user.findUniqueOrThrow({
        where: { email: email('liste-member-b') },
        select: { id: true },
      });
      await prisma.membership.create({
        data: { organizationId: orgId, userId: member.id, role: 'MEMBER' },
      });

      // Ein MEMBER darf sehen, wer dazugehoert - nicht, wer noch eingeladen
      // ist. Das sind E-Mail-Adressen von Menschen ausserhalb des Teams.
      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  describe('DELETE /organizations/:orgId/invitations/:invitationId', () => {
    it('zieht eine Einladung zurueck und macht den Token ungueltig', async () => {
      const { ownerToken, orgId } = await baueOrganisation('zurueckziehen');
      const gast = await meldeAn('zurueckziehen-gast');
      const einladung = await ladeEin(
        ownerToken,
        orgId,
        email('zurueckziehen-gast'),
      );

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/invitations/${einladung.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: einladung.token })
        .expect(404);
    });

    /**
     * ========================================================================
     * DER VERGESSENE MANDANTENFILTER IN SEINER TYPISCHSTEN FORM
     * ========================================================================
     * Ein OWNER ist in SEINER Organisation berechtigt - der Guard laesst ihn
     * durch. Die Einladungs-ID im Pfad gehoert aber zu einer FREMDEN
     * Organisation.
     *
     * Waere im Service `update({ where: { id } })` statt
     * `updateMany({ where: { id, organizationId } })` geschrieben, koennte er
     * fremde Einladungen zurueckziehen. Der Guard haette ihn nicht aufgehalten
     * - er prueft die Organisation im PFAD, nicht die Zugehoerigkeit der
     * Ressource.
     *
     * Merksatz: Die ID im Pfad gehoert nicht automatisch zu der Organisation
     * im Pfad.
     */
    it('kann eine Einladung einer FREMDEN Organisation nicht zurueckziehen', async () => {
      const a = await baueOrganisation('fremd-a');
      const b = await baueOrganisation('fremd-b');

      const fremdeEinladung = await ladeEin(
        b.ownerToken,
        b.orgId,
        email('fremd-ziel'),
      );

      // A ist OWNER seiner eigenen Organisation und kommt durch den Guard.
      // Die Einladung gehoert trotzdem nicht ihm.
      await request(app.getHttpServer())
        .delete(`/organizations/${a.orgId}/invitations/${fremdeEinladung.id}`)
        .set('Authorization', `Bearer ${a.ownerToken}`)
        .expect(404);

      // Und sie ist danach unveraendert gueltig.
      const unveraendert = await prisma.invitation.findUniqueOrThrow({
        where: { id: fremdeEinladung.id },
        select: { revokedAt: true },
      });
      expect(unveraendert.revokedAt).toBeNull();
    });
  });

  describe('POST /invitations/accept', () => {
    it('macht den Eingeladenen zum Mitglied mit der eingeladenen Rolle', async () => {
      const { ownerToken, orgId } = await baueOrganisation('beitritt');
      const gast = await meldeAn('beitritt-gast');
      const einladung = await ladeEin(
        ownerToken,
        orgId,
        email('beitritt-gast'),
        'ADMIN',
      );

      const antwort = await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: einladung.token })
        .expect(200);

      expect((antwort.body as BeitrittAntwort).role).toBe('ADMIN');

      // Und die Organisation ist ab sofort sichtbar - ohne dass sich am Token
      // etwas geaendert haette. Die Rolle wird bei jeder Anfrage frisch aus
      // der Datenbank gelesen, nicht aus dem JWT.
      const liste = await request(app.getHttpServer())
        .get('/organizations')
        .set('Authorization', `Bearer ${gast}`)
        .expect(200);

      expect((liste.body as { id: string }[]).map((o) => o.id)).toContain(
        orgId,
      );
    });

    /**
     * ========================================================================
     * DER TOKEN ALLEIN REICHT NICHT
     * ========================================================================
     * Die Einladung ist an eine ADRESSE gerichtet. Ein weitergeleiteter Link
     * - versehentlich in einem geteilten Postfach oder einem Chat gelandet -
     * ist damit kein Zugang.
     *
     * Die Alternative ("wer den Link hat, ist drin") kennt man von vielen
     * Produkten. Sie ist bequemer und deutlich schwaecher.
     */
    it('verweigert die Annahme durch eine andere E-Mail-Adresse (403)', async () => {
      const { ownerToken, orgId } = await baueOrganisation('falsche-adresse');
      const falscherGast = await meldeAn('falscher-gast');
      const einladung = await ladeEin(
        ownerToken,
        orgId,
        email('richtiger-gast'),
      );

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${falscherGast}`)
        .send({ token: einladung.token })
        .expect(403);

      // Nichts angelegt - die Einladung bleibt fuer den Richtigen gueltig.
      const mitglieder = await prisma.membership.count({
        where: { organizationId: orgId },
      });
      expect(mitglieder).toBe(1);
    });

    it('laesst denselben Token kein zweites Mal einloesen', async () => {
      const { ownerToken, orgId } = await baueOrganisation('zweimal');
      const gast = await meldeAn('zweimal-gast');
      const einladung = await ladeEin(ownerToken, orgId, email('zweimal-gast'));

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: einladung.token })
        .expect(200);

      // 404 mit derselben Meldung wie ein erfundener Token: Ein Angreifer soll
      // nicht erfahren, dass dieser Token einmal echt war.
      const antwort = await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: einladung.token })
        .expect(404);

      expect((antwort.body as FehlerAntwort).message).toBe(
        'Einladung ungültig',
      );
    });

    it('antwortet auf einen erfundenen Token mit derselben Meldung', async () => {
      const gast = await meldeAn('erfunden');

      const antwort = await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: 'voellig-ausgedacht-und-nie-vergeben' })
        .expect(404);

      // Wortgleich mit dem Test darueber - genau darum geht es.
      expect((antwort.body as FehlerAntwort).message).toBe(
        'Einladung ungültig',
      );
    });

    it('weist eine abgelaufene Einladung mit 400 ab', async () => {
      const { ownerToken, orgId } = await baueOrganisation('abgelaufen');
      const gast = await meldeAn('abgelaufen-gast');
      const einladung = await ladeEin(
        ownerToken,
        orgId,
        email('abgelaufen-gast'),
      );

      // Ablaufdatum in die Vergangenheit setzen, statt sieben Tage zu warten.
      await prisma.invitation.update({
        where: { id: einladung.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const antwort = await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${gast}`)
        .send({ token: einladung.token })
        .expect(400);

      // Eigene Meldung, anders als bei "ungueltig": Wer eine echte,
      // abgelaufene Einladung hat, kennt sie ohnehin - ihm ist mit
      // "ungueltig" nicht geholfen. Verraten wird nichts Neues.
      expect((antwort.body as FehlerAntwort).message).toContain('abgelaufen');
    });

    /**
     * Der Fall, der eine Rechte-Herabstufung ermoeglicht haette: Ein ADMIN
     * laedt den OWNER als MEMBER ein. Nimmt der die Einladung versehentlich
     * an, duerfte seine Rolle NICHT ueberschrieben werden.
     */
    it('ueberschreibt eine bestehende Mitgliedschaft nicht (409)', async () => {
      const { ownerToken, orgId } = await baueOrganisation('bereits');
      const einladung = await ladeEin(
        ownerToken,
        orgId,
        email('bereits-owner'),
        'MEMBER',
      );

      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ token: einladung.token })
        .expect(409);

      const unveraendert = await prisma.membership.findFirstOrThrow({
        where: { organizationId: orgId },
        select: { role: true },
      });
      expect(unveraendert.role).toBe('OWNER');
    });

    it('antwortet ohne Access-Token mit 401', async () => {
      await request(app.getHttpServer())
        .post('/invitations/accept')
        .send({ token: 'egal' })
        .expect(401);
    });
  });
});
