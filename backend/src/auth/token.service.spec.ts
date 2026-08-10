import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { TokenService } from './token.service';

const GEHEIMNIS = 'test-geheimnis-mit-mindestens-32-zeichen-laenge';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      // Hier bewusst das ECHTE JwtModule statt einer Attrappe: Geprueft werden
      // soll ja gerade, dass Signatur und Ablauf tatsaechlich funktionieren.
      // Eine Attrappe wuerde nur bestaetigen, dass wir sie richtig aufrufen.
      imports: [
        JwtModule.register({
          secret: GEHEIMNIS,
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      providers: [
        TokenService,
        {
          provide: ConfigService,
          useValue: { get: () => '15m' },
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  it('erzeugt einen Token aus drei durch Punkt getrennten Teilen', async () => {
    const token = await service.erstelleAccessToken(
      'nutzer-1',
      'max@example.com',
    );

    expect(token.split('.')).toHaveLength(3);
  });

  it('legt Nutzer-ID und E-Mail in den Payload', async () => {
    const token = await service.erstelleAccessToken(
      'nutzer-1',
      'max@example.com',
    );
    const payload = await service.pruefeAccessToken(token);

    // `sub` ist der in RFC 7519 vorgesehene Claim fuer die Kennung des
    // Subjekts - eigene Namen wie `userId` wuerden zwar funktionieren, aber
    // jedes Standardwerkzeug erwartet `sub`.
    expect(payload.sub).toBe('nutzer-1');
    expect(payload.email).toBe('max@example.com');
  });

  it('enthaelt keinen Passwort-Hash im Payload', async () => {
    const token = await service.erstelleAccessToken(
      'nutzer-1',
      'max@example.com',
    );

    // Der Payload ist nur base64-KODIERT, nicht verschluesselt: Jeder mit dem
    // Token kann ihn lesen. Deshalb duerfen dort niemals Geheimnisse stehen.
    const payload = Buffer.from(token.split('.')[1], 'base64url').toString();

    expect(payload).not.toContain('argon2');
    expect(payload).not.toContain('passwordHash');
  });

  it('ist lesbar, aber nicht faelschbar', async () => {
    const token = await service.erstelleAccessToken(
      'nutzer-1',
      'max@example.com',
    );
    const [header, payload, signatur] = token.split('.');

    // Payload manipulieren: aus nutzer-1 wird nutzer-2
    const gefaelscht = Buffer.from(
      JSON.stringify({ sub: 'nutzer-2', email: 'max@example.com' }),
    ).toString('base64url');

    // Alte Signatur weiterverwenden - genau das schlaegt fehl.
    await expect(
      service.pruefeAccessToken(`${header}.${gefaelscht}.${signatur}`),
    ).rejects.toThrow();

    // Der unveraenderte Token bleibt gueltig.
    await expect(
      service.pruefeAccessToken(`${header}.${payload}.${signatur}`),
    ).resolves.toBeDefined();
  });

  it('lehnt einen Token mit fremdem Geheimnis ab', async () => {
    // Ein Token, der mit einem anderen Schluessel signiert wurde, darf nicht
    // durchgehen - sonst koennte jeder eigene Token ausstellen.
    const fremd = new JwtService({
      secret: 'ein-voellig-anderes-geheimnis-mit-32-zeichen',
    });
    const fremderToken = await fremd.signAsync({ sub: 'angreifer' });

    await expect(service.pruefeAccessToken(fremderToken)).rejects.toThrow();
  });

  it('lehnt Unsinn ab, statt abzustuerzen', async () => {
    await expect(
      service.pruefeAccessToken('kein.gueltiger.token'),
    ).rejects.toThrow();
  });
});
