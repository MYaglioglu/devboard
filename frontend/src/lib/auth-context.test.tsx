import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './auth-context';

/** Baut eine Antwort, wie `fetch` sie liefern wuerde. */
const antwort = (status: number, koerper?: unknown) =>
  new Response(koerper === undefined ? null : JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const sitzung = {
  accessToken: 'access-token-1',
  user: { id: 'nutzer-1', email: 'max@example.com', name: 'Max' },
};

const fetchMock = vi.fn<typeof fetch>();

/** Rendert den Hook innerhalb des Providers und wartet das stille Erneuern ab. */
const rendern = async () => {
  const ergebnis = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(ergebnis.result.current.laedt).toBe(false));
  return ergebnis;
};

/** Letzte Aufruf-Optionen eines bestimmten Pfads. */
const aufrufAuf = (pfad: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(pfad));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  describe('stille Anmeldung beim Seitenaufruf', () => {
    it('ruft genau einmal /auth/refresh auf', async () => {
      fetchMock.mockResolvedValue(
        antwort(401, { message: 'Sitzung ungueltig' }),
      );

      await rendern();

      expect(aufrufAuf('/auth/refresh')).toHaveLength(1);
    });

    it('stellt bei gueltigem Cookie die Sitzung wieder her', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));

      const { result } = await rendern();

      // Das ist der Kern des Entwurfs: Der Access-Token ist nach dem Neuladen
      // weg, die Sitzung wird trotzdem wiederhergestellt - ueber das
      // httpOnly-Cookie, an das JavaScript nicht herankommt.
      expect(result.current.nutzer).toEqual(sitzung.user);
    });

    it('bleibt ohne gueltiges Cookie abgemeldet', async () => {
      fetchMock.mockResolvedValue(
        antwort(401, { message: 'Sitzung ungueltig' }),
      );

      const { result } = await rendern();

      expect(result.current.nutzer).toBeNull();
    });

    it('setzt laedt erst nach dem Versuch auf false', async () => {
      fetchMock.mockResolvedValue(antwort(401));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      // Ohne diesen Zustand blitzte beim Neuladen einer geschuetzten Seite
      // kurz die Anmeldemaske auf, obwohl der Nutzer angemeldet ist.
      expect(result.current.laedt).toBe(true);
      await waitFor(() => expect(result.current.laedt).toBe(false));
    });

    it('schickt Cookies mit (credentials: include)', async () => {
      fetchMock.mockResolvedValue(antwort(401));

      await rendern();

      // Ohne diese Angabe schickt der Browser bei Anfragen ueber
      // Herkunftsgrenzen KEINE Cookies - das Refresh-Cookie kaeme nie an.
      const [, optionen] = aufrufAuf('/auth/refresh')[0];
      expect(optionen?.credentials).toBe('include');
    });
  });

  describe('authFetch', () => {
    it('haengt den Bearer-Token an', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockResolvedValue(antwort(200, { id: 'nutzer-1' }));
      await act(async () => {
        await result.current.authFetch('/auth/me');
      });

      const [, optionen] = aufrufAuf('/auth/me')[0];
      const kopf = optionen?.headers as Record<string, string>;

      expect(kopf.Authorization).toBe('Bearer access-token-1');
    });

    it('erneuert bei 401 und wiederholt den Aufruf', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockReset();
      fetchMock
        // 1. Versuch: Access-Token abgelaufen
        .mockResolvedValueOnce(antwort(401, { message: 'abgelaufen' }))
        // Erneuerung gelingt
        .mockResolvedValueOnce(
          antwort(200, { ...sitzung, accessToken: 'access-token-2' }),
        )
        // 2. Versuch mit frischem Token
        .mockResolvedValueOnce(antwort(200, { id: 'nutzer-1' }));

      let daten: unknown;
      await act(async () => {
        daten = await result.current.authFetch('/auth/me');
      });

      expect(daten).toEqual({ id: 'nutzer-1' });
      expect(aufrufAuf('/auth/me')).toHaveLength(2);

      // Der Wiederholungsversuch nutzt den NEUEN Token - sonst waere die
      // Erneuerung sinnlos.
      const [, zweiterVersuch] = aufrufAuf('/auth/me')[1];
      const kopf = zweiterVersuch?.headers as Record<string, string>;
      expect(kopf.Authorization).toBe('Bearer access-token-2');
    });

    // Der wichtigste Test dieser Datei.
    it('wiederholt GENAU EINMAL und laeuft nicht in eine Endlosschleife', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockReset();
      // Alles antwortet dauerhaft mit 401 - auch die Erneuerung.
      fetchMock.mockResolvedValue(antwort(401, { message: 'ungueltig' }));

      await act(async () => {
        await expect(result.current.authFetch('/auth/me')).rejects.toThrow();
      });

      // Ohne Obergrenze entstuende hier eine Endlosschleife aus 401 und
      // Erneuerungsversuchen - der Browser wuerde den Server bombardieren.
      expect(aufrufAuf('/auth/me')).toHaveLength(1);
      expect(aufrufAuf('/auth/refresh')).toHaveLength(1);
    });

    it('meldet ab, wenn die Erneuerung scheitert', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockReset();
      fetchMock.mockResolvedValue(antwort(401, { message: 'ungueltig' }));

      await act(async () => {
        await expect(result.current.authFetch('/auth/me')).rejects.toThrow();
      });

      expect(result.current.nutzer).toBeNull();
    });

    it('reicht andere Fehler unveraendert weiter', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockReset();
      fetchMock.mockResolvedValue(antwort(500, { message: 'Serverfehler' }));

      await act(async () => {
        await expect(result.current.authFetch('/auth/me')).rejects.toThrow(
          'Serverfehler',
        );
      });

      // Bei 500 wird NICHT erneuert - das waere sinnlos und wuerde den
      // ohnehin ueberlasteten Server zusaetzlich belasten.
      expect(aufrufAuf('/auth/refresh')).toHaveLength(0);
    });
  });

  describe('anmelden', () => {
    it('uebernimmt Nutzer und Token', async () => {
      fetchMock.mockResolvedValue(antwort(401));
      const { result } = await rendern();

      fetchMock.mockResolvedValue(antwort(200, sitzung));
      await act(async () => {
        await result.current.anmelden('max@example.com', 'geheim12345');
      });

      expect(result.current.nutzer).toEqual(sitzung.user);
    });

    it('reicht die Fehlermeldung des Servers unveraendert durch', async () => {
      fetchMock.mockResolvedValue(antwort(401));
      const { result } = await rendern();

      fetchMock.mockResolvedValue(
        antwort(401, { message: 'E-Mail oder Passwort ist falsch' }),
      );

      // Die Meldung ist serverseitig absichtlich generisch. Das Frontend darf
      // sie nicht "hilfreicher" umformulieren.
      await act(async () => {
        await expect(
          result.current.anmelden('max@example.com', 'falsch'),
        ).rejects.toThrow('E-Mail oder Passwort ist falsch');
      });

      expect(result.current.nutzer).toBeNull();
    });
  });

  describe('abmelden', () => {
    it('verwirft die Sitzung', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockResolvedValue(antwort(204));
      await act(async () => {
        await result.current.abmelden();
      });

      expect(result.current.nutzer).toBeNull();
    });

    it('meldet auch dann lokal ab, wenn der Server nicht erreichbar ist', async () => {
      fetchMock.mockResolvedValue(antwort(200, sitzung));
      const { result } = await rendern();

      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await act(async () => {
        await result.current.abmelden();
      });

      // Alles andere waere fuer Nutzer unverstaendlich: Sie klicken auf
      // "Abmelden" und bleiben scheinbar angemeldet.
      expect(result.current.nutzer).toBeNull();
    });
  });
});
