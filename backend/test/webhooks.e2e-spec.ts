import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { erzeugeSignatur } from './../src/webhooks/signatur';

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
  geheimnis: string;
}

describe('Webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const lauf = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = (kennung: string) => `e2e-hook-${kennung}-${lauf}@example.com`;
  const orgName = (kennung: string) => `E2E HOOK ${kennung} ${lauf}`;

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

  /** Legt Organisation, Projekt und Verbindung an und liefert ID plus Geheimnis. */
  const baueVerbindung = async (
    kennung: string,
  ): Promise<VerbindungAntwort> => {
    // Kleingeschrieben, weil der AuthService E-Mail-Adressen normalisiert -
    // eine Kennung mit Grossbuchstaben faende man spaeter nicht wieder.
    const token = await meldeAn(kennung.toLowerCase());

    const org = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: orgName(kennung) })
      .expect(201);

    const orgId = (org.body as OrganisationAntwort).id;

    const projekt = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Projekt ${kennung}` })
      .expect(201);

    const projektId = (projekt.body as ProjektAntwort).id;

    const verbindung = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projektId}/repository`)
      .set('Authorization', `Bearer ${token}`)
      .send({ repositoryFullName: 'acme/webshop' })
      .expect(201);

    return verbindung.body as VerbindungAntwort;
  };

  /** Schickt eine Zustellung so, wie GitHub sie schicken wuerde. */
  const stelleZu = (
    verbindungsId: string,
    rumpf: Buffer,
    signatur: string | undefined,
    kopfzeilen: { ereignis?: string; zustellung?: string } = {},
  ) => {
    const anfrage = request(app.getHttpServer())
      .post(`/webhooks/github/${verbindungsId}`)
      .set('Content-Type', 'application/json');

    if (signatur !== undefined) {
      anfrage.set('X-Hub-Signature-256', signatur);
    }

    if (kopfzeilen.ereignis !== undefined) {
      anfrage.set('X-GitHub-Event', kopfzeilen.ereignis);
    }

    if (kopfzeilen.zustellung !== undefined) {
      anfrage.set('X-GitHub-Delivery', kopfzeilen.zustellung);
    }

    /**
     * ========================================================================
     * WARUM HIER EINE ZEICHENKETTE UEBERGEBEN WIRD UND KEIN BUFFER
     * ========================================================================
     * Beim ersten Lauf waren genau die drei ERFOLGSPFADE rot und alle
     * negativen Tests gruen - ein Muster, das nur eine Ursache haben kann: Die
     * Signatur stimmte nie.
     *
     * Der Grund lag im Testaufbau, nicht im Code. `superagent` serialisiert
     * bei einem JSON-Content-Type auch einen `Buffer` noch einmal selbst - aus
     * unseren Bytes wurde `{"type":"Buffer","data":[123,34,...]}`. Gesendet
     * wurden also ANDERE Bytes als die, ueber die signiert worden war.
     *
     * Eine Zeichenkette reicht `superagent` unveraendert durch. Genau das tut
     * GitHub auch.
     *
     * Das ist dieselbe Falle, um die es in dieser Scheibe inhaltlich geht -
     * ein HMAC ist eine Aussage ueber BYTES, nicht ueber Bedeutung -, nur eine
     * Ebene hoeher. Sie steht deshalb hier als Kommentar und nicht nur in der
     * Behebung.
     */
    return anfrage.send(rumpf.toString('utf8'));
  };

  const nutzlast = (text: string) =>
    Buffer.from(JSON.stringify({ ref: 'refs/heads/main', text }), 'utf8');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // ========================================================================
    // `rawBody: true` MUSS HIER GENAUSO STEHEN WIE IN main.ts
    // ========================================================================
    // Es ist eine Option beim ERZEUGEN der Anwendung, kein Modul. Ohne sie
    // laeuft im Test etwas anderes als in Produktion - genau die Sorte
    // Abweichung, die in Sprint 2 den teuersten Fehler verursacht hat.
    //
    // Falls jemand sie hier vergisst, antwortet der Controller mit einer
    // ausdruecklichen Meldung statt mit "Signatur falsch".
    app = moduleFixture.createNestApplication({ rawBody: true });
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

  describe('POST /webhooks/github/:connectionId', () => {
    it('nimmt eine gueltig signierte Zustellung an und schreibt sie weg', async () => {
      const verbindung = await baueVerbindung('annehmen');
      const rumpf = nutzlast('erster Push');
      const zustellungsId = randomUUID();

      await stelleZu(
        verbindung.id,
        rumpf,
        erzeugeSignatur(rumpf, verbindung.geheimnis),
        { ereignis: 'push', zustellung: zustellungsId },
      ).expect(202);

      const zeile = await prisma.webhookDelivery.findFirstOrThrow({
        where: { connectionId: verbindung.id },
      });

      expect(zeile.eventType).toBe('push');
      expect(zeile.deliveryId).toBe(zustellungsId);
      expect(zeile.status).toBe('ACCEPTED');
      expect(zeile.versuche).toBe(0);
      expect(zeile.processedAt).toBeNull();
      // Die Nutzlast liegt unveraendert da - das ist der ganze Zweck der
      // Tabelle: Was hat GitHub WIRKLICH geschickt.
      expect(zeile.payload).toMatchObject({ text: 'erster Push' });
    });

    it('antwortet auf ping mit pong - aber erst nach der Signaturpruefung', async () => {
      const verbindung = await baueVerbindung('ping');
      const rumpf = Buffer.from(JSON.stringify({ zen: 'Half measures.' }));

      const antwort = await stelleZu(
        verbindung.id,
        rumpf,
        erzeugeSignatur(rumpf, verbindung.geheimnis),
        { ereignis: 'ping', zustellung: randomUUID() },
      ).expect(202);

      expect(antwort.body).toEqual({ status: 'pong' });

      // Und ohne gueltige Signatur gibt es auch kein pong. Ein Endpoint, der
      // auf ping ungeprueft antwortet, bestaetigt jedem Fremden, dass es
      // diese Verbindung gibt.
      await stelleZu(verbindung.id, rumpf, 'sha256=' + '0'.repeat(64), {
        ereignis: 'ping',
        zustellung: randomUUID(),
      }).expect(404);
    });

    /**
     * ========================================================================
     * DIE NEGATIVEN TESTS - SIE SIND HIER DER EIGENTLICHE INHALT
     * ========================================================================
     * Das ist ein OEFFENTLICHER Endpoint. Die Signatur ist sein einziger
     * Schutz, und der Erfolgspfad oben ist auch dann gruen, wenn sie gar
     * nichts prueft.
     */
    describe('weist zurueck', () => {
      it('eine Zustellung ohne Signatur', async () => {
        const verbindung = await baueVerbindung('ohne-sig');
        const rumpf = nutzlast('ohne Signatur');

        await stelleZu(verbindung.id, rumpf, undefined, {
          ereignis: 'push',
          zustellung: randomUUID(),
        }).expect(404);

        await erwarteKeineZustellung(verbindung.id);
      });

      it('eine Zustellung mit falscher Signatur', async () => {
        const verbindung = await baueVerbindung('falsche-sig');
        const rumpf = nutzlast('falsch signiert');

        await stelleZu(
          verbindung.id,
          rumpf,
          erzeugeSignatur(rumpf, 'ein-fremdes-geheimnis'),
          { ereignis: 'push', zustellung: randomUUID() },
        ).expect(404);

        await erwarteKeineZustellung(verbindung.id);
      });

      /**
       * Der wichtigste Test dieser Datei. Die Signatur ist echt - sie wurde
       * mit dem richtigen Geheimnis ueber den ORIGINALEN Rumpf gebildet.
       * Veraendert ist nur der Rumpf selbst.
       *
       * Wer die Signatur ueber das GEPARSTE Objekt nachrechnete, wuerde das
       * hier NICHT bemerken, sobald die Aenderung dasselbe Objekt ergibt.
       */
      it('einen nachtraeglich veraenderten Rumpf', async () => {
        const verbindung = await baueVerbindung('veraendert');
        const original = nutzlast('das Original');
        const signatur = erzeugeSignatur(original, verbindung.geheimnis);

        await stelleZu(verbindung.id, nutzlast('etwas anderes'), signatur, {
          ereignis: 'push',
          zustellung: randomUUID(),
        }).expect(404);

        await erwarteKeineZustellung(verbindung.id);
      });

      it('eine Zustellung an eine unbekannte Verbindung - ununterscheidbar', async () => {
        const rumpf = nutzlast('ins Leere');

        // Dieselbe 404 wie bei falscher Signatur. Waeren die Antworten
        // unterscheidbar, waere dieser Endpoint ein Auskunftsdienst darueber,
        // welche Verbindungs-IDs existieren.
        const antwort = await stelleZu(
          randomUUID(),
          rumpf,
          erzeugeSignatur(rumpf, 'irgendein-geheimnis'),
          { ereignis: 'push', zustellung: randomUUID() },
        ).expect(404);

        expect(JSON.stringify(antwort.body)).not.toMatch(/signatur|secret/i);
      });

      it('eine Zustellung ohne die GitHub-Kopfzeilen', async () => {
        const verbindung = await baueVerbindung('ohne-kopf');
        const rumpf = nutzlast('kopflos');
        const signatur = erzeugeSignatur(rumpf, verbindung.geheimnis);

        await stelleZu(verbindung.id, rumpf, signatur, {
          zustellung: randomUUID(),
        }).expect(404);

        await stelleZu(verbindung.id, rumpf, signatur, {
          ereignis: 'push',
        }).expect(404);
      });

      it('eine unsinnige Verbindungs-ID mit 400', async () => {
        const rumpf = nutzlast('kaputte id');

        await request(app.getHttpServer())
          .post('/webhooks/github/abc')
          .set('Content-Type', 'application/json')
          .set('X-Hub-Signature-256', `sha256=${'0'.repeat(64)}`)
          .set('X-GitHub-Event', 'push')
          .set('X-GitHub-Delivery', randomUUID())
          .send(rumpf)
          .expect(400);
      });
    });

    it('braucht keinen Token - der Endpoint ist oeffentlich', async () => {
      const verbindung = await baueVerbindung('oeffentlich');
      const rumpf = nutzlast('ohne Anmeldung');

      // Kein Authorization-Kopf. Waere der Endpoint nicht als oeffentlich
      // markiert, antwortete der globale Guard mit 401 - und GitHub koennte
      // nie zustellen.
      await stelleZu(
        verbindung.id,
        rumpf,
        erzeugeSignatur(rumpf, verbindung.geheimnis),
        { ereignis: 'push', zustellung: randomUUID() },
      ).expect(202);
    });
  });

  const erwarteKeineZustellung = async (verbindungsId: string) => {
    const anzahl = await prisma.webhookDelivery.count({
      where: { connectionId: verbindungsId },
    });

    // Ohne diese Nachpruefung waere jeder Test oben auch dann gruen, wenn der
    // Endpoint die Zustellung ERST WEGGESCHRIEBEN und danach 404 gemeldet
    // haette. Der Statuscode allein bewacht die Wirkung nicht.
    expect(anzahl).toBe(0);
  };
});
