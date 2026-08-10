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
});
