import { Test, TestingModule } from '@nestjs/testing';

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get(PasswordService);
  });

  describe('hash', () => {
    it('gibt niemals den Klartext zurueck', async () => {
      const hash = await service.hash('geheim1234');

      expect(hash).not.toContain('geheim1234');
    });

    it('erzeugt einen argon2id-Hash im erwarteten Format', async () => {
      const hash = await service.hash('geheim1234');

      // $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
      expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/);
    });

    it('erzeugt fuer dasselbe Passwort zwei VERSCHIEDENE Hashes', async () => {
      const a = await service.hash('geheim1234');
      const b = await service.hash('geheim1234');

      // Der Grund ist der zufaellige Salt. Waeren beide gleich, koennte ein
      // Angreifer in einer geklauten Tabelle sofort sehen, welche Nutzer
      // dasselbe Passwort verwenden - und mit Rainbow Tables arbeiten.
      expect(a).not.toBe(b);
    });
  });

  describe('verify', () => {
    it('akzeptiert das richtige Passwort', async () => {
      const hash = await service.hash('geheim1234');

      await expect(service.verify(hash, 'geheim1234')).resolves.toBe(true);
    });

    it('lehnt ein falsches Passwort ab', async () => {
      const hash = await service.hash('geheim1234');

      await expect(service.verify(hash, 'geheim1235')).resolves.toBe(false);
    });

    it('unterscheidet Gross- und Kleinschreibung', async () => {
      const hash = await service.hash('geheim1234');

      await expect(service.verify(hash, 'Geheim1234')).resolves.toBe(false);
    });

    it('erkennt trotz unterschiedlicher Salts dasselbe Passwort', async () => {
      const a = await service.hash('geheim1234');
      const b = await service.hash('geheim1234');

      await expect(service.verify(a, 'geheim1234')).resolves.toBe(true);
      await expect(service.verify(b, 'geheim1234')).resolves.toBe(true);
    });

    // Die wichtigsten Tests: der Fehlerfall. Ein Absturz waere hier ein
    // Informationsleck - der Server antwortete mit 500 statt 401 und verriete
    // damit etwas ueber den Zustand des Kontos.
    it('wirft nicht bei einem kaputten Hash, sondern liefert false', async () => {
      await expect(service.verify('kein-gueltiger-hash', 'egal')).resolves.toBe(
        false,
      );
    });

    it('wirft nicht bei leerem Hash', async () => {
      await expect(service.verify('', 'egal')).resolves.toBe(false);
    });

    it('wirft nicht bei einem Hash aus einem fremden Verfahren', async () => {
      const bcryptAehnlich = '$2b$10$abcdefghijklmnopqrstuv';

      await expect(service.verify(bcryptAehnlich, 'egal')).resolves.toBe(false);
    });
  });
});
