import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface OrganisationAntwort {
  id: string;
}

interface ProjektAntwort {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LoginAntwort {
  accessToken: string;
}

interface FehlerAntwort {
  message: string;
  statusCode: number;
}

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Eigene Kennung je Lauf UND je Suite.
  //
  // `Date.now()` allein genuegt NICHT: Die Suiten starten parallel und
  // koennen dieselbe Millisekunde treffen. Das Aufraeumen filtert nur nach
  // dieser Kennung - bei einem Gleichstand loescht die eine Suite die
  // Testdaten der anderen mitten im Lauf. Genau das ist am 13.08.2026
  // passiert, sichtbar als Fremdschluesselverletzung in einer fremden Datei.
  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (kennung: string) => `e2e-prj-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E PRJ ${kennung} ${lauf}`;

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

  const legeOrgAn = async (token: string, name: string): Promise<string> => {
    const antwort = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return (antwort.body as OrganisationAntwort).id;
  };

  const legeProjektAn = async (
    token: string,
    orgId: string,
    name: string,
  ): Promise<ProjektAntwort> => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return antwort.body as ProjektAntwort;
  };

  /** Organisation mit OWNER und zusaetzlichem MEMBER. */
  const baueTeam = async (kennung: string) => {
    const ownerToken = await meldeAn(`${kennung}-owner`);
    const memberToken = await meldeAn(`${kennung}-member`);

    const orgId = await legeOrgAn(ownerToken, orgName(kennung));

    const mitglied = await prisma.user.findUniqueOrThrow({
      where: { email: email(`${kennung}-member`) },
      select: { id: true },
    });

    await prisma.membership.create({
      data: { organizationId: orgId, userId: mitglied.id, role: 'MEMBER' },
    });

    return { orgId, ownerToken, memberToken };
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
    // Projekte haengen per Cascade an der Organisation, verschwinden also
    // mit ihr. Die Organisation selbst haengt an nichts - siehe der
    // ausfuehrliche Kommentar in organizations.e2e-spec.ts.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST /organizations/:orgId/projects', () => {
    it('legt ein Projekt an', async () => {
      const { orgId, ownerToken } = await baueTeam('anlegen');

      const antwort = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Relaunch', description: 'Website neu' })
        .expect(201);

      const projekt = antwort.body as ProjektAntwort;
      expect(projekt.name).toBe('Relaunch');
      expect(projekt.description).toBe('Website neu');
      expect(projekt.archivedAt).toBeNull();
    });

    /**
     * Der Mandant kommt aus dem Pfad. Wer ihn zusaetzlich im Koerper
     * mitschickt, darf damit NICHTS bewirken - sonst gaebe es zwei Quellen
     * fuer dieselbe Angabe, und die gepruefte waere nicht mehr die benutzte.
     */
    it('ignoriert eine organizationId im Koerper', async () => {
      const { orgId, ownerToken } = await baueTeam('koerper');
      const fremdToken = await meldeAn('koerper-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('koerper-fremd'));

      const antwort = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Untergeschoben', organizationId: fremdeOrgId })
        .expect(201);

      const { id } = antwort.body as ProjektAntwort;

      const projekt = await prisma.project.findUniqueOrThrow({
        where: { id },
        select: { organizationId: true },
      });

      expect(projekt.organizationId).toBe(orgId);
    });

    it('weist einen MEMBER mit 403 ab', async () => {
      const { orgId, memberToken } = await baueTeam('rolle');

      const antwort = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Nicht erlaubt' })
        .expect(403);

      expect((antwort.body as FehlerAntwort).statusCode).toBe(403);
    });

    it('weist ein Nichtmitglied mit 404 ab, nicht mit 403', async () => {
      const { orgId } = await baueTeam('fremd-post');
      const fremdToken = await meldeAn('fremd-post-nutzer');

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${fremdToken}`)
        .send({ name: 'Fremd' })
        .expect(404);
    });

    it('lehnt einen zu kurzen Namen mit 400 ab', async () => {
      const { orgId, ownerToken } = await baueTeam('validierung');

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: ' a ' })
        .expect(400);
    });
  });

  describe('GET /organizations/:orgId/projects', () => {
    it('zeigt nur die Projekte der eigenen Organisation', async () => {
      const { orgId, ownerToken } = await baueTeam('liste');
      await legeProjektAn(ownerToken, orgId, 'Eigenes');

      const fremdToken = await meldeAn('liste-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('liste-fremd'));
      await legeProjektAn(fremdToken, fremdeOrgId, 'Fremdes');

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const projekte = antwort.body as ProjektAntwort[];
      expect(projekte).toHaveLength(1);
      expect(projekte[0].name).toBe('Eigenes');
    });

    it('ist auch fuer einen MEMBER lesbar', async () => {
      const { orgId, ownerToken, memberToken } = await baueTeam('lesen');
      await legeProjektAn(ownerToken, orgId, 'Sichtbar');

      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(antwort.body as ProjektAntwort[]).toHaveLength(1);
    });

    it('blendet archivierte Projekte aus und zeigt sie auf Anforderung', async () => {
      const { orgId, ownerToken } = await baueTeam('archiv-liste');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Wird archiviert');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const ohne = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(ohne.body as ProjektAntwort[]).toHaveLength(0);

      const mit = await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects?includeArchived=true`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(mit.body as ProjektAntwort[]).toHaveLength(1);
    });
  });

  describe('GET /organizations/:orgId/projects/:projectId', () => {
    /**
     * ========================================================================
     * DER TEST, DER DEN MANDANTENFILTER TATSAECHLICH BEWACHT
     * ========================================================================
     * Die Projekt-ID ist ECHT, die Organisation im Pfad ist die des
     * Anfragenden - er ist dort ordentliches Mitglied, der Guard laesst ihn
     * also durch. Nur gehoert das Projekt zu einer ANDEREN Organisation.
     *
     * Fehlte `organizationId` im `where` des Services, kaeme hier ein fremdes
     * Projekt zurueck und alle Erfolgspfad-Tests blieben trotzdem gruen.
     * Genau das ist die Luecke aus Sprint 2: Die ID im Pfad gehoert nicht
     * automatisch zu der Organisation im Pfad.
     */
    it('findet ein Projekt einer fremden Organisation nicht, obwohl die ID stimmt', async () => {
      const { orgId, ownerToken } = await baueTeam('quer');

      const fremdToken = await meldeAn('quer-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('quer-fremd'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremdes Projekt',
      );

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/${fremdesProjekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('antwortet auf eine unsinnige ID mit 400, nicht mit 500', async () => {
      const { orgId, ownerToken } = await baueTeam('id-format');

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/keine-uuid`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('PATCH /organizations/:orgId/projects/:projectId', () => {
    it('benennt um und entfernt die Beschreibung bei null', async () => {
      const { orgId, ownerToken } = await baueTeam('patch');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Alt');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ description: 'Zuerst gesetzt' })
        .expect(200);

      const antwort = await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Neu', description: null })
        .expect(200);

      const geaendert = antwort.body as ProjektAntwort;
      expect(geaendert.name).toBe('Neu');
      expect(geaendert.description).toBeNull();
    });

    it('lehnt eine leere Aenderung mit 400 ab', async () => {
      const { orgId, ownerToken } = await baueTeam('patch-leer');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Unveraendert');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    /** Dieselbe Luecke wie beim GET - hier beim SCHREIBEN. */
    it('aendert kein Projekt einer fremden Organisation', async () => {
      const { orgId, ownerToken } = await baueTeam('patch-quer');

      const fremdToken = await meldeAn('patch-quer-fremd');
      const fremdeOrgId = await legeOrgAn(
        fremdToken,
        orgName('patch-quer-fremd'),
      );
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Unantastbar',
      );

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${fremdesProjekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Uebernommen' })
        .expect(404);

      const unveraendert = await prisma.project.findUniqueOrThrow({
        where: { id: fremdesProjekt.id },
        select: { name: true },
      });
      expect(unveraendert.name).toBe('Unantastbar');
    });

    it('weist einen MEMBER mit 403 ab', async () => {
      const { orgId, ownerToken, memberToken } = await baueTeam('patch-rolle');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Geschuetzt');

      await request(app.getHttpServer())
        .patch(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Versuch' })
        .expect(403);
    });
  });

  describe('DELETE /organizations/:orgId/projects/:projectId', () => {
    it('archiviert, statt zu loeschen - die Zeile bleibt bestehen', async () => {
      const { orgId, ownerToken } = await baueTeam('archiv');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Verlauf');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/projects/${projekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const zeile = await prisma.project.findUnique({
        where: { id: projekt.id },
        select: { archivedAt: true },
      });

      expect(zeile).not.toBeNull();
      expect(zeile?.archivedAt).not.toBeNull();
    });

    /** Idempotenz: Der zweite Aufruf ist kein Fehler. */
    it('antwortet auch beim zweiten Aufruf mit 204', async () => {
      const { orgId, ownerToken } = await baueTeam('archiv-doppelt');
      const projekt = await legeProjektAn(ownerToken, orgId, 'Doppelt');

      const pfad = `/organizations/${orgId}/projects/${projekt.id}`;

      await request(app.getHttpServer())
        .delete(pfad)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(pfad)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });

    it('archiviert kein Projekt einer fremden Organisation', async () => {
      const { orgId, ownerToken } = await baueTeam('archiv-quer');

      const fremdToken = await meldeAn('archiv-quer-fremd');
      const fremdeOrgId = await legeOrgAn(
        fremdToken,
        orgName('archiv-quer-fremd'),
      );
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Bleibt',
      );

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/projects/${fremdesProjekt.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);

      const zeile = await prisma.project.findUniqueOrThrow({
        where: { id: fremdesProjekt.id },
        select: { archivedAt: true },
      });
      expect(zeile.archivedAt).toBeNull();
    });
  });
});
