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
}

interface KalendereintragAntwort {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  version: number;
  dueDate: string;
  assignee: { userId: string; name: string | null; email: string } | null;
  project: { id: string; name: string };
}

interface LoginAntwort {
  accessToken: string;
}

describe('Kalender (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Eigene Kennung je Lauf UND je Suite - siehe tasks.e2e-spec.ts. `Date.now()`
  // allein genuegt nicht, weil die Suiten parallel starten.
  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (kennung: string) => `e2e-kal-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E KAL ${kennung} ${lauf}`;

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

  /** Organisation mit OWNER und MEMBER, dazu ein Projekt. */
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

    const projektId = await legeProjektAn(ownerToken, orgId, 'Termine');

    return { orgId, projektId, ownerToken, memberToken };
  };

  const legeAufgabeAn = async (
    token: string,
    orgId: string,
    projektId: string,
    koerper: Record<string, unknown>,
  ): Promise<string> => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projektId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send(koerper)
      .expect(201);

    return (antwort.body as AufgabeAntwort).id;
  };

  const holeKalender = async (
    token: string,
    orgId: string,
    von: string,
    bis: string,
    erwarteterStatus = 200,
  ): Promise<KalendereintragAntwort[]> => {
    const antwort = await request(app.getHttpServer())
      .get(`/organizations/${orgId}/calendar`)
      .query({ von, bis })
      .set('Authorization', `Bearer ${token}`)
      .expect(erwarteterStatus);

    return antwort.body as KalendereintragAntwort[];
  };

  // Ein fester Zeitraum statt "heute plus dreissig Tage": Ein Test, dessen
  // Erwartung von der Uhr abhaengt, prueft die Grenze nur WAHRSCHEINLICH. Die
  // Lehre steht seit Sprint 4 dreimal im Projekt.
  const SEPTEMBER_ANFANG = '2026-09-01T00:00:00.000Z';
  const OKTOBER_ANFANG = '2026-10-01T00:00:00.000Z';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('GET .../calendar', () => {
    it('liefert Termine des Zeitraums mit ihrem Projekt', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('inhalt');

      const id = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Abgabe',
        dueDate: '2026-09-15T13:30:00.000Z',
      });

      const eintraege = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      expect(eintraege).toHaveLength(1);
      expect(eintraege[0].id).toBe(id);
      expect(eintraege[0].title).toBe('Abgabe');
      // Der Projektname ist der Grund, aus dem der Kalender einen eigenen
      // Antworttyp hat: Auf demselben Tag liegen Aufgaben aus mehreren
      // Projekten, und ohne Namen sind sie nicht zuzuordnen.
      expect(eintraege[0].project).toEqual({ id: projektId, name: 'Termine' });
      // Die Uhrzeit bleibt erhalten - der Termin ist ein Zeitpunkt, kein Tag.
      expect(eintraege[0].dueDate).toBe('2026-09-15T13:30:00.000Z');
    });

    it('laesst Aufgaben ohne Faelligkeitsdatum weg', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('ohne-datum');

      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Irgendwann',
      });

      const eintraege = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      // Eine Aufgabe ohne Datum ist kein Termin. In SQL ist jeder Vergleich
      // mit NULL unbekannt, also nicht wahr - die Bedingung schliesst sie von
      // selbst aus. Der Test haelt fest, dass wir uns darauf verlassen.
      expect(eintraege).toHaveLength(0);
    });

    it('nimmt den Anfang mit und laesst das Ende aus', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('grenzen');

      // Die Grenzen SELBST, nicht Werte in ihrer Naehe: genau auf
      // 01.09. 00:00:00.000 und genau auf 01.10. 00:00:00.000. Der halboffene
      // Zeitraum ist die Zusage, dass zwei aufeinanderfolgende Monate exakt
      // aneinanderstossen - ohne Luecke und ohne Ueberlappung.
      const amAnfang = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Punkt Anfang',
        dueDate: SEPTEMBER_ANFANG,
      });
      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Punkt Ende',
        dueDate: OKTOBER_ANFANG,
      });

      const september = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      expect(september.map((eintrag) => eintrag.id)).toEqual([amAnfang]);

      // Gegenprobe: Der Termin um Mitternacht ist nicht verloren, er gehoert
      // zum naechsten Monat. Ohne diese zweite Haelfte wuerde der Test eine
      // kaputte Umsetzung durchwinken, die das Ende einfach verschluckt.
      const oktober = await holeKalender(
        ownerToken,
        orgId,
        OKTOBER_ANFANG,
        '2026-11-01T00:00:00.000Z',
      );

      expect(oktober.map((eintrag) => eintrag.title)).toEqual(['Punkt Ende']);
    });

    it('sortiert nach Faelligkeit', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('sortierung');

      const spaet = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Spaet',
        dueDate: '2026-09-20T09:00:00.000Z',
      });
      const frueh = await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Frueh',
        dueDate: '2026-09-02T09:00:00.000Z',
      });

      const eintraege = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      // Angelegt wurde spaet zuerst - die Reihenfolge kommt also nicht aus
      // der Einfuegereihenfolge.
      expect(eintraege.map((eintrag) => eintrag.id)).toEqual([frueh, spaet]);
    });

    it('zeigt Termine aus mehreren Projekten in einer Liste', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('mehrere');

      const zweitesProjekt = await legeProjektAn(ownerToken, orgId, 'Zweites');

      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Aus dem ersten',
        dueDate: '2026-09-10T08:00:00.000Z',
      });
      await legeAufgabeAn(ownerToken, orgId, zweitesProjekt, {
        title: 'Aus dem zweiten',
        dueDate: '2026-09-11T08:00:00.000Z',
      });

      const eintraege = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      // Das ist der ganze Zweck des Endpoints - und der Grund, warum kein
      // :projectId im Pfad steht.
      expect(eintraege.map((eintrag) => eintrag.project.name)).toEqual([
        'Termine',
        'Zweites',
      ]);
    });

    it('laesst Termine archivierter Projekte weg', async () => {
      const { orgId, projektId, ownerToken } = await baueAufbau('archiv');

      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Aus einem abgeschlossenen Projekt',
        dueDate: '2026-09-12T08:00:00.000Z',
      });

      await request(app.getHttpServer())
        .delete(`/organizations/${orgId}/projects/${projektId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const eintraege = await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      // Ein Kalender zeigt, was zu tun ist. Die Frist eines abgeschlossenen
      // Projekts ist Historie - die steht im Feed.
      expect(eintraege).toHaveLength(0);
    });

    it('erlaubt auch einem MEMBER das Lesen', async () => {
      const { orgId, projektId, ownerToken, memberToken } =
        await baueAufbau('rolle');

      await legeAufgabeAn(ownerToken, orgId, projektId, {
        title: 'Fuer alle sichtbar',
        dueDate: '2026-09-14T08:00:00.000Z',
      });

      const eintraege = await holeKalender(
        memberToken,
        orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      expect(eintraege).toHaveLength(1);
    });
  });

  /**
   * ==========================================================================
   * DIE NEGATIVEN TESTS
   * ==========================================================================
   * Der Erfolgspfad oben ist auch dann gruen, wenn der Mandantenfilter ganz
   * fehlt - jede Organisation dieser Suite hat schliesslich nur ihre eigenen
   * Termine. Erst diese beiden Tests bewachen ihn.
   */
  describe('Mandantentrennung', () => {
    it('verweigert den Kalender einer fremden Organisation', async () => {
      const fremd = await baueAufbau('fremd-a');
      const eigen = await baueAufbau('fremd-b');

      // Der Guard greift an :orgId. Wer dort nicht Mitglied ist, kommt nicht
      // bis zum Service.
      await holeKalender(
        eigen.ownerToken,
        fremd.orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
        404,
      );
    });

    it('zeigt im eigenen Kalender keine fremden Termine', async () => {
      const fremd = await baueAufbau('leck-a');
      const eigen = await baueAufbau('leck-b');

      await legeAufgabeAn(fremd.ownerToken, fremd.orgId, fremd.projektId, {
        title: 'Streng geheim',
        dueDate: '2026-09-16T08:00:00.000Z',
      });
      await legeAufgabeAn(eigen.ownerToken, eigen.orgId, eigen.projektId, {
        title: 'Eigener Termin',
        dueDate: '2026-09-16T08:00:00.000Z',
      });

      const eintraege = await holeKalender(
        eigen.ownerToken,
        eigen.orgId,
        SEPTEMBER_ANFANG,
        OKTOBER_ANFANG,
      );

      // Der eigentliche Test: Beide Termine liegen auf demselben Tag im
      // selben Zeitraum. Fehlte `project: { organizationId }` in der
      // WHERE-Bedingung, staende hier beides - und der Erfolgspfad oben
      // haette davon nichts gemerkt.
      expect(eintraege.map((eintrag) => eintrag.title)).toEqual([
        'Eigener Termin',
      ]);
    });
  });

  /**
   * ==========================================================================
   * DIE ZUSICHERUNG DES SCHEMAS, GEPRUEFT STATT ANGENOMMEN
   * ==========================================================================
   * `tasks.organizationId` ist eine Kopie aus `projects`. Was sie ungefaehrlich
   * macht, ist nicht die Sorgfalt des Codes, sondern der zusammengesetzte
   * Fremdschluessel auf `projects(id, organizationId)`.
   *
   * Dieser Test greift deshalb bewusst AN DER API VORBEI direkt auf Prisma zu.
   * Ueber die API laesst sich der Fehler gar nicht ausloesen - der Service
   * schreibt beide Werte aus derselben Quelle. Geprueft werden soll aber nicht
   * der Service, sondern das, was uebrig bleibt, wenn ein kuenftiger Service
   * es falsch macht.
   */
  describe('Zusammengesetzter Fremdschluessel', () => {
    it('verweigert eine Aufgabe, deren Mandant nicht zu ihrem Projekt gehoert', async () => {
      const fremd = await baueAufbau('fk-a');
      const eigen = await baueAufbau('fk-b');

      await expect(
        prisma.task.create({
          data: {
            projectId: fremd.projektId,
            // Die Luege: Das Projekt gehoert zu `fremd`, hier steht `eigen`.
            // Ohne den Fremdschluessel entstuende damit eine Aufgabe, die im
            // Kalender einer fremden Organisation auftaucht - genau der
            // Mandanten-Leck-Fall, nur ueber die Datenschicht statt ueber
            // einen vergessenen Filter.
            organizationId: eigen.orgId,
            title: 'Darf nicht entstehen',
            position: 1000,
          },
        }),
      ).rejects.toThrow();
    });

    it('nimmt dieselbe Aufgabe an, wenn der Mandant passt', async () => {
      const { orgId, projektId } = await baueAufbau('fk-ok');

      // Die Gegenprobe. Ohne sie wuerde der Test oben auch dann gruen sein,
      // wenn `task.create` aus einem voellig anderen Grund scheitert - etwa
      // weil ein Pflichtfeld fehlt.
      const aufgabe = await prisma.task.create({
        data: {
          projectId: projektId,
          organizationId: orgId,
          title: 'Darf entstehen',
          position: 1000,
        },
        select: { id: true },
      });

      expect(aufgabe.id).toBeDefined();
    });
  });

  describe('Zeitraum-Pruefung', () => {
    it('weist eine Anfrage ohne Zeitraum ab', async () => {
      const { orgId, ownerToken } = await baueAufbau('kein-zeitraum');

      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/calendar`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('weist einen zu breiten Zeitraum ab', async () => {
      const { orgId, ownerToken } = await baueAufbau('zu-breit');

      // 93 Tage - eine Millisekunde ueber der Grenze waere fuer einen E2E-Test
      // zu fein; die genaue Grenze prueft kalender-query.spec.ts. Hier geht es
      // darum, dass die Pruefung UEBERHAUPT am Endpoint haengt.
      await holeKalender(
        ownerToken,
        orgId,
        SEPTEMBER_ANFANG,
        '2026-12-03T00:00:00.000Z',
        400,
      );
    });

    it('weist ein Ende vor dem Anfang ab', async () => {
      const { orgId, ownerToken } = await baueAufbau('verdreht');

      await holeKalender(
        ownerToken,
        orgId,
        OKTOBER_ANFANG,
        SEPTEMBER_ANFANG,
        400,
      );
    });
  });
});
