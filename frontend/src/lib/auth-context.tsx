'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApiFehler, api } from './api';
import type { AuthAntwort, Nutzer } from './api';

interface AuthZustand {
  nutzer: Nutzer | null;
  /** true, solange die stille Anmeldung beim Seitenaufruf laeuft. */
  laedt: boolean;
  anmelden: (email: string, passwort: string) => Promise<void>;
  registrieren: (
    email: string,
    passwort: string,
    name?: string,
  ) => Promise<void>;
  abmelden: () => Promise<void>;
  /** Fuehrt einen Aufruf mit gueltigem Access-Token aus. */
  authFetch: <T>(pfad: string, optionen?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthZustand | null>(null);

/**
 * Haelt die Anmeldung im Frontend.
 *
 * ============================================================================
 * WARUM DER ACCESS-TOKEN IN EINER VARIABLEN LIEGT UND NICHT IN localStorage
 * ============================================================================
 * `localStorage` ist fuer JEDES Skript auf der Seite lesbar. Eine einzige
 * XSS-Luecke - auch in einer fremden Bibliothek - genuegt, und der Token ist
 * weg. Er ueberlebt ausserdem das Schliessen des Browsers, ohne dass der
 * Server etwas dagegen tun koennte.
 *
 * Hier lebt er in einer JavaScript-Variablen (`useRef`). Beim Neuladen der
 * Seite ist er weg - und genau das ist gewollt. Die Sitzung wird dann still
 * ueber das httpOnly-Refresh-Cookie wiederhergestellt, an das JavaScript
 * ueberhaupt nicht herankommt.
 *
 * `useRef` statt `useState`, weil der Token kein Anzeigezustand ist: Seine
 * Aenderung soll KEIN Neuzeichnen ausloesen. Der Nutzer dagegen schon - der
 * steht deshalb in `useState`.
 *
 * ============================================================================
 * STILLE ANMELDUNG BEIM SEITENAUFRUF
 * ============================================================================
 * Beim ersten Rendern wird einmal /auth/refresh aufgerufen. Existiert ein
 * gueltiges Cookie, bekommt man einen frischen Access-Token und ist angemeldet
 * - ohne Formular. Existiert keines, ist man eben abgemeldet.
 *
 * Deshalb `laedt`: Ohne diesen Zustand wuerde beim Neuladen einer geschuetzten
 * Seite fuer den Bruchteil einer Sekunde die Anmeldemaske aufblitzen, obwohl
 * der Nutzer angemeldet ist.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useRef<string | null>(null);
  const [nutzer, setNutzer] = useState<Nutzer | null>(null);
  const [laedt, setLaedt] = useState(true);

  const uebernehme = useCallback((antwort: AuthAntwort) => {
    accessToken.current = antwort.accessToken;
    setNutzer(antwort.user);
  }, []);

  const verwerfe = useCallback(() => {
    accessToken.current = null;
    setNutzer(null);
  }, []);

  /** Holt einen neuen Access-Token ueber das Refresh-Cookie. */
  const erneuere = useCallback(async (): Promise<boolean> => {
    try {
      uebernehme(await api<AuthAntwort>('/auth/refresh', { method: 'POST' }));
      return true;
    } catch {
      verwerfe();
      return false;
    }
  }, [uebernehme, verwerfe]);

  // Stille Anmeldung genau einmal beim Aufbau.
  useEffect(() => {
    // `abgebrochen` verhindert ein setState, nachdem die Komponente bereits
    // verlassen wurde - sonst gaebe es eine Warnung und im schlimmsten Fall
    // ein Speicherleck. Ausserdem verlangt die React-Compiler-Regel von
    // Next 16, dass setState nicht synchron im Effekt-Rumpf steht.
    let abgebrochen = false;

    const starteSitzung = async () => {
      await erneuere();
      if (!abgebrochen) setLaedt(false);
    };

    void starteSitzung();

    return () => {
      abgebrochen = true;
    };
  }, [erneuere]);

  /**
   * Aufruf mit Access-Token - und automatischer Erneuerung bei 401.
   *
   * Der Access-Token laeuft nach 15 Minuten ab. Ohne diese Wiederholung
   * bekaeme der Nutzer mitten in der Arbeit eine Fehlermeldung, obwohl seine
   * Sitzung noch gueltig ist.
   *
   * Wichtig: Es wird GENAU EINMAL wiederholt. Ohne diese Grenze entstuende bei
   * dauerhaft ungueltiger Sitzung eine Endlosschleife aus 401 und
   * Erneuerungsversuchen.
   */
  const authFetch = useCallback(
    async <T,>(pfad: string, optionen: RequestInit = {}): Promise<T> => {
      const mitToken = (): RequestInit => ({
        ...optionen,
        headers: {
          ...optionen.headers,
          ...(accessToken.current
            ? { Authorization: `Bearer ${accessToken.current}` }
            : {}),
        },
      });

      try {
        return await api<T>(pfad, mitToken());
      } catch (fehler) {
        if (fehler instanceof ApiFehler && fehler.status === 401) {
          if (await erneuere()) {
            return api<T>(pfad, mitToken());
          }
        }
        throw fehler;
      }
    },
    [erneuere],
  );

  const anmelden = useCallback(
    async (email: string, passwort: string) => {
      uebernehme(
        await api<AuthAntwort>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password: passwort }),
        }),
      );
    },
    [uebernehme],
  );

  const registrieren = useCallback(
    async (email: string, passwort: string, name?: string) => {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password: passwort, name }),
      });
      // Nach erfolgreicher Registrierung direkt anmelden - sonst muesste der
      // Nutzer seine Daten ein zweites Mal eingeben.
      await anmelden(email, passwort);
    },
    [anmelden],
  );

  const abmelden = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Bewusst `catch` und nicht `finally`: Mit `finally` wuerde zwar lokal
      // aufgeraeumt, der Fehler flöge aber weiter - und der Aufrufer im
      // Dashboard kaeme nie bis zur Weiterleitung auf /login. Der Nutzer
      // stuende dann auf einer Seite, fuer die er keine Sitzung mehr hat.
      //
      // Ein fehlgeschlagener Serveraufruf darf das Abmelden nicht verhindern.
      // Das Refresh-Cookie bleibt in diesem Fall bestehen - unschoen, aber
      // besser als ein Nutzer, der nicht herauskommt. Beim naechsten
      // erreichbaren Server wird es beim Anmelden ohnehin ersetzt.
    }

    verwerfe();
  }, [verwerfe]);

  const wert = useMemo<AuthZustand>(
    () => ({ nutzer, laedt, anmelden, registrieren, abmelden, authFetch }),
    [nutzer, laedt, anmelden, registrieren, abmelden, authFetch],
  );

  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthZustand {
  const kontext = useContext(AuthContext);

  if (!kontext) {
    // Ein sprechender Fehler statt `undefined`-Zugriffe irgendwo tief im Baum.
    throw new Error('useAuth muss innerhalb von <AuthProvider> benutzt werden');
  }

  return kontext;
}
