'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { AuthProvider } from '@/lib/auth-context';

/**
 * Buendelt alle Provider, die die ganze Anwendung braucht.
 *
 * Eine eigene Datei mit `'use client'`, damit das Wurzel-Layout eine
 * SERVER-Komponente bleiben kann. Wuerde man `'use client'` direkt ins Layout
 * schreiben, wuerde der gesamte Baum darunter zur Client-Komponente - und man
 * verloere das serverseitige Rendern fuer alle Seiten.
 *
 * ============================================================================
 * WARUM DER QueryClient IN useState ENTSTEHT
 * ============================================================================
 * Ein `new QueryClient()` auf Modulebene waere auf dem Server EINE Instanz
 * fuer ALLE Besucher - deren Caches sich vermischen wuerden. Mit `useState`
 * bekommt jede Rendersitzung ihre eigene, und die Instanz ueberlebt trotzdem
 * jedes Neuzeichnen.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Wie lange gelten Daten als frisch? 30 Sekunden verhindern, dass
            // jeder Fokuswechsel eine neue Anfrage ausloest.
            staleTime: 30_000,
            // Bei 401 NICHT wiederholen: Das ist kein Netzwerkfehler, sondern
            // eine Aussage. Die Erneuerung uebernimmt bereits `authFetch`.
            retry: (versuche, fehler) =>
              fehler instanceof Error && 'status' in fehler
                ? false
                : versuche < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
