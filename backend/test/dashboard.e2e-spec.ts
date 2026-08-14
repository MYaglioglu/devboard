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

interface LoginAntwort {
  accessToken: string;
}

interface Kennzahlen {
  projects: { active: number; archived: number };
  tasks: { todo: number; inProgress: number; done: number; open: number };
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (k: string) => `e2e-dash-${k}-${lauf}@example.com`;
  const orgName = (k: string) => `E2E DASH ${k} ${lauf}`;

  beforeAll(async () => {
    const modul: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modul.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
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

  const baueAufbau = async (k: string) => {
    const token = await meldeAn(k);

    const org = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: orgName(k) })
      .expect(201);

    return { token, orgId: (org.body as MitId).id };
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

    return (antwort.body as MitId).id;
  };

  const legeAufgabeAn = async (
    token: string,
    orgId: string,
    projektId: string,
    titel: string,
    status?: string,
  ): Promise<void> => {
    await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projektId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: titel, ...(status ? { status } : {}) })
      .expect(201);
  };

  const stats = async (token: string, orgId: string): Promise<Kennzahlen> => {
    const antwort = await request(app.getHttpServer())
      .get(`/organizations/${orgId}/dashboard/stats`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return antwort.body as Kennzahlen;
  };

  /**
   * Der Test, der die leere Organisation prueft - und dabei einen Fall
   * abdeckt, den `groupBy` still falsch beantworten wuerde.
   *
   * Fehlt ein Status GANZ, liefert `groupBy` dafuer keine Zeile - nicht etwa
   * eine mit 0. Ohne den Rueckfall auf 0 im Service waere die Antwort hier
   * `undefined`, und im JSON fehlte das Feld einfach. Das Frontend zeigte
   * dann eine leere Kachel statt einer Null.
   */
  it('liefert Nullen fuer eine leere Organisation', async () => {
    const { token, orgId } = await baueAufbau('leer');

    expect(await stats(token, orgId)).toEqual({
      projects: { active: 0, archived: 0 },
      tasks: { todo: 0, inProgress: 0, done: 0, open: 0 },
    });
  });

  it('zaehlt Aufgaben nach Status und leitet die offenen ab', async () => {
    const { token, orgId } = await baueAufbau('zaehlen');
    const projekt = await legeProjektAn(token, orgId, 'Erstes');

    await legeAufgabeAn(token, orgId, projekt, 'Offen eins');
    await legeAufgabeAn(token, orgId, projekt, 'Offen zwei');
    await legeAufgabeAn(token, orgId, projekt, 'In Arbeit', 'IN_PROGRESS');
    await legeAufgabeAn(token, orgId, projekt, 'Fertig', 'DONE');

    const zahlen = await stats(token, orgId);

    expect(zahlen.projects).toEqual({ active: 1, archived: 0 });
    expect(zahlen.tasks).toEqual({
      todo: 2,
      inProgress: 1,
      done: 1,
      // Abgeleitet, aber mitgeliefert - sonst stuende dieselbe Rechnung im
      // Frontend noch einmal.
      open: 3,
    });
  });

  /**
   * ==========================================================================
   * DIE FACHLICHE ENTSCHEIDUNG, DIE MAN LEICHT UEBERSIEHT
   * ==========================================================================
   * Aufgaben aus archivierten Projekten zaehlen NICHT mit. Die Kennzahlen
   * beschreiben die laufende Arbeit; sonst bliebe die Zahl offener Aufgaben
   * dauerhaft aufgeblaeht, obwohl niemand mehr daran arbeitet.
   *
   * Das ist keine technische Frage, sondern eine Festlegung - und genau
   * deshalb gehoert sie in einen Test. Ohne ihn koennte jemand den Filter
   * spaeter entfernen, ohne dass etwas rot wird.
   */
  it('laesst Aufgaben aus archivierten Projekten aus', async () => {
    const { token, orgId } = await baueAufbau('archiv');
    const laufend = await legeProjektAn(token, orgId, 'Laufend');
    const alt = await legeProjektAn(token, orgId, 'Alt');

    await legeAufgabeAn(token, orgId, laufend, 'Zaehlt mit');
    await legeAufgabeAn(token, orgId, alt, 'Zaehlt nicht mehr');

    await request(app.getHttpServer())
      .delete(`/organizations/${orgId}/projects/${alt}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const zahlen = await stats(token, orgId);

    expect(zahlen.projects).toEqual({ active: 1, archived: 1 });
    expect(zahlen.tasks.todo).toBe(1);
  });

  /**
   * Der negative Test, der ab Sprint 2 Pflicht ist - und hier besonders
   * wichtig: Bei einer AGGREGATION faellt ein fehlender Mandantenfilter nicht
   * auf, weil das Ergebnis eine Zahl ist und keine fremde Zeile. Man saehe
   * kein fremdes Projekt, nur eine zu grosse Summe. Ein Leck, das wie ein
   * Rundungsfehler aussieht.
   */
  it('zaehlt keine Daten aus einer fremden Organisation mit', async () => {
    const eigen = await baueAufbau('eigen');
    const fremd = await baueAufbau('fremd');

    const fremdesProjekt = await legeProjektAn(
      fremd.token,
      fremd.orgId,
      'Fremd',
    );
    await legeAufgabeAn(fremd.token, fremd.orgId, fremdesProjekt, 'Fremde');
    await legeAufgabeAn(fremd.token, fremd.orgId, fremdesProjekt, 'Aufgaben');

    // Die eigene Organisation ist leer - und muss es in den Zahlen bleiben.
    expect(await stats(eigen.token, eigen.orgId)).toEqual({
      projects: { active: 0, archived: 0 },
      tasks: { todo: 0, inProgress: 0, done: 0, open: 0 },
    });
  });

  it('meldet 404 fuer eine fremde Organisation', async () => {
    const opfer = await baueAufbau('opfer');
    const fremderToken = await meldeAn('eindringling');

    await request(app.getHttpServer())
      .get(`/organizations/${opfer.orgId}/dashboard/stats`)
      .set('Authorization', `Bearer ${fremderToken}`)
      .expect(404);
  });
});
