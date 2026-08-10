import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

interface NutzerAntwort {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  passwordHash?: string;
}

interface LoginAntwort {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
}

interface FehlerAntwort {
  message: string;
  statusCode: number;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Jeder Testlauf nutzt eigene Adressen. Sonst waeren die Tests von der
  // Reihenfolge und von Rueckstaenden frueherer Laeufe abhaengig - eine der
  // haeufigsten Ursachen fuer Tests, die "manchmal" fehlschlagen.
  const lauf = Date.now();
  const email = (kennung: string) => `e2e-${kennung}-${lauf}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      // Rate Limiting ist fuer den gesamten E2E-Lauf abgeschaltet
      // (THROTTLE_LIMIT=0 im npm-Skript): Diese Suite meldet sich dutzendfach
      // an und wuerde sich sonst selbst aussperren. Dass das Limit WIRKT,
      // prueft security.e2e-spec.ts gezielt.
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Aufraeumen: Der Test hinterlaesst die Datenbank so, wie er sie
    // vorgefunden hat.
    await prisma.user.deleteMany({
      where: { email: { contains: `-${lauf}@` } },
    });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('legt ein Konto an und antwortet mit 201', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: email('neu'),
          password: 'einSicheresPasswort',
          name: 'Max',
        })
        .expect(201);

      const koerper = antwort.body as NutzerAntwort;

      expect(koerper.email).toBe(email('neu'));
      expect(koerper.name).toBe('Max');
      expect(koerper.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    // Der wichtigste Test dieser Datei.
    it('gibt den Passwort-Hash NIEMALS zurueck', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: email('kein-hash'), password: 'einSicheresPasswort' })
        .expect(201);

      const koerper = antwort.body as NutzerAntwort;

      expect(koerper.passwordHash).toBeUndefined();
      expect(JSON.stringify(koerper)).not.toContain('argon2');
      expect(JSON.stringify(koerper)).not.toContain('einSicheresPasswort');
    });

    it('speichert das Passwort in der Datenbank nur als Hash', async () => {
      const adresse = email('db-hash');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(201);

      const gespeichert = await prisma.user.findUnique({
        where: { email: adresse },
      });

      expect(gespeichert?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(gespeichert?.passwordHash).not.toContain('einSicheresPasswort');
    });

    it('normalisiert die E-Mail-Adresse zu Kleinbuchstaben', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `  ${email('GROSS').toUpperCase()}  `,
          password: 'einSicheresPasswort',
        })
        .expect(201);

      const koerper = antwort.body as NutzerAntwort;

      // Ohne Normalisierung waeren "Max@example.com" und "max@example.com"
      // zwei Konten - der UNIQUE-Index vergleicht zeichengenau.
      expect(koerper.email).toBe(email('GROSS').toLowerCase());
    });

    it('lehnt eine bereits vergebene Adresse mit 409 ab', async () => {
      const adresse = email('doppelt');
      const daten = { email: adresse, password: 'einSicheresPasswort' };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(daten)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(daten)
        .expect(409);
    });

    it('erkennt Dubletten auch bei abweichender Schreibweise', async () => {
      const adresse = email('dublette-gross');

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse.toUpperCase(), password: 'einSicheresPasswort' })
        .expect(409);
    });

    it('lehnt eine ungueltige E-Mail-Adresse mit 400 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'keine-adresse', password: 'einSicheresPasswort' })
        .expect(400);
    });

    it('lehnt ein zu kurzes Passwort mit 400 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: email('kurz'), password: 'kurz' })
        .expect(400);
    });

    it('lehnt ein uebermaessig langes Passwort mit 400 ab', () => {
      // Obergrenze gegen Denial-of-Service: argon2 ist absichtlich
      // rechenintensiv, ein mehrere Megabyte grosses Passwort waere eine Waffe.
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: email('lang'), password: 'a'.repeat(5000) })
        .expect(400);
    });

    it('nennt im Fehlerfall das betroffene Feld', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'keine-adresse', password: 'kurz' })
        .expect(400);

      const koerper = antwort.body as { errors?: Record<string, string[]> };

      expect(Object.keys(koerper.errors ?? {})).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });
  });

  describe('POST /auth/login', () => {
    const adresse = () => email('login');
    const passwort = 'einSicheresPasswort';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse(), password: passwort, name: 'Max' })
        .expect(201);
    });

    it('meldet mit richtigen Zugangsdaten an und liefert 200', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: passwort })
        .expect(200);

      const koerper = antwort.body as LoginAntwort;

      // 200, nicht 201: Ein Login erzeugt keine Ressource, er prueft
      // Zugangsdaten.
      expect(koerper.user.email).toBe(adresse());
      expect(koerper.user.name).toBe('Max');
      expect(koerper.accessToken.split('.')).toHaveLength(3);
    });

    it('gibt weder Hash noch Passwort zurueck', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: passwort })
        .expect(200);

      expect(JSON.stringify(antwort.body)).not.toContain('argon2');
      expect(JSON.stringify(antwort.body)).not.toContain(passwort);
    });

    it('legt Nutzer-ID und E-Mail lesbar in den Token, aber nichts Geheimes', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: passwort })
        .expect(200);

      const koerper = antwort.body as LoginAntwort;

      // Der Payload ist nur base64-KODIERT, nicht verschluesselt - jeder mit
      // dem Token kann ihn lesen. Genau deshalb duerfen dort keine
      // Geheimnisse stehen.
      const payload = JSON.parse(
        Buffer.from(koerper.accessToken.split('.')[1], 'base64url').toString(),
      ) as { sub: string; email: string; exp: number; iat: number };

      expect(payload.email).toBe(adresse());
      expect(payload.sub).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(payload)).not.toContain('argon2');

      // Ablaufzeit ist gesetzt und liegt in der Zukunft (15 Minuten).
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('akzeptiert die Adresse auch in abweichender Schreibweise', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse().toUpperCase(), password: passwort })
        .expect(200);
    });

    it('lehnt ein falsches Passwort mit 401 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: 'falschesPasswort' })
        .expect(401);
    });

    it('lehnt eine unbekannte Adresse mit 401 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: email('gibt-es-nicht'), password: passwort })
        .expect(401);
    });

    // Der wichtigste Test dieses Blocks.
    it('antwortet bei unbekannter Adresse und falschem Passwort identisch', async () => {
      const unbekannt = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: email('gibt-es-nicht'), password: passwort })
        .expect(401);

      const falsch = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: 'falschesPasswort' })
        .expect(401);

      // Unterschiedliche Meldungen wuerden verraten, welche Adressen
      // registriert sind - User Enumeration.
      expect((unbekannt.body as FehlerAntwort).message).toBe(
        (falsch.body as FehlerAntwort).message,
      );
    });

    it('lehnt eine leere Anfrage mit 400 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('setzt den Refresh-Token als httpOnly-Cookie', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: passwort })
        .expect(200);

      const cookies = antwort.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('devboard_refresh='));

      expect(refresh).toBeDefined();
      // httpOnly: JavaScript kommt nicht heran - der eigentliche Schutz
      // gegen XSS-Diebstahl.
      expect(refresh).toContain('HttpOnly');
      // SameSite=Lax: schuetzt den POST-Endpoint gegen CSRF.
      expect(refresh).toMatch(/SameSite=Lax/i);
      // Pfadbegrenzung: Das Cookie wird nur an /auth-Endpoints geschickt.
      expect(refresh).toContain('Path=/auth');
    });

    it('legt den Refresh-Token NICHT in den Antwortkoerper', async () => {
      const antwort = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: passwort })
        .expect(200);

      // Stuende er dort, koennte JavaScript ihn lesen - und der ganze Zweck
      // des httpOnly-Cookies waere dahin.
      expect(antwort.body).not.toHaveProperty('refreshToken');
    });

    it('prueft beim Login KEINE Mindestlaenge des Passworts', async () => {
      // Wichtige Abgrenzung zur Registrierung: Eine Laengenpruefung beim Login
      // wuerde verraten, welche Passwoerter ueberhaupt moeglich sind, und
      // Nutzer mit aelteren Passwoertern aussperren. Erwartet wird 401
      // (falsche Zugangsdaten), nicht 400 (ungueltige Eingabe).
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse(), password: 'kurz' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh und /auth/logout', () => {
    /** Liest den Wert des Refresh-Cookies aus einer Antwort. */
    const holeCookie = (antwort: request.Response): string => {
      const cookies = antwort.headers['set-cookie'] as unknown as string[];
      const eintrag = cookies.find((c) => c.startsWith('devboard_refresh='));
      return eintrag?.split(';')[0] ?? '';
    };

    /** Registriert einen frischen Nutzer und meldet ihn an. */
    const frischAngemeldet = async (kennung: string): Promise<string> => {
      const adresse = email(kennung);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(201);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(200);

      return holeCookie(login);
    };

    it('stellt mit gueltigem Cookie einen neuen Access-Token aus', async () => {
      const cookie = await frischAngemeldet('refresh-ok');

      const antwort = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      const koerper = antwort.body as LoginAntwort;

      expect(koerper.accessToken.split('.')).toHaveLength(3);
      // Kein Passwort noetig: Der Besitz des Cookies IST der Nachweis.
    });

    it('rotiert dabei den Refresh-Token', async () => {
      const cookie = await frischAngemeldet('refresh-rotation');

      const antwort = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      expect(holeCookie(antwort)).not.toBe(cookie);
    });

    it('lehnt eine Anfrage ohne Cookie mit 401 ab', () => {
      return request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('lehnt einen erfundenen Token mit 401 ab', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', 'devboard_refresh=voellig-erfunden')
        .expect(401);
    });

    // ========================================================================
    // Der wichtigste Test des Sprints.
    // ========================================================================
    it('macht bei Wiederverwendung die GANZE Familie ungueltig', async () => {
      const tokenA = await frischAngemeldet('diebstahl');

      // 1. Rechtmaessige Erneuerung: A wird verbraucht, B entsteht.
      const ersteErneuerung = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', tokenA)
        .expect(200);
      const tokenB = holeCookie(ersteErneuerung);

      // 2. Ein Angreifer legt den gestohlenen (bereits verbrauchten) A vor.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', tokenA)
        .expect(401);

      // 3. UND JETZT DER PUNKT: Auch B ist nun wertlos - obwohl B nie
      //    wiederverwendet wurde und beim rechtmaessigen Nutzer liegt.
      //
      //    Ein verbrauchter Token, der erneut auftaucht, bedeutet entweder
      //    einen abgebrochenen Versuch oder einen Diebstahl. Beides ist nicht
      //    unterscheidbar, also wird der schlimmere Fall angenommen: Die
      //    gesamte Kette fliegt raus. Der Nutzer meldet sich neu an, der
      //    Angreifer kann das nicht.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', tokenB)
        .expect(401);
    });

    it('beendet die Sitzung beim Logout', async () => {
      const cookie = await frischAngemeldet('logout');

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      // Erst durch die serverseitige Speicherung wirkt ein Logout wirklich.
      // Bei einem reinen JWT-Ansatz waere der Token weiterhin gueltig.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('loescht beim Logout das Cookie', async () => {
      const cookie = await frischAngemeldet('logout-cookie');

      const antwort = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cookies = antwort.headers['set-cookie'] as unknown as string[];
      const geloescht = cookies.find((c) => c.startsWith('devboard_refresh='));

      // Zum Loeschen setzt der Server das Cookie mit leerem Wert und einem
      // Ablauf in der Vergangenheit.
      expect(geloescht).toContain('devboard_refresh=;');
    });

    it('gelingt auch ohne Cookie mit 204', () => {
      // Ein Logout soll immer gelingen - alles andere waere fuer Nutzer
      // unverstaendlich und wuerde verraten, ob ein Token gueltig war.
      return request(app.getHttpServer()).post('/auth/logout').expect(204);
    });

    it('wirft andere Sitzungen desselben Nutzers NICHT hinaus', async () => {
      const adresse = email('zwei-geraete');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(201);

      const geraet1 = holeCookie(
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: adresse, password: 'einSicheresPasswort' })
          .expect(200),
      );
      const geraet2 = holeCookie(
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: adresse, password: 'einSicheresPasswort' })
          .expect(200),
      );

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', geraet1)
        .expect(204);

      // Jeder Login startet eine EIGENE Familie. Abmelden am Laptop darf das
      // Handy nicht mit hinauswerfen.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', geraet2)
        .expect(200);
    });
  });

  describe('GET /auth/me (geschuetzt)', () => {
    let token: string;
    let adresse: string;

    beforeAll(async () => {
      adresse = email('me');
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: adresse, password: 'einSicheresPasswort', name: 'Max' })
        .expect(201);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(200);

      token = (login.body as LoginAntwort).accessToken;
    });

    it('liefert mit gueltigem Token das eigene Profil', async () => {
      const antwort = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const koerper = antwort.body as { id: string; email: string };

      expect(koerper.email).toBe(adresse);
      expect(koerper.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('lehnt eine Anfrage ohne Token mit 401 ab', () => {
      // 401, nicht 403: Der Server weiss nicht, WER anfragt.
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('lehnt einen erfundenen Token mit 401 ab', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer voellig.erfundener.token')
        .expect(401);
    });

    it('lehnt einen Token mit manipuliertem Payload ab', async () => {
      const [kopf, , signatur] = token.split('.');
      const gefaelscht = Buffer.from(
        JSON.stringify({ sub: 'fremde-id', email: 'angreifer@example.com' }),
      ).toString('base64url');

      // Lesbar ja, faelschbar nein: Die alte Signatur passt nicht mehr.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${kopf}.${gefaelscht}.${signatur}`)
        .expect(401);
    });

    it('lehnt ein falsches Authentifizierungsschema ab', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Basic ${token}`)
        .expect(401);
    });

    it('akzeptiert KEIN Cookie als Ersatz fuer den Header', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adresse, password: 'einSicheresPasswort' })
        .expect(200);

      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refresh = cookies.find((c) => c.startsWith('devboard_refresh='));

      // Der Refresh-Token ist KEIN Zugangsnachweis fuer normale Endpoints.
      // Nur ueber /auth/refresh laesst sich damit ein Access-Token holen.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', refresh?.split(';')[0] ?? '')
        .expect(401);
    });

    it('laesst den Health-Endpoint weiterhin ohne Token durch', () => {
      // Der Guard laeuft global. Ohne @Oeffentlich() waere /health jetzt
      // gesperrt - und Docker koennte den Container nicht mehr pruefen.
      return request(app.getHttpServer()).get('/health').expect(200);
    });
  });
});
