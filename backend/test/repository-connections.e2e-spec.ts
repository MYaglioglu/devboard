import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { entschluessele, leseSchluessel } from './../src/webhooks/krypto';

interface OrganisationAntwort {
  id: string;
}

interface ProjektAntwort {
  id: string;
}

interface LoginAntwort {
  accessToken: string;
}

interface VerbindungAntwort {
  id: string;
  repositoryFullName: string;
  webhookUrl: string;
  createdAt: string;
}

interface VerbindungMitGeheimnisAntwort extends VerbindungAntwort {
  geheimnis: string;
}

describe('RepositoryConnections (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Eigene Kennung je Lauf UND je Suite - siehe projects.e2e-spec.ts.
  // `Date.now()` allein genuegt nicht, weil die Suiten parallel starten.
  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (kennung: string) => `e2e-repo-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E REPO ${kennung} ${lauf}`;

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

  const legeProjektAn = async (token: string, orgId: string) => {
    const antwort = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Projekt ${randomUUID().slice(0, 8)}` })
      .expect(201);

    return (antwort.body as ProjektAntwort).id;
  };

  /** Organisation mit OWNER, zusaetzlichem MEMBER und einem Projekt. */
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

    const projektId = await legeProjektAn(ownerToken, orgId);

    return { orgId, projektId, ownerToken, memberToken };
  };

  const pfad = (orgId: string, projektId: string) =>
    `/organizations/${orgId}/projects/${projektId}/repository`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Verbindungen haengen per Cascade am Projekt, Projekte an der
    // Organisation. Es genuegt also, die Organisation zu loeschen.
    await prisma.organization.deleteMany({
      where: { name: { contains: ` ${lauf}` } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST .../repository', () => {
    it('verbindet ein Projekt und liefert das Geheimnis genau einmal', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('anlegen');

      const antwort = await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/webshop' })
        .expect(201);

      const verbindung = antwort.body as VerbindungMitGeheimnisAntwort;
      expect(verbindung.repositoryFullName).toBe('acme/webshop');
      expect(verbindung.geheimnis).toMatch(/^[0-9a-f]{64}$/);
      expect(verbindung.webhookUrl).toContain(
        `/webhooks/github/${verbindung.id}`,
      );

      // Und beim LESEN steht es nicht mehr drin - das ist der eigentliche
      // Punkt der Scheibe. Ein Geheimnis, das jeder GET wieder ausliefert,
      // waere kein einmalig angezeigtes.
      const gelesen = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(gelesen.body).not.toHaveProperty('geheimnis');
    });

    /**
     * ========================================================================
     * DER TEST, DER DIE ENTSCHEIDUNG AUS ADR-014 UEBERHAUPT PRUEFT
     * ========================================================================
     * Er greift bewusst an der API vorbei direkt in die Datenbank. Nur dort
     * laesst sich zeigen, was gespeichert wurde - und genau das ist die
     * Zusage: nicht der Klartext, aber auch kein Hash, sondern etwas, das
     * sich mit dem Schluessel WIEDER LESEN laesst.
     *
     * Waere hier ein Hash gespeichert, liefe die Signaturpruefung in Scheibe
     * 5.3 ins Leere - und das faende man ohne diesen Test erst dort.
     */
    it('speichert das Geheimnis verschluesselt und wieder entschluesselbar', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('krypto');

      const antwort = await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/api' })
        .expect(201);

      const { geheimnis } = antwort.body as VerbindungMitGeheimnisAntwort;

      const zeile = await prisma.repositoryConnection.findUniqueOrThrow({
        where: { projectId: projektId },
        select: {
          secretCiphertext: true,
          secretIv: true,
          secretAuthTag: true,
          keyVersion: true,
        },
      });

      // Der Klartext steht nirgends in der Zeile.
      expect(Buffer.from(zeile.secretCiphertext).toString('utf8')).not.toBe(
        geheimnis,
      );
      expect(zeile.keyVersion).toBe(1);

      const schluessel = leseSchluessel(process.env.WEBHOOK_ENCRYPTION_KEY!);

      expect(
        entschluessele(
          {
            ciphertext: zeile.secretCiphertext,
            iv: zeile.secretIv,
            authTag: zeile.secretAuthTag,
          },
          schluessel,
        ),
      ).toBe(geheimnis);
    });

    it('weist eine zweite Verbindung mit 409 ab, statt still zu ueberschreiben', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('doppelt');

      const erste = await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/eins' })
        .expect(201);

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/zwei' })
        .expect(409);

      // Die erste Verbindung ist unveraendert - ein `upsert` haette sie hier
      // still ersetzt und den in GitHub eingetragenen Webhook unbrauchbar
      // gemacht, ohne dass es jemandem auffiele.
      const gelesen = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const verbindung = gelesen.body as VerbindungAntwort;
      expect(verbindung.id).toBe(
        (erste.body as VerbindungMitGeheimnisAntwort).id,
      );
      expect(verbindung.repositoryFullName).toBe('acme/eins');
    });

    it.each([
      ['ohne Schraegstrich', 'nurEinName'],
      ['mit zwei Schraegstrichen', 'a/b/c'],
      ['mit leerem Kontonamen', '/repo'],
      ['mit leerem Repository', 'owner/'],
      ['als ganze URL', 'https://github.com/acme/webshop'],
      ['mit Pfadwechsel', 'acme/..'],
    ])('weist %s mit 400 ab', async (_fall, wert) => {
      // `toLowerCase()` ist hier nicht Kosmetik: `AuthService` speichert
      // E-Mail-Adressen kleingeschrieben (Sprint 1, Normalisierung). Eine
      // Kennung mit Grossbuchstaben faende `findUniqueOrThrow` spaeter nicht
      // wieder - der Test schluege mit "kein Datensatz gefunden" fehl, und
      // die Ursache laege drei Schritte vorher.
      const { orgId, projektId, ownerToken } = await baueTeam(
        `form-${wert.replace(/[^a-z]/gi, '').toLowerCase()}`,
      );

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: wert })
        .expect(400);
    });
  });

  /**
   * ==========================================================================
   * DIE NEGATIVEN TESTS - PFLICHT SEIT SPRINT 2
   * ==========================================================================
   * Der Erfolgspfad oben ist auch dann gruen, wenn der Mandantenfilter fehlt.
   * Erst diese Tests bewachen ihn.
   */
  describe('Mandantentrennung und Rollen', () => {
    it('gibt 404 fuer ein Projekt einer fremden Organisation', async () => {
      const eigen = await baueTeam('fremd-eigen');
      const fremd = await baueTeam('fremd-fremd');

      // Gueltiger Token der EIGENEN Organisation, aber die Projekt-ID gehoert
      // zur fremden. Genau der Fall, den ein `findUnique` auf die Projekt-ID
      // mit anschliessendem Vergleich durchliesse.
      await request(app.getHttpServer())
        .post(pfad(eigen.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${eigen.ownerToken}`)
        .send({ repositoryFullName: 'acme/fremd' })
        .expect(404);

      await request(app.getHttpServer())
        .get(pfad(eigen.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${eigen.ownerToken}`)
        .expect(404);
    });

    it('gibt 404, wenn die Organisation im Pfad eine fremde ist', async () => {
      const eigen = await baueTeam('fremdorg-eigen');
      const fremd = await baueTeam('fremdorg-fremd');

      // Hier greift schon der MitgliedschaftsGuard: keine Mitgliedschaft in
      // der fremden Organisation. 404 und nicht 403 - ein 403 wuerde
      // bestaetigen, dass es die Organisation gibt.
      await request(app.getHttpServer())
        .get(pfad(fremd.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${eigen.ownerToken}`)
        .expect(404);
    });

    it('laesst einen MEMBER lesen', async () => {
      const { orgId, projektId, ownerToken, memberToken } =
        await baueTeam('member-liest');

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/lesbar' })
        .expect(201);

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const verbindung = antwort.body as VerbindungAntwort;
      expect(verbindung.repositoryFullName).toBe('acme/lesbar');
      // Auch fuer ein Mitglied steht das Geheimnis nicht in der Antwort.
      expect(antwort.body).not.toHaveProperty('geheimnis');
    });

    it('gibt 403, wenn ein MEMBER verbinden oder trennen will', async () => {
      const { orgId, projektId, ownerToken, memberToken } =
        await baueTeam('member-schreibt');

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ repositoryFullName: 'acme/verboten' })
        .expect(403);

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/erlaubt' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('gibt 401 ohne Token', async () => {
      const { orgId, projektId } = await baueTeam('ohne-token');

      await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .expect(401);
    });
  });

  describe('GET .../repository', () => {
    it('liefert null, wenn kein Repository verbunden ist', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('leer');

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // `null` und keine 404: Das Projekt gibt es, es hat nur kein
      // Repository. Eine 404 waere mehrdeutig.
      expect(antwort.body).toEqual({});
    });

    it('gibt 400 bei einer unsinnigen Projekt-ID', async () => {
      const { orgId, ownerToken } = await baueTeam('kaputte-id');

      // Ohne Validierung am Rand ginge "abc" bis zur Datenbank durch und
      // ergaebe einen 500er fuer eine schlicht falsche Eingabe.
      await request(app.getHttpServer())
        .get(`/organizations/${orgId}/projects/abc/repository`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('DELETE .../repository', () => {
    it('trennt die Verbindung', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('trennen');

      await request(app.getHttpServer())
        .post(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ repositoryFullName: 'acme/weg' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      const antwort = await request(app.getHttpServer())
        .get(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(antwort.body).toEqual({});
    });

    it('gibt 404, wenn nichts zu trennen ist', async () => {
      const { orgId, projektId, ownerToken } = await baueTeam('nichts-zu-tun');

      await request(app.getHttpServer())
        .delete(pfad(orgId, projektId))
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('trennt nichts in einer fremden Organisation', async () => {
      const eigen = await baueTeam('trenn-eigen');
      const fremd = await baueTeam('trenn-fremd');

      await request(app.getHttpServer())
        .post(pfad(fremd.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${fremd.ownerToken}`)
        .send({ repositoryFullName: 'acme/bleibt' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(pfad(eigen.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${eigen.ownerToken}`)
        .expect(404);

      // Und die fremde Verbindung steht noch. Ohne diese Nachpruefung waere
      // der Test auch dann gruen, wenn `deleteMany` die Zeile geloescht und
      // danach 404 gemeldet haette.
      await request(app.getHttpServer())
        .get(pfad(fremd.orgId, fremd.projektId))
        .set('Authorization', `Bearer ${fremd.ownerToken}`)
        .expect(200)
        .expect((antwort) => {
          expect((antwort.body as VerbindungAntwort).repositoryFullName).toBe(
            'acme/bleibt',
          );
        });
    });
  });
});
