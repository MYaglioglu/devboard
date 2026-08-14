import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface MitId {
  id: string;
}

interface AufgabeAntwort extends MitId {
  version: number;
}

interface LoginAntwort {
  accessToken: string;
}

/**
 * ============================================================================
 * WAS DIESE SUITE PRUEFT UND WARUM SIE NICHT DURCH UNIT-TESTS ERSETZBAR IST
 * ============================================================================
 * Die Unit-Tests in projects.service.spec.ts und tasks.service.spec.ts pruefen
 * die FORM: dass ein Eintrag ueber denselben Klienten geschrieben wird wie die
 * fachliche Aenderung. Ihre `$transaction`-Attrappe fuehrt den Rueckruf aber
 * nur aus - sie kann nicht zurueckrollen und weiss nichts von
 * Fremdschluesseln.
 *
 * Hier laeuft eine echte PostgreSQL-Transaktion. Nur hier laesst sich zeigen,
 * dass eine abgewiesene Anfrage KEINE Spur im Feed hinterlaesst - die
 * eigentliche Zusage aus ADR-012.
 *
 * Gelesen wird bewusst direkt ueber Prisma und nicht ueber einen Endpoint: Den
 * gibt es erst in Scheibe 4.3. Eine Scheibe, die auf die naechste wartet, um
 * sich selbst pruefen zu koennen, waere keine vertikale Scheibe mehr.
 */
describe('Activities (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Eigene Kennung je Lauf UND je Suite - siehe tasks.e2e-spec.ts. `Date.now()`
  // allein ist eine Wette auf die Aufloesung der Uhr; genau daran haben sich am
  // 13.08.2026 zwei Suiten gegenseitig die Testdaten geloescht.
  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (k: string) => `e2e-act-${k}-${lauf}@example.com`;
  const orgName = (k: string) => `E2E ACT ${k} ${lauf}`;

  beforeAll(async () => {
    const modul: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modul.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Aktivitaeten haengen per Cascade an der Organisation.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  const meldeAn = async (k: string): Promise<string> => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email(k), password: 'einSicheresPasswort' })
      .expect(201);

    const antwort = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(k), password: 'einSicheresPasswort' })
      .expect(200);

    return (antwort.body as LoginAntwort).accessToken;
  };

  /** Nutzer, Organisation und Projekt - der Aufbau, den jeder Test braucht. */
  const baueAufbau = async (k: string) => {
    const token = await meldeAn(k);

    const org = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: orgName(k) })
      .expect(201);

    const orgId = (org.body as MitId).id;

    const projekt = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Feed-Projekt' })
      .expect(201);

    return { token, orgId, projektId: (projekt.body as MitId).id };
  };

  const aktivitaeten = (orgId: string) =>
    prisma.activity.findMany({
      where: { organizationId: orgId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        type: true,
        actorId: true,
        projectId: true,
        taskId: true,
        payload: true,
      },
    });

  const legeAufgabeAn = async (
    token: string,
    orgId: string,
    projektId: string,
    titel: string,
  ): Promise<AufgabeAntwort> => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projektId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: titel })
      .expect(201);

    return antwort.body as AufgabeAntwort;
  };

  describe('Ereignisse entstehen mit der Aenderung', () => {
    it('protokolliert das Anlegen von Projekt und Aufgabe', async () => {
      const { token, orgId, projektId } = await baueAufbau('anlegen');
      await legeAufgabeAn(token, orgId, projektId, 'Erste Aufgabe');

      const eintraege = await aktivitaeten(orgId);

      expect(eintraege.map((e) => e.type)).toEqual([
        'PROJECT_CREATED',
        'TASK_CREATED',
      ]);
      expect(eintraege[1].projectId).toBe(projektId);
      expect(eintraege[1].payload).toEqual({
        title: 'Erste Aufgabe',
        status: 'TODO',
      });
    });

    it('haelt beim Verschieben den alten und den neuen Status fest', async () => {
      const { token, orgId, projektId } = await baueAufbau('verschieben');
      const aufgabe = await legeAufgabeAn(token, orgId, projektId, 'Wandert');

      await request(app.getHttpServer())
        .patch(
          `/organizations/${orgId}/projects/${projektId}/tasks/${aufgabe.id}/move`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'DONE',
          previousId: null,
          nextId: null,
          version: aufgabe.version,
        })
        .expect(200);

      const eintraege = await aktivitaeten(orgId);
      const verschoben = eintraege.at(-1);

      expect(verschoben?.type).toBe('TASK_MOVED');
      expect(verschoben?.payload).toEqual({
        title: 'Wandert',
        fromStatus: 'TODO',
        toStatus: 'DONE',
      });
    });

    /**
     * Der Eintrag ueberlebt die Aufgabe - und verliert dabei seine Verbindung.
     *
     * `taskId` ist hier von vornherein NULL (siehe ereignisse.ts), der Titel
     * steht im `payload`. Ohne ihn stuende im Feed nur, dass irgendetwas
     * verschwunden ist.
     */
    it('behaelt den Titel einer geloeschten Aufgabe', async () => {
      const { token, orgId, projektId } = await baueAufbau('loeschen');
      const aufgabe = await legeAufgabeAn(token, orgId, projektId, 'Login-Bug');

      await request(app.getHttpServer())
        .delete(
          `/organizations/${orgId}/projects/${projektId}/tasks/${aufgabe.id}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const geloescht = (await aktivitaeten(orgId)).at(-1);

      expect(geloescht?.type).toBe('TASK_DELETED');
      expect(geloescht?.taskId).toBeNull();
      expect(geloescht?.payload).toEqual({ title: 'Login-Bug' });
    });
  });

  describe('Abgewiesene Anfragen hinterlassen nichts', () => {
    /**
     * ========================================================================
     * DER TEST, UM DEN ES IN ADR-012 GEHT
     * ========================================================================
     * Ein 409 beim Verschieben heisst: Es ist NICHTS passiert. Stuende danach
     * "Karte verschoben" im Feed, wuerde er ein Ereignis behaupten, das die
     * Fachdaten nicht kennen - und niemand koennte den Widerspruch aufloesen,
     * weil beide Seiten "recht" haetten.
     *
     * Ein `EventEmitter2`-Listener liefe ausserhalb dieser Transaktion und
     * koennte genau das nicht zusichern.
     */
    it('schreibt nach einem 409 keinen Verschiebe-Eintrag', async () => {
      const { token, orgId, projektId } = await baueAufbau('konflikt');
      const aufgabe = await legeAufgabeAn(token, orgId, projektId, 'Umkaempft');

      const ziel = `/organizations/${orgId}/projects/${projektId}/tasks/${aufgabe.id}/move`;

      // Erste Verschiebung: erfolgreich, erhoeht die Version.
      await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'DONE',
          previousId: null,
          nextId: null,
          version: aufgabe.version,
        })
        .expect(200);

      // Zweite mit der VERALTETEN Version - so, wie ein zweiter Nutzer sie
      // beim Laden gesehen haette.
      await request(app.getHttpServer())
        .patch(ziel)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'TODO',
          previousId: null,
          nextId: null,
          version: aufgabe.version,
        })
        .expect(409);

      const verschiebungen = (await aktivitaeten(orgId)).filter(
        (e) => e.type === 'TASK_MOVED',
      );

      // GENAU eine - die erste. Nicht zwei.
      expect(verschiebungen).toHaveLength(1);
      expect(verschiebungen[0].payload).toEqual({
        title: 'Umkaempft',
        fromStatus: 'TODO',
        toStatus: 'DONE',
      });
    });

    /**
     * Idempotenz gilt seit Sprint 4 auch fuer den Feed: Das zweite DELETE auf
     * dasselbe Projekt hinterlaesst denselben Zustand wie das erste - also
     * auch denselben Feed.
     */
    it('schreibt beim zweiten Archivieren keinen zweiten Eintrag', async () => {
      const { token, orgId, projektId } = await baueAufbau('idempotent');
      const ziel = `/organizations/${orgId}/projects/${projektId}`;

      await request(app.getHttpServer())
        .delete(ziel)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(ziel)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const archiviert = (await aktivitaeten(orgId)).filter(
        (e) => e.type === 'PROJECT_ARCHIVED',
      );

      expect(archiviert).toHaveLength(1);
    });

    /**
     * Der negative Test, der ab Sprint 2 fuer jede neue Ressource Pflicht ist.
     *
     * Eine fremde Organisation bekommt eine 404 vom Guard - und darf auch
     * keinen Eintrag im Feed des fremden Mandanten erzeugen. Der Erfolgspfad
     * waere auch dann gruen, wenn der Mandant im Eintrag aus dem PFAD staende
     * statt aus der geprueften Mitgliedschaft.
     */
    it('erzeugt keinen Eintrag, wenn der Zugriff abgewiesen wird', async () => {
      const opfer = await baueAufbau('opfer');
      const fremderToken = await meldeAn('fremd');

      const vorher = await aktivitaeten(opfer.orgId);

      await request(app.getHttpServer())
        .post(`/organizations/${opfer.orgId}/projects`)
        .set('Authorization', `Bearer ${fremderToken}`)
        .send({ name: 'Eingeschmuggelt' })
        .expect(404);

      expect(await aktivitaeten(opfer.orgId)).toHaveLength(vorher.length);
    });
  });
});
