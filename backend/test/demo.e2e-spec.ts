import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DEMO_AUFBEWAHRUNG_STUNDEN } from './../src/auth/demo.service';

interface DemoAntwort {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
}

interface OrganisationAntwort {
  id: string;
  name: string;
}

interface ProjektAntwort {
  id: string;
  name: string;
}

interface AufgabeAntwort {
  id: string;
  title: string;
  status: string;
}

interface FeedSeite {
  items: { type: string }[];
}

/**
 * ============================================================================
 * WAS DIESE SUITE PRUEFT
 * ============================================================================
 * Der Demo-Zugang ist der einzige oeffentliche Endpoint, der ohne jede Angabe
 * des Aufrufers Datensaetze anlegt. Drei Zusagen muessen deshalb belegt sein:
 *
 *   1. Er liefert eine BENUTZBARE Umgebung - nicht nur ein leeres Konto.
 *   2. Zwei Besucher sehen einander NICHT.
 *   3. Abgelaufene Umgebungen verschwinden, nicht abgelaufene NICHT.
 *
 * Punkt 3 braucht beide Haelften. Ein Aufraeumen, das schlicht alles loescht,
 * bestuende die erste Haelfte muehelos.
 */
describe('Demo-Zugang (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Aufgeraeumt wird ueber die IDs der in diesem Lauf erzeugten Demos.
  // Bewusst nicht ueber den Namen "Demo-Organisation": Der ist bei allen
  // gleich, und ein `deleteMany` darauf traefe auch Demos, die parallel in
  // einer anderen Suite oder von Hand entstanden sind.
  const erzeugteNutzer: string[] = [];

  const starteDemo = async (): Promise<DemoAntwort> => {
    const antwort = await request(app.getHttpServer())
      .post('/auth/demo')
      .expect(201);

    const koerper = antwort.body as DemoAntwort;
    erzeugteNutzer.push(koerper.user.id);
    return koerper;
  };

  const organisationVon = async (token: string) => {
    const antwort = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return antwort.body as OrganisationAntwort[];
  };

  beforeAll(async () => {
    const modul: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modul.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Organisationen der Demo-Nutzer ueber ihre Mitgliedschaft finden.
    const mitgliedschaften = await prisma.membership.findMany({
      where: { userId: { in: erzeugteNutzer } },
      select: { organizationId: true },
    });

    await prisma.organization.deleteMany({
      where: { id: { in: mitgliedschaften.map((m) => m.organizationId) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: erzeugteNutzer } } });
    await app.close();
  });

  describe('eine benutzbare Umgebung', () => {
    it('meldet den Besucher sofort an und setzt das Refresh-Cookie', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/demo')
        .expect(201);

      const koerper = antwort.body as DemoAntwort;
      erzeugteNutzer.push(koerper.user.id);

      expect(koerper.accessToken).toEqual(expect.any(String));
      expect(koerper.user.name).toBe('Demo-Besucher');

      // Der Refresh-Token gehoert ins Cookie und NIEMALS in den Koerper -
      // dieselbe Zusage wie beim Login.
      expect(JSON.stringify(koerper)).not.toContain('refreshToken');

      const cookies = antwort.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('devboard_refresh='));
      expect(refresh).toBeDefined();
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toContain('Path=/auth');
    });

    it('liefert eine gefuellte Organisation statt eines leeren Kontos', async () => {
      const { accessToken } = await starteDemo();

      const organisationen = await organisationVon(accessToken);
      expect(organisationen).toHaveLength(1);

      const projekte = await request(app.getHttpServer())
        .get(`/organizations/${organisationen[0].id}/projects`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const alleProjekte = projekte.body as ProjektAntwort[];
      expect(alleProjekte.length).toBeGreaterThanOrEqual(2);

      // Ein Board, auf dem alles in einer Spalte steht, zeigt nichts. Der
      // Nachweis ist deshalb nicht "es gibt Aufgaben", sondern "es gibt
      // Aufgaben in MEHREREN Zustaenden".
      const aufgaben = await request(app.getHttpServer())
        .get(
          `/organizations/${organisationen[0].id}/projects/${alleProjekte[0].id}/tasks`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const zustaende = new Set(
        (aufgaben.body as AufgabeAntwort[]).map((a) => a.status),
      );
      expect(zustaende).toEqual(new Set(['TODO', 'IN_PROGRESS', 'DONE']));
    });

    it('bringt einen Feed mit, der nicht nur aus Anlagen besteht', async () => {
      const { accessToken } = await starteDemo();
      const [organisation] = await organisationVon(accessToken);

      const feed = await request(app.getHttpServer())
        .get(`/organizations/${organisation.id}/activity`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const typen = (feed.body as FeedSeite).items.map((e) => e.type);

      expect(typen).toContain('PROJECT_CREATED');
      expect(typen).toContain('TASK_CREATED');
      // Ohne Verschiebungen saehe der Feed aus wie ein Importprotokoll und
      // nicht wie ein Team, das gearbeitet hat.
      expect(typen).toContain('TASK_MOVED');
    });
  });

  describe('Trennung zwischen zwei Besuchern', () => {
    it('gibt jedem eine eigene Organisation', async () => {
      const ersteDemo = await starteDemo();
      const zweiteDemo = await starteDemo();

      const [ersteOrg] = await organisationVon(ersteDemo.accessToken);
      const [zweiteOrg] = await organisationVon(zweiteDemo.accessToken);

      expect(ersteOrg.id).not.toBe(zweiteOrg.id);
    });

    it('verwehrt den Zugriff auf die Organisation des anderen', async () => {
      const ersteDemo = await starteDemo();
      const zweiteDemo = await starteDemo();

      const [ersteOrg] = await organisationVon(ersteDemo.accessToken);

      // Der negative Test, ohne den der Erfolgspfad nichts aussagt: Mit dem
      // Token der ZWEITEN Demo auf die Organisation der ERSTEN.
      const antwort = await request(app.getHttpServer())
        .get(`/organizations/${ersteOrg.id}/projects`)
        .set('Authorization', `Bearer ${zweiteDemo.accessToken}`);

      expect([403, 404]).toContain(antwort.status);
    });
  });

  describe('Aufraeumen ohne Zeitplaner', () => {
    /**
     * Der Ablauf wird HERGESTELLT, nicht abgewartet: Das Anlagedatum wird
     * zurueckdatiert. Ein Test, der 24 Stunden schlaeft, waere kein Test.
     *
     * Dieselbe Lehre wie bei `Promise.all` in Sprint 2, `Date.now()` in
     * Sprint 3 und der Seitengrenze in Sprint 4 - ein Grenzfall, den man nur
     * wahrscheinlich erreicht, ist nicht geprueft.
     */
    const datiereZurueck = async (nutzerId: string, stunden: number) => {
      const wann = new Date(Date.now() - stunden * 60 * 60 * 1000);

      const mitgliedschaft = await prisma.membership.findFirstOrThrow({
        where: { userId: nutzerId },
        select: { organizationId: true },
      });

      await prisma.organization.update({
        where: { id: mitgliedschaft.organizationId },
        data: { createdAt: wann },
      });
      await prisma.user.update({
        where: { id: nutzerId },
        data: { createdAt: wann },
      });

      return mitgliedschaft.organizationId;
    };

    it('entfernt abgelaufene Umgebungen beim naechsten Start', async () => {
      const alt = await starteDemo();
      const organisationId = await datiereZurueck(
        alt.user.id,
        DEMO_AUFBEWAHRUNG_STUNDEN + 1,
      );

      // Der Ausloeser ist der naechste Demo-Start, nicht ein Zeitplan.
      await starteDemo();

      expect(
        await prisma.organization.findUnique({ where: { id: organisationId } }),
      ).toBeNull();

      // Und das Konto ebenfalls - es haengt NICHT per Cascade an der
      // Organisation. Ohne die zweite Loeschung bliebe hier eine Waise.
      expect(
        await prisma.user.findUnique({ where: { id: alt.user.id } }),
      ).toBeNull();
    });

    it('laesst eine Umgebung stehen, deren Frist noch laeuft', async () => {
      const jung = await starteDemo();
      const organisationId = await datiereZurueck(
        jung.user.id,
        DEMO_AUFBEWAHRUNG_STUNDEN - 1,
      );

      await starteDemo();

      // Die andere Haelfte des Beweises. Ohne sie waere ein Aufraeumen, das
      // schlicht ALLES loescht, von der vorigen Pruefung nicht zu
      // unterscheiden - und es wuerde Besuchern mitten im Ausprobieren die
      // Umgebung wegnehmen.
      expect(
        await prisma.organization.findUnique({ where: { id: organisationId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: jung.user.id } }),
      ).not.toBeNull();
    });

    it('raeumt keine regulaeren Konten weg, auch wenn sie aelter sind', async () => {
      // Der gefaehrlichste Fehler waere eine Bedingung ohne `isDemo`. Sie
      // wuerde alle alten Organisationen loeschen - also genau die echten.
      const email = `e2e-demo-schutz-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'einSicheresPasswort' })
        .expect(201);

      const echterNutzer = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });
      erzeugteNutzer.push(echterNutzer.id);

      await prisma.user.update({
        where: { id: echterNutzer.id },
        data: {
          createdAt: new Date(
            Date.now() - (DEMO_AUFBEWAHRUNG_STUNDEN + 48) * 60 * 60 * 1000,
          ),
        },
      });

      await starteDemo();

      expect(
        await prisma.user.findUnique({ where: { id: echterNutzer.id } }),
      ).not.toBeNull();
    });
  });
});
