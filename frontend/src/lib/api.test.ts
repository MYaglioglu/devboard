import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiFehler } from './api';

/**
 * Antwort-Attrappe, die sich wie `fetch` verhaelt - inklusive des Punktes, um
 * den es hier geht: `text()` liefert genau das, was auf der Leitung stand.
 */
const antwort = (status: number, koerper: string): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(koerper),
    json: () =>
      koerper.length === 0
        ? Promise.reject(new SyntaxError('Unexpected end of JSON input'))
        : Promise.resolve(JSON.parse(koerper) as unknown),
  }) as Response;

describe('api()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const gibZurueck = (status: number, koerper: string) => {
    vi.mocked(fetch).mockResolvedValue(antwort(status, koerper));
  };

  it('liest einen JSON-Koerper', async () => {
    gibZurueck(200, '{"id":"p-1","name":"Website"}');

    await expect(api('/projects/p-1')).resolves.toEqual({
      id: 'p-1',
      name: 'Website',
    });
  });

  /**
   * ==========================================================================
   * DER FEHLER, DER DIESEN TEST NOETIG GEMACHT HAT
   * ==========================================================================
   * `GET .../repository` antwortet mit `null`, wenn ein Projekt kein
   * Repository verbunden hat. NestJS serialisiert `null` aber NICHT als die
   * vier Zeichen "null" - es sendet einen 200 mit LEEREM Koerper.
   *
   * Die fruehere Fassung rief direkt `antwort.json()` auf. Das wirft dann
   * "Unexpected end of JSON input", React Query wertet es als Fehler, und auf
   * jeder Projektseite ohne GitHub-Verbindung stand ein rotes Banner - also
   * im Normalfall.
   *
   * Warum kein Test das vorher bemerkt hat: Die Attrappen der
   * Komponententests lieferten brav `null` als Wert zurueck. Der Unterschied
   * zwischen dem Wert `null` und einem leeren Koerper entsteht erst auf der
   * Leitung - und genau dort setzt dieser Test an.
   */
  it('deutet einen leeren Koerper als null, nicht als Fehler', async () => {
    gibZurueck(200, '');

    await expect(
      api('/organizations/o-1/projects/p-1/repository'),
    ).resolves.toBeNull();
  });

  it('behandelt 204 ohne Koerper', async () => {
    gibZurueck(204, '');

    await expect(
      api('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  it('wirft bei einem Fehlerstatus einen ApiFehler', async () => {
    gibZurueck(400, '{"message":"Validierung fehlgeschlagen"}');

    await expect(api('/tasks', { method: 'POST' })).rejects.toBeInstanceOf(
      ApiFehler,
    );
  });

  /**
   * Der Grenzfall daneben: Ein Fehlerstatus OHNE Koerper darf nicht beim
   * Auslesen der Fehlermeldung erneut scheitern - sonst verdeckt ein
   * Folgefehler die eigentliche Ursache, und im Protokoll steht ein
   * Parserfehler statt "503".
   */
  it('wirft auch dann sauber, wenn der Fehler keinen Koerper hat', async () => {
    gibZurueck(502, '');

    await expect(api('/organizations')).rejects.toBeInstanceOf(ApiFehler);
  });
});
