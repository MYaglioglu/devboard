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

  describe('PATCH .../tasks/:taskId/move', () => {
    /** Die Titel in Board-Reihenfolge - so, wie das Frontend sie sähe. */
    const reihenfolge = async (
      token: string,
      orgId: string,
      projektId: string,
    ): Promise<string[]> => {
      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return (antwort.body as AufgabeAntwort[]).map((a) => a.title);
    };

    /** Drei Karten in TODO: A, B, C. */
    const dreiKarten = async (kennung: string) => {
      const aufbau = await baueAufbau(kennung);
      const { orgId, projektId, ownerToken } = aufbau;

      // Zweizeichige Titel sind das Minimum laut create-task.dto.ts - mit
      // 'A' schlaegt schon das Anlegen mit 400 fehl.
      const a = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Karte A',
      });
      const b = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Karte B',
      });
      const c = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Karte C',
      });

      return { ...aufbau, a, b, c };
    };

    it('schiebt eine Karte innerhalb der Spalte nach oben', async () => {
      const { orgId, projektId, ownerToken, a, c } =
        await dreiKarten('schieben');

      // C ganz nach oben: kein Vorgaenger, A als Nachfolger.
      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: null,
          nextId: a.id,
          version: c.version,
        })
        .expect(200);

      expect(await reihenfolge(ownerToken, orgId, projektId)).toEqual([
        'Karte C',
        'Karte A',
        'Karte B',
      ]);
    });

    it('schiebt eine Karte zwischen zwei andere', async () => {
      const { orgId, projektId, ownerToken, a, b, c } =
        await dreiKarten('dazwischen');

      // C zwischen A und B.
      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: a.id,
          nextId: b.id,
          version: c.version,
        })
        .expect(200);

      expect(await reihenfolge(ownerToken, orgId, projektId)).toEqual([
        'Karte A',
        'Karte C',
        'Karte B',
      ]);
    });

    it('wechselt die Spalte und zaehlt die Version hoch', async () => {
      const { orgId, projektId, ownerToken, b } = await dreiKarten('spalte');

      const antwort = await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${b.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'IN_PROGRESS',
          previousId: null,
          nextId: null,
          version: b.version,
        })
        .expect(200);

      const verschoben = antwort.body as AufgabeAntwort;
      expect(verschoben.status).toBe('IN_PROGRESS');
      expect(verschoben.version).toBe(b.version + 1);
    });

    /**
     * ========================================================================
     * DER KONFLIKT - UND WARUM ER SICH HIER ERZWINGEN LAESST
     * ========================================================================
     * In Sprint 2 ist ein Nebenlaeufigkeitstest aufgefallen, der nichts
     * bewacht hat: `Promise.all` mit zwei Anfragen erzeugt keine
     * Verschraenkung, nur die Moeglichkeit einer. Beim optimistischen Sperren
     * ist das anders - und zwar grundsaetzlich:
     *
     * Der Konflikt haengt NICHT am Zeitverhalten, sondern an der Version. Zwei
     * Anfragen mit derselben gelesenen Version sind genau das, was zwei
     * gleichzeitig ladende Nutzer erzeugen - unabhaengig davon, wann sie
     * abschicken. Der Test kann sie deshalb nacheinander stellen und trotzdem
     * exakt den Fall pruefen.
     *
     * Das ist kein Trick, sondern der Vorteil des Verfahrens: Optimistisches
     * Sperren macht einen Nebenlaeufigkeitsfehler DETERMINISTISCH reproduzierbar.
     */
    it('weist die zweite Verschiebung mit derselben Version mit 409 ab', async () => {
      const { orgId, projektId, ownerToken, a, b, c } =
        await dreiKarten('konflikt');

      const ziel = `${pfad(orgId, projektId)}/${c.id}/move`;

      // Nutzer 1: C zwischen A und B.
      await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: a.id,
          nextId: b.id,
          version: c.version,
        })
        .expect(200);

      // Nutzer 2 hatte dasselbe Board geladen und schiebt C nach ganz oben -
      // mit der Version, die er beim Laden gesehen hat.
      const antwort = await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: null,
          nextId: a.id,
          version: c.version,
        })
        .expect(409);

      expect((antwort.body as { message: string }).message).toContain(
        'inzwischen geändert',
      );

      // Und der Stand von Nutzer 1 steht unveraendert - die abgewiesene
      // Anfrage hat NICHTS geschrieben.
      expect(await reihenfolge(ownerToken, orgId, projektId)).toEqual([
        'Karte A',
        'Karte C',
        'Karte B',
      ]);
    });

    it('laesst dieselbe Verschiebung mit der neuen Version zu', async () => {
      const { orgId, projektId, ownerToken, a, c } =
        await dreiKarten('nachladen');

      const ziel = `${pfad(orgId, projektId)}/${c.id}/move`;

      const erste = await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: null,
          nextId: a.id,
          version: c.version,
        })
        .expect(200);

      // Nach dem Neuladen kennt der Client die neue Version - der zweite
      // Versuch gelingt. Genau das soll das Frontend nach einem 409 tun.
      await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'DONE',
          previousId: null,
          nextId: null,
          version: (erste.body as AufgabeAntwort).version,
        })
        .expect(200);
    });

    /**
     * ========================================================================
     * DIE ERSCHOEPFTE SPALTE - DER GRENZFALL DES VERFAHRENS
     * ========================================================================
     * Statt 30-mal zu verschieben, wird der Zustand direkt hergestellt: zwei
     * Nachbarn, deren Abstand kleiner ist als das, was numeric(65,30) noch
     * auflöst. Der Mittelwert braeuchte 31 Nachkommastellen.
     *
     * Erwartet wird KEIN Fehler, sondern eine Neuverteilung: Danach stehen
     * wieder ganze Zahlen da, die Reihenfolge stimmt, und die verschobene
     * Karte liegt an der gewuenschten Stelle.
     */
    it('verteilt die Spalte neu, wenn die Genauigkeit erschoepft ist', async () => {
      const { orgId, projektId, ownerToken, a, b, c } =
        await dreiKarten('neuverteilung');

      // A und B ruecken so eng zusammen, dass zwischen ihnen kein
      // darstellbarer Wert mehr liegt.
      await prisma.task.update({
        where: { id: a.id },
        data: { position: '1000' },
      });
      await prisma.task.update({
        where: { id: b.id },
        data: { position: '1000.000000000000000000000000000001' },
      });

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: a.id,
          nextId: b.id,
          version: c.version,
        })
        .expect(200);

      expect(await reihenfolge(ownerToken, orgId, projektId)).toEqual([
        'Karte A',
        'Karte C',
        'Karte B',
      ]);

      // Nach der Neuverteilung sind die Abstaende wieder gross genug, dass
      // erneut geteilt werden kann - sonst liefe die naechste Anfrage direkt
      // wieder hinein.
      const positionen = await prisma.task.findMany({
        where: { projectId: projektId, status: 'TODO' },
        orderBy: { position: 'asc' },
        select: { position: true },
      });

      const abstaende = positionen
        .slice(1)
        .map((p, i) => p.position.minus(positionen[i].position));

      for (const abstand of abstaende) {
        expect(abstand.greaterThan(1)).toBe(true);
      }
    });

    it('lehnt einen Nachbarn aus einer anderen Spalte mit 400 ab', async () => {
      const { orgId, projektId, ownerToken, a, c } =
        await dreiKarten('falsche-spalte');

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          // A liegt in TODO, nicht in DONE.
          status: 'DONE',
          previousId: a.id,
          nextId: null,
          version: c.version,
        })
        .expect(400);
    });

    it('lehnt Nachbarn in verkehrter Reihenfolge mit 400 ab', async () => {
      const { orgId, projektId, ownerToken, a, b, c } =
        await dreiKarten('verkehrt');

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          // Vertauscht: B liegt hinter A, nicht davor.
          previousId: b.id,
          nextId: a.id,
          version: c.version,
        })
        .expect(400);
    });

    it('lehnt die Karte als ihren eigenen Nachbarn mit 400 ab', async () => {
      const { orgId, projektId, ownerToken, c } = await dreiKarten('selbst');

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'TODO',
          previousId: c.id,
          nextId: null,
          version: c.version,
        })
        .expect(400);
    });

    it('verlangt die Version', async () => {
      const { orgId, projektId, ownerToken, c } = await dreiKarten('ohne-ver');

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'DONE', previousId: null, nextId: null })
        .expect(400);
    });

    it('verschiebt keine Aufgabe aus einem fremden Projekt', async () => {
      const { orgId, ownerToken } = await baueAufbau('move-quer');

      const fremdToken = await meldeAn('move-quer-fremd');
      const fremdeOrgId = await legeOrgAn(fremdToken, orgName('move-quer-f'));
      const fremdesProjekt = await legeProjektAn(
        fremdToken,
        fremdeOrgId,
        'Fremd',
      );
      const fremdeAufgabe = await legeAufgabeAn(
        fremdToken,
        fremdeOrgId,
        fremdesProjekt,
        { title: 'Bleibt liegen' },
      );

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, fremdesProjekt)}/${fremdeAufgabe.id}/move`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'DONE',
          previousId: null,
          nextId: null,
          version: fremdeAufgabe.version,
        })
        .expect(404);

      const zeile = await prisma.task.findUniqueOrThrow({
        where: { id: fremdeAufgabe.id },
        select: { status: true, version: true },
      });
      expect(zeile.status).toBe('TODO');
      expect(zeile.version).toBe(0);
    });

    it('erlaubt auch einem MEMBER das Verschieben', async () => {
      const { orgId, projektId, memberToken, c } = await dreiKarten('m-move');

      await request(app.getHttpServer())
        .patch(`${pfad(orgId, projektId)}/${c.id}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          status: 'IN_PROGRESS',
          previousId: null,
          nextId: null,
          version: c.version,
        })
        .expect(200);
    });
  });
});
