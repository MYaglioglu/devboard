// MUSS als Erstes stehen: setzt THROTTLE_LIMIT, bevor app.module.ts geladen
// und dabei ConfigModule.forRoot() ausgewertet wird.
import './aktiviere-throttling';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface FehlerAntwort {
  statusCode: number;
  message: string | string[];
  path?: string;
  stack?: string;
}

describe('Haertung (e2e)', () => {
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
  const email = (kennung: string) => `sec-${kennung}-${lauf}@example.com`;

  beforeAll(async () => {
    // Hier bleibt der ThrottlerGuard AKTIV - er ist der Prueflingsgegenstand.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('Security-Header (Helmet)', () => {
    it('verbietet das Erraten des Inhaltstyps', async () => {
      const antwort = await request(app.getHttpServer()).get('/health');

      // Ohne nosniff koennte der Browser eine als Text ausgelieferte Datei
      // als Skript ausfuehren.
      expect(antwort.headers['x-content-type-options']).toBe('nosniff');
    });

    it('verhindert das Einbetten in fremde Seiten', async () => {
      const antwort = await request(app.getHttpServer()).get('/health');

      // Schutz gegen Clickjacking: Die Seite darf nicht in einem fremden
      // Rahmen dargestellt werden.
      expect(antwort.headers['x-frame-options']).toBeDefined();
    });

    it('verraet die eingesetzte Technik nicht', async () => {
      const antwort = await request(app.getHttpServer()).get('/health');

      // Express sendet ohne Helmet "X-Powered-By: Express". Das ist eine
      // kostenlose Auskunft an Angreifer darueber, wonach sie suchen sollen.
      expect(antwort.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Fehlerantworten', () => {
    it('liefert bei unbekannten Routen eine einheitliche Antwort', async () => {
      const antwort = await request(app.getHttpServer())
        .get('/gibt-es-nicht')
        .expect(404);

      const koerper = antwort.body as FehlerAntwort;

      expect(koerper.statusCode).toBe(404);
      expect(koerper.path).toBe('/gibt-es-nicht');
    });

    it('gibt niemals einen Stacktrace nach aussen', async () => {
      const antwort = await request(app.getHttpServer()).get('/gibt-es-nicht');

      const roh = JSON.stringify(antwort.body);

      // Ein Stacktrace verraet Dateipfade, Bibliotheksversionen und Teile des
      // Quelltexts - genau daraus baut ein Angreifer sein Bild vom System.
      expect(roh).not.toContain('/src/');
      expect(roh).not.toContain('node_modules');
      expect(roh).not.toMatch(/\bat\s+\w+\s+\(/);
    });

    it('reicht absichtliche Fehlermeldungen unveraendert durch', async () => {
      // Beide Felder leer: Das Login-Schema prueft bewusst KEIN
      // E-Mail-Format (siehe login.dto.ts) - "keine-adresse" waere dort
      // gueltig. Nur die Pflichtangabe wird geprueft.
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '', password: '' })
        .expect(400);

      const koerper = antwort.body as FehlerAntwort & {
        errors?: Record<string, string[]>;
      };

      // Eine HttpException ist eine ABSICHTLICHE Aussage des Codes. Ihre
      // feldbezogenen Meldungen muessen erhalten bleiben, sonst koennte das
      // Frontend sie nicht am richtigen Eingabefeld anzeigen.
      expect(Object.keys(koerper.errors ?? {})).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });
  });

  // ==========================================================================
  // BEWUSST ALS LETZTER BLOCK
  // ==========================================================================
  // Diese Tests brauchen das Anmelde-Kontingent auf und wuerden alle spaeteren
  // Anfragen an /auth/login mit 429 beantworten. Der Zaehler laeuft im
  // Arbeitsspeicher und laesst sich nicht zuruecksetzen - also stehen sie am
  // Ende.
  //
  // Das ist ein bekannter Nachteil zustandsbehafteter Tests: Sie sind nicht
  // beliebig umsortierbar. Die Alternative waere ein eigener Speicher pro
  // Test - hier waere der Aufwand groesser als der Gewinn.
  describe('Rate Limiting (verbraucht das Kontingent)', () => {
    it('lehnt zu viele Anmeldeversuche mit 429 ab', async () => {
      const daten = { email: email('brute'), password: 'falschesPasswort' };
      const codes: number[] = [];

      // Die Grenze liegt bei 5 Versuchen pro Minute und IP-Adresse.
      for (let i = 0; i < 7; i++) {
        const antwort = await request(app.getHttpServer())
          .post('/auth/login')
          .send(daten);
        codes.push(antwort.status);
      }

      // Bewusst keine starre Erwartung auf jede einzelne Position: Der Zaehler
      // liegt im Arbeitsspeicher und wurde von vorherigen Tests dieser Datei
      // bereits angebrochen. Geprueft wird die Aussage, nicht die Buchhaltung.
      //
      // Erste Versuche scheitern regulaer mit 401 (Konto gibt es nicht),
      // spaeter greift die Sperre - und sie bleibt bestehen.
      expect(codes[0]).toBe(401);
      expect(codes).toContain(429);
      expect(codes.at(-1)).toBe(429);

      // Sobald einmal gesperrt, darf es keine Rueckkehr zu 401 geben.
      const ersteSperre = codes.indexOf(429);
      expect(codes.slice(ersteSperre).every((c) => c === 429)).toBe(true);
    });

    it('beschraenkt auch die Registrierung', async () => {
      const codes: number[] = [];

      for (let i = 0; i < 7; i++) {
        const antwort = await request(app.getHttpServer())
          .post('/auth/register')
          .send({ email: email(`spam-${i}`), password: 'einSicheresPasswort' });
        codes.push(antwort.status);
      }

      // Ohne Grenze koennte jemand massenhaft Konten anlegen.
      expect(codes).toContain(429);
    });

    it('laesst den Health-Endpoint grosszuegiger durch', async () => {
      // Die strenge Grenze gilt nur fuer Anmelde-Endpoints. Waere sie global,
      // koennte ein Loadbalancer den Health-Check nicht mehr abfragen.
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer()).get('/health').expect(200);
      }
    });
  });
});
