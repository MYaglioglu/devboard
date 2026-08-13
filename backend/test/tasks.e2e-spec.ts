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
}

interface AufgabeAntwort {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  position: string;
  version: number;
  assignee: { userId: string; name: string | null; email: string } | null;
  dueDate: string | null;
}

interface LoginAntwort {
  accessToken: string;
}

describe('Tasks (e2e)', () => {
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
  const email = (kennung: string) => `e2e-task-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E TASK ${kennung} ${lauf}`;

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
  ): Promise<string> => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return (antwort.body as ProjektAntwort).id;
  };

  /** Organisation mit OWNER und MEMBER, dazu ein leeres Projekt. */
  const baueAufbau = async (kennung: string) => {
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

    const projektId = await legeProjektAn(ownerToken, orgId, 'Board');

    return {
      orgId,
      projektId,
      ownerToken,
      memberToken,
      memberUserId: mitglied.id,
    };
  };

  const pfad = (orgId: string, projektId: string) =>
    `/organizations/${orgId}/projects/${projektId}/tasks`;

  const legeAufgabeAn = async (
    token: string,
    orgId: string,
    projektId: string,
    koerper: Record<string, unknown>,
  ): Promise<AufgabeAntwort> => {
    const antwort = await request(app.getHttpServer())
      .post(pfad(orgId, projektId))
      .set('Authorization', `Bearer ${token}`)
      .send(koerper)
      .expect(201);

    return antwort.body as AufgabeAntwort;
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
    // Tasks haengen per Cascade am Projekt, Projekte an der Organisation.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST .../tasks', () => {
    it('legt eine Aufgabe an, standardmaessig in TODO', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('anlegen');

      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Erste Aufgabe',
      });

      expect(aufgabe.title).toBe('Erste Aufgabe');
      expect(aufgabe.status).toBe('TODO');
      expect(aufgabe.assignee).toBeNull();
      expect(aufgabe.version).toBe(0);
    });

    /**
     * Aufgaben sind die ARBEIT, nicht die Struktur - deshalb darf sie jedes
     * Mitglied anlegen, anders als bei Projekten.
     */
    it('erlaubt auch einem MEMBER das Anlegen', async () => {
      const { orgId, projektId, memberToken } = await baueAufbau('rolle');

      await legeAufgabeAn(memberToken, orgId, projektId, {
        title: 'Von einem MEMBER',
      });
    });

    it('haengt neue Aufgaben unten an', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('reihenfolge');

      const erste = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Eins',
      });
      const zweite = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Zwei',
      });

      expect(Number(zweite.position)).toBeGreaterThan(Number(erste.position));
    });

    it('zaehlt die Spalten getrennt', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('spalten');

      const todo = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Offen',
      });
      const inArbeit = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Laeuft',
        status: 'IN_PROGRESS',
      });

      // Beide sind die erste Karte IHRER Spalte, also dieselbe Position.
      expect(inArbeit.position).toBe(todo.position);
    });

    it('lehnt einen unbekannten Status mit 400 ab', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('status');

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Falscher Status', status: 'ERLEDIGT' })
        .expect(400);
    });

    it('legt nichts in einem Projekt einer fremden Organisation an', async () => {
      const { orgId, ownerToken } = await baueAufbau('quer-post');

      const fremdToken = await meldeAn('quer-post-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('quer-post-f'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremd',
      );

      // Die eigene Organisation im Pfad (der Guard laesst durch), aber ein
      // Projekt, das dazu nicht gehoert.
      await request(app.getHttpServer())
        .post(pfad(orgId, fremdesProjekt))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Untergeschoben' })
        .expect(404);
    });

    it('legt nichts in einem archivierten Projekt an', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('archiviert');

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/projects/${projektId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Zu spaet' })
        .expect(404);
    });
  });

  describe('Zuweisung', () => {
    it('weist einem Mitglied zu und liefert dessen Namen mit', async () => {
      const { orgId, projektId, ownerToken, memberUserId } =
        await baueAufbau('zuweisen');

      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Zugewiesen',
        assigneeId: memberUserId,
      });

      expect(aufgabe.assignee?.userId).toBe(memberUserId);
      expect(aufgabe.assignee?.email).toContain('zuweisen-member');
    });

    /**
     * ========================================================================
     * DIE REGEL DIESER SCHEIBE
     * ========================================================================
     * Der Nutzer existiert, er ist nur nicht Mitglied DIESER Organisation.
     * 400, nicht 404: Die Aufgabe gibt es sehr wohl, der Client hat etwas
     * Ungueltiges geschickt.
     */
    it('lehnt die Zuweisung an ein Nichtmitglied mit 400 ab', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('fremdzuw');

      await meldeAn('fremdzuw-aussen');
      const aussenstehender = await prisma.user.findUniqueOrThrow({
        where: { email: email('fremdzuw-aussen') },
        select: { id: true },
      });

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Fremdzuweisung', assigneeId: aussenstehender.id })
        .expect(400);
    });

    it('entfernt die Zuweisung bei null', async () => {
      const { orgId, projektId, ownerToken, memberUserId } =
        await baueAufbau('abziehen');

      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Wird frei',
        assigneeId: memberUserId,
      });

      const antwort = await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assigneeId: null })
        .expect(200);

      expect((antwort.body as AufgabeAntwort).assignee).toBeNull();
    });

    /**
     * Der Gewinn des Fremdschluessels auf `memberships`: Die Datenbank raeumt
     * die Zuweisung selbst weg. Kein Codepfad kann das vergessen.
     */
    it('loest die Zuweisung, wenn das Mitglied die Organisation verlaesst', async () => {
      const { orgId, projektId, ownerToken, memberUserId } =
        await baueAufbau('austritt');

      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Bleibt bestehen',
        assigneeId: memberUserId,
      });

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/members/${memberUserId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const antwort = await request(app.getHttpServer())
        .get(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const danach = antwort.body as AufgabeAntwort;
      // Die AUFGABE bleibt - nur unzugewiesen. Das ist SET NULL statt CASCADE.
      expect(danach.id).toBe(aufgabe.id);
      expect(danach.assignee).toBeNull();
    });
  });

  describe('GET .../tasks', () => {
    it('liefert die Aufgaben nach Spalte und Position sortiert', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('liste');

      await legeAufgabeAn(ownerToken, orgId, projektId, { title: 'Offen 1' });
      await legeAufgabeAn(ownerToken, orgId, projektId, { title: 'Offen 2' });
      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Fertig',
        status: 'DONE',
      });

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const aufgaben = antwort.body as AufgabeAntwort[];
      expect(aufgaben.map((a) => a.title)).toEqual([
        'Offen 1',
        'Offen 2',
        'Fertig',
      ]);
    });

    it('zeigt keine Aufgaben aus einem fremden Projekt', async () => {
      const { orgId, ownerToken } = await baueAufbau('quer-get');

      const fremdToken = await meldeAn('quer-get-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('quer-get-f'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremd',
      );
      await legeAufgabeAn(fremdToken, fremdeOrgId, fremdesProjekt, {
        title: 'Geheim',
      });

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, fremdesProjekt))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Leere Liste statt fremder Daten. Kein 404, weil eine leere Liste
      // keine Auskunft darueber gibt, ob es das Projekt gibt.
      expect(antwort.body as AufgabeAntwort[]).toHaveLength(0);
    });

    /**
     * ========================================================================
     * DIE GENAUIGKEIT ÜBER DEN GESAMTEN WEG
     * ========================================================================
     * Datenbank -> Prisma -> Service -> JSON -> Testcode. Waere `position` an
     * irgendeiner Stelle eine JavaScript-Zahl, kaeme hier ein gerundeter Wert
     * an - 30 Nachkommastellen passen nicht in ein float64.
     */
    it('haelt die Position ueber den ganzen Transportweg genau', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('praezision');

      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Genau',
      });

      // Ein Wert, den float64 nicht darstellen kann.
      const genau = '1000.000000000000000000000000000001';
      await prisma.task.update({
        where: { id: aufgabe.id },
        data: { position: genau },
      });

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const geladen = (antwort.body as AufgabeAntwort[])[0];
      expect(typeof geladen.position).toBe('string');
      expect(geladen.position).toBe(genau);
    });
  });

  describe('PATCH .../tasks/:taskId', () => {
    it('aendert den Titel', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('patch');
      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Alt',
      });

      const antwort = await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Neu' })
        .expect(200);

      expect((antwort.body as AufgabeAntwort).title).toBe('Neu');
    });

    /**
     * Status und Position gehoeren zusammen und bekommen in Scheibe 3.4 einen
     * eigenen Endpoint. Ueber PATCH duerfen sie NICHT gehen - sonst gaebe es
     * einen zweiten Weg zum Verschieben, diesmal ohne Konfliktbehandlung.
     */
    it('ignoriert status und position im Koerper', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('patch-lage');
      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Bleibt liegen',
      });

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Umbenannt', status: 'DONE', position: '5' })
        .expect(200);

      const zeile = await prisma.task.findUniqueOrThrow({
        where: { id: aufgabe.id },
        select: { status: true, position: true, title: true },
      });

      expect(zeile.title).toBe('Umbenannt');
      expect(zeile.status).toBe('TODO');
      expect(zeile.position.toString()).toBe(aufgabe.position);
    });

    it('lehnt eine leere Aenderung mit 400 ab', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('patch-leer');
      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Unveraendert',
      });

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    it('aendert keine Aufgabe aus einem fremden Projekt', async () => {
      const { orgId, ownerToken } = await baueAufbau('patch-quer');

      const fremdToken = await meldeAn('patch-quer-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('patch-quer-f'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremd',
      );
      const fremdeAufgabe = await legeAufgabeAn(
        fremdToken,
        fremdeOrgId,
        fremdesProjekt,
        { title: 'Unantastbar' },
      );

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, fremdesProjekt)}/${fremdeAufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Uebernommen' })
        .expect(404);

      const unveraendert = await prisma.task.findUniqueOrThrow({
        where: { id: fremdeAufgabe.id },
        select: { title: true },
      });
      expect(unveraendert.title).toBe('Unantastbar');
    });
  });

  describe('DELETE .../tasks/:taskId', () => {
    it('loescht die Aufgabe wirklich', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('loeschen');
      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Weg damit',
      });

      await request(app.getHttpServer())
        .delete(`${pfad(orgId, projektId)}/${aufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const zeile = await prisma.task.findUnique({
        where: { id: aufgabe.id },
        select: { id: true },
      });
      expect(zeile).toBeNull();
    });

    it('antwortet beim zweiten Aufruf mit 404', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('loesch-2');
      const aufgabe = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Einmal',
      });

      const ziel = `${pfad(orgId, projektId)}/${aufgabe.id}`;

      await request(app.getHttpServer())
        .delete(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('loescht keine Aufgabe aus einem fremden Projekt', async () => {
      const { orgId, ownerToken } = await baueAufbau('loesch-quer');

      const fremdToken = await meldeAn('loesch-quer-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('loesch-quer-f'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremd',
      );
      const fremdeAufgabe = await legeAufgabeAn(
        fremdToken,
        fremdeOrgId,
        fremdesProjekt,
        { title: 'Bleibt' },
      );

      await request(app.getHttpServer())
        .delete(`${pfad(orgId, fremdesProjekt)}/${fremdeAufgabe.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);

      const zeile = await prisma.task.findUnique({
        where: { id: fremdeAufgabe.id },
        select: { id: true },
      });
      expect(zeile).not.toBeNull();
    });
  });
});
