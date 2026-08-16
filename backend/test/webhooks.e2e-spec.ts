import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { erzeugeSignatur } from './../src/webhooks/signatur';
import { WebhookEmpfangService } from './../src/webhooks/webhook-empfang.service';

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

  /**
   * ==========================================================================
   * IDEMPOTENZ - SCHEIBE 5.4
   * ==========================================================================
   * GitHub stellt bei jedem Fehlschlag erneut zu, mit DERSELBEN
   * `X-GitHub-Delivery`. Die Zusage lautet: Dieselbe Zustellung hat dieselbe
   * WIRKUNG wie eine einzelne - genau eine Zeile.
   *
   * Der Schutz liegt im `UNIQUE (connectionId, deliveryId)`, nicht in einem
   * `findFirst` davor. Warum das ein Unterschied ist, zeigt erst der
   * nebenlaeufige Test unten.
   */
  describe('Idempotenz', () => {
    it('schreibt eine wiederholte Zustellung nicht zweimal', async () => {
      const verbindung = await baueVerbindung('wiederholt');
      const rumpf = nutzlast('einmal gesendet');
      const signatur = erzeugeSignatur(rumpf, verbindung.geheimnis);
      const zustellungsId = randomUUID();

      const erste = await stelleZu(verbindung.id, rumpf, signatur, {
        ereignis: 'push',
        zustellung: zustellungsId,
      }).expect(202);

      const zweite = await stelleZu(verbindung.id, rumpf, signatur, {
        ereignis: 'push',
        zustellung: zustellungsId,
      }).expect(202);

      expect(erste.body).toEqual({ status: 'angenommen' });
      // 202 auch beim zweiten Mal, und das ist wichtig: Eine Wiederholung ist
      // kein Fehler, sondern erwartetes Verhalten. Bekaeme GitHub hier einen
      // 4xx oder 5xx, wuerde es WEITER wiederholen.
      expect(zweite.body).toEqual({ status: 'bereits bekannt' });

      expect(
        await prisma.webhookDelivery.count({
          where: { connectionId: verbindung.id },
        }),
      ).toBe(1);
    });

    /**
     * ========================================================================
     * DIE ZUSICHERUNG SELBST - DETERMINISTISCH, OHNE JEDE NEBENLAEUFIGKEIT
     * ========================================================================
     * Dieser Test geht bewusst an der API vorbei direkt in die Datenbank. Er
     * prueft die eine Sache, auf der alles andere aufbaut: Der Constraint
     * EXISTIERT und weist eine doppelte Kombination ab.
     *
     * Warum das getrennt gehoert: Alle Tests, die ueber den Endpoint gehen,
     * haengen an einer Verschraenkung von Anfragen - und die bestimmt das
     * Betriebssystem, nicht der Test. Diese Zusicherung dagegen gilt
     * unabhaengig von jeder Reihenfolge, weil die Datenbank sie gibt. Sie ist
     * damit die einzige Aussage dieser Suite, die IMMER dasselbe sagt.
     *
     * Und sie ist die Aussage, die zaehlt: Der Endpoint muss die Verletzung
     * nur noch richtig BEANTWORTEN. Dass es sie gibt, steht hier.
     */
    it('die Datenbank weist eine doppelte (connectionId, deliveryId) selbst ab', async () => {
      const verbindung = await baueVerbindung('constraint');
      const zustellungsId = randomUUID();

      const zeile = {
        connectionId: verbindung.id,
        eventType: 'push',
        deliveryId: zustellungsId,
        payload: { probe: true },
      };

      await prisma.webhookDelivery.create({ data: zeile });

      // P2002 ist Prismas Code fuer eine verletzte Eindeutigkeit. Geprueft
      // wird der CODE und nicht der Meldungstext - Texte aendern sich mit
      // jeder Hauptversion, Codes sind Teil der Schnittstelle.
      await expect(
        prisma.webhookDelivery.create({ data: zeile }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    /**
     * ========================================================================
     * DER NEBENLAEUFIGE TEST - UND WAS ER WIRKLICH BEWEIST
     * ========================================================================
     * Der sequenzielle Test oben ist gruen - auch mit einer naiven Umsetzung,
     * die erst nachsieht und dann schreibt. Denn wenn die zweite Anfrage erst
     * NACH der ersten losgeht, findet ihr `findFirst` die Zeile brav. Die
     * Luecke liegt genau dazwischen: Zwei Zustellungen, die GLEICHZEITIG
     * laufen, finden beide nichts und schreiben beide.
     *
     * Deshalb gehen die Anfragen ohne `await` dazwischen raus und werden erst
     * danach gemeinsam abgewartet. Ein `await` in der Schleife machte diesen
     * Test wertlos, ohne dass er rot wuerde - dieselbe Lehre wie beim
     * `Promise.all` in Sprint 2, beim `Date.now()` in Sprint 3 und bei der
     * Seitengrenze in Sprint 4.
     *
     * ========================================================================
     * WARUM DIESER TEST AM DIENST ANSETZT UND NICHT AM HTTP-ENDPOINT
     * ========================================================================
     * Die erste Fassung schickte gleichzeitige HTTP-Anfragen. Zwei Befunde
     * haben das verworfen, und beide gehoeren hierher:
     *
     * 1. Mit FUENF Anfragen blieb die Mutationsprobe GRUEN - die naive
     *    Umsetzung bestand die gesamte Suite. Fuenf reichten nicht, um die
     *    Verschraenkung herbeizufuehren. Der Test sah aus wie ein
     *    Nebenlaeufigkeitstest und war keiner.
     *
     * 2. Mit DREISSIG fiel die naive Fassung zuverlaessig - lokal. In der CI
     *    scheiterte der Test dagegen an `read ECONNRESET`: `supertest` bindet
     *    je Anfrage einen eigenen Port, und 30 gleichzeitig sprengen auf dem
     *    Runner die Socket-Grenzen.
     *
     * Der zweite Befund ist der entscheidende. Ein Test, der aus einem Grund
     * scheitert, der mit seiner Aussage NICHTS zu tun hat, ist schlimmer als
     * kein Test: Er erzeugt Rauschen, das man irgendwann wegklickt.
     *
     * Das Wettrennen liegt nicht im HTTP-Stapel, sondern zwischen `findFirst`
     * und `create` - also im Dienst und in der Datenbank. Genau dort wird es
     * jetzt geprueft. Damit faellt die Socket-Grenze weg.
     *
     * ========================================================================
     * WARUM 50 UND NICHT 10
     * ========================================================================
     * Auch am Dienst blieb die Mutationsprobe bei zehn Aufrufen GRUEN. Erst
     * bei 50 faellt die naive Fassung, und dann nur an dieser einen Stelle.
     * Ohne Netzwerk kostet die hoehere Zahl nichts - das war der eigentliche
     * Gewinn des Umbaus.
     *
     * EHRLICH DAZU, ZUM DRITTEN MAL IN DIESER DATEI: Auch 50 ist eine Zahl
     * aus einer Messung, keine Garantie. Ob eine naive Fassung scheitert,
     * haengt weiter von der Verschraenkung ab.
     *
     * Die ZUSICHERUNG haengt nicht daran - sie steht im Test darueber, kommt
     * von der Datenbank und gilt immer. Dieser Test hier zeigt das Kleinere:
     * dass der Dienst die Verletzung ABFAENGT, statt sie durchzureichen.
     */
    it('gibt bei gleichzeitigen Aufrufen genau einmal "neu" zurueck', async () => {
      const verbindung = await baueVerbindung('gleichzeitig');
      const rumpf = nutzlast('gleichzeitig');
      const signatur = erzeugeSignatur(rumpf, verbindung.geheimnis);
      const zustellungsId = randomUUID();

      const empfang = app.get(WebhookEmpfangService);

      // KEIN `await` in der Schleife - alle Aufrufe laufen los, bevor der
      // erste fertig ist. Genau darum geht es.
      const ergebnisse = await Promise.all(
        Array.from({ length: 50 }, () =>
          empfang.nimmAn(verbindung.id, rumpf, signatur, 'push', zustellungsId),
        ),
      );

      // Kein Aufruf darf werfen - ohne das Abfangen der
      // Constraint-Verletzung waeren es neun Fehler.
      expect(ergebnisse.filter((e) => e.neu)).toHaveLength(1);

      expect(
        await prisma.webhookDelivery.count({
          where: { connectionId: verbindung.id },
        }),
      ).toBe(1);
    });

    /**
     * ========================================================================
     * WARUM DER CONSTRAINT ZUSAMMENGESETZT IST UND NICHT GLOBAL
     * ========================================================================
     * Ein globales `UNIQUE (deliveryId)` waere die Zusage "diese Zustellung
     * gab es im ganzen System schon". Damit koennte die Zustellung EINER
     * Organisation die einer anderen abweisen - ein Kanal zwischen Mandanten.
     *
     * Dieser Test haelt die engere Zusage fest: DIESE Verbindung hat DIESE
     * Zustellung schon gesehen. Ohne ihn koennte jemand spaeter auf ein
     * globales UNIQUE umstellen, und alle anderen Tests blieben gruen.
     */
    it('behandelt dieselbe deliveryId an zwei Verbindungen getrennt', async () => {
      const eine = await baueVerbindung('geteilt-eins');
      const andere = await baueVerbindung('geteilt-zwei');
      const rumpf = nutzlast('dieselbe Kennung');
      const zustellungsId = randomUUID();

      await stelleZu(eine.id, rumpf, erzeugeSignatur(rumpf, eine.geheimnis), {
        ereignis: 'push',
        zustellung: zustellungsId,
      }).expect(202);

      const zweite = await stelleZu(
        andere.id,
        rumpf,
        erzeugeSignatur(rumpf, andere.geheimnis),
        { ereignis: 'push', zustellung: zustellungsId },
      ).expect(202);

      // Nicht "bereits bekannt": Fuer DIESE Verbindung ist sie neu.
      expect(zweite.body).toEqual({ status: 'angenommen' });

      expect(
        await prisma.webhookDelivery.count({
          where: { deliveryId: zustellungsId },
        }),
      ).toBe(2);
    });

    it('schreibt zwei verschiedene Zustellungen als zwei Zeilen', async () => {
      const verbindung = await baueVerbindung('zwei-verschiedene');
      const rumpf = nutzlast('zwei Ereignisse');
      const signatur = erzeugeSignatur(rumpf, verbindung.geheimnis);

      // Die Gegenprobe zum ersten Test. Ohne sie waere die Suite auch dann
      // gruen, wenn der Endpoint NIE eine zweite Zeile schriebe - etwa weil
      // versehentlich nur auf `connectionId` eindeutig geprueft wird.
      for (const nummer of [1, 2]) {
        await stelleZu(verbindung.id, rumpf, signatur, {
          ereignis: 'push',
          // Verschiedene Kennungen - das ist der ganze Unterschied zum Test
          // oben. `nummer` steht nur da, damit die Schleife eine benutzte
          // Laufvariable hat.
          zustellung: `${randomUUID()}-${nummer}`,
        }).expect(202);
      }

      expect(
        await prisma.webhookDelivery.count({
          where: { connectionId: verbindung.id },
        }),
      ).toBe(2);
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
