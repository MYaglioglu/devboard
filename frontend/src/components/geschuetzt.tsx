'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';

/**
 * Umschliesst Seiten, die eine Anmeldung voraussetzen.
 *
 * ============================================================================
 * DAS IST KEIN SICHERHEITSMECHANISMUS
 * ============================================================================
 * Diese Komponente verhindert nur, dass ein nicht angemeldeter Nutzer eine
 * leere Seite sieht. Sie schuetzt KEINE Daten.
 *
 * Der Grund: Alles hier laeuft im Browser und ist mit den Entwicklerwerkzeugen
 * in Sekunden auszuhebeln. Ein Angreifer wuerde die Seite ohnehin nicht
 * aufrufen, sondern die API direkt.
 *
 * Der echte Schutz sitzt im Backend - im globalen Guard, der ohne gueltigen
 * Access-Token 401 antwortet. Selbst wenn jemand diese Weiterleitung umgeht,
 * bekommt er hier nichts zu sehen: Die Daten kaemen gar nicht erst an.
 *
 * Merksatz: Frontend-Schutz ist Benutzerfuehrung, Backend-Schutz ist
 * Sicherheit. Wer beides verwechselt, baut eine Anwendung, die nur so lange
 * sicher wirkt, wie niemand F12 drueckt.
 */
export function Geschuetzt({ children }: { children: React.ReactNode }) {
  const { nutzer, laedt } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Erst weiterleiten, wenn die stille Anmeldung abgeschlossen ist. Sonst
    // fluege man beim Neuladen kurz auf die Anmeldeseite, obwohl ein
    // gueltiges Refresh-Cookie vorliegt.
    if (!laedt && !nutzer) router.replace('/login');
  }, [laedt, nutzer, router]);

  if (laedt) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Sitzung wird geprüft …
      </div>
    );
  }

  // Waehrend der Weiterleitung nichts zeigen - der Inhalt wuerde sonst kurz
  // aufblitzen.
  if (!nutzer) return null;

  return <>{children}</>;
}
