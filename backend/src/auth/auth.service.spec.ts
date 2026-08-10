import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  let service: AuthService;

  /**
   * Die Argumente, mit denen der Service `prisma.user.create` aufruft.
   * Ausdruecklich typisiert, damit die Tests spaeter typsicher hineinschauen
   * koennen - `jest.fn()` ohne Typangabe liefert `any`, und `any` im Testcode
   * ist genauso gefaehrlich wie im Produktivcode.
   */
  interface CreateArgumente {
    data: { email: string; name: string | null; passwordHash: string };
    select: Record<string, boolean>;
  }

  // Attrappen statt echter Abhaengigkeiten - hier zahlt sich Dependency
  // Injection aus: kein Datenbank-Container, Laufzeit in Millisekunden, und
  // Fehlerfaelle (Eindeutigkeitsverstoss) sind ueberhaupt erst herstellbar.
  const create = jest.fn<Promise<unknown>, [CreateArgumente]>();
  const hash = jest.fn<Promise<string>, [string]>();

  beforeEach(async () => {
    create.mockReset();
    hash.mockReset();
    hash.mockResolvedValue('$argon2id$v=19$m=19456,t=2,p=1$salt$hash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { create } } },
        { provide: PasswordService, useValue: { hash } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  const eingabe = {
    email: 'max@example.com',
    password: 'einSicheresPasswort',
    name: 'Max',
  };

  const angelegt = {
    id: 'b3f1c2d4-0000-4000-8000-000000000001',
    email: 'max@example.com',
    name: 'Max',
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
  };

  it('hasht das Passwort, bevor es gespeichert wird', async () => {
    create.mockResolvedValue(angelegt);

    await service.register(eingabe);

    expect(hash).toHaveBeenCalledWith('einSicheresPasswort');
  });

  it('speichert niemals das Klartext-Passwort', async () => {
    create.mockResolvedValue(angelegt);

    await service.register(eingabe);

    const geschrieben = create.mock.calls[0][0].data;

    expect(geschrieben).not.toHaveProperty('password');
    expect(JSON.stringify(geschrieben)).not.toContain('einSicheresPasswort');
    expect(geschrieben.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('fordert von der Datenbank nur unbedenkliche Felder an', async () => {
    create.mockResolvedValue(angelegt);

    await service.register(eingabe);

    const select = create.mock.calls[0][0].select;

    // Der Hash darf gar nicht erst geladen werden - nicht erst nachtraeglich
    // entfernt. Wer Felder hinterher loescht, vergisst irgendwann eines.
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).toEqual({
      id: true,
      email: true,
      name: true,
      createdAt: true,
    });
  });

  it('gibt den angelegten Nutzer ohne Hash zurueck', async () => {
    create.mockResolvedValue(angelegt);

    const ergebnis = await service.register(eingabe);

    expect(ergebnis).toEqual(angelegt);
    expect(ergebnis).not.toHaveProperty('passwordHash');
  });

  it('speichert einen fehlenden Namen als null statt undefined', async () => {
    create.mockResolvedValue({ ...angelegt, name: null });

    await service.register({
      email: eingabe.email,
      password: eingabe.password,
    });

    const geschrieben = create.mock.calls[0][0].data;

    expect(geschrieben.name).toBeNull();
  });

  it('wandelt einen Eindeutigkeitsverstoss (P2002) in einen 409 um', async () => {
    // So meldet Prisma einen Verstoss gegen den UNIQUE-Index auf `email`.
    // Genau darauf verlassen wir uns - statt vorher zu pruefen, was eine
    // Race Condition zwischen Pruefung und Schreiben enthielte.
    create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });

    await expect(service.register(eingabe)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reicht unbekannte Datenbankfehler unveraendert weiter', async () => {
    // Wichtig: Nur der bekannte Fall wird uebersetzt. Ein Verbindungsabbruch
    // darf NICHT als "E-Mail bereits vergeben" beim Nutzer ankommen.
    const unbekannt = new Error('Verbindung verloren');
    create.mockRejectedValue(unbekannt);

    await expect(service.register(eingabe)).rejects.toBe(unbekannt);
  });
});
