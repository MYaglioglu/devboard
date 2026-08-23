import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemStatus } from './system-status';
import type { HealthStatus } from '@/lib/api';

const fetchHealth = vi.fn();

vi.mock('@/lib/api', () => ({
  fetchHealth: () => fetchHealth() as Promise<HealthStatus>,
}));

const gesund = (
  ueberschreibung: Partial<HealthStatus> = {},
): HealthStatus => ({
  status: 'ok',
  uptimeSeconds: 42,
  timestamp: '2026-08-23T09:00:00.000Z',
  checks: { database: 'up' },
  ...ueberschreibung,
});

describe('Statusanzeige in der Fusszeile', () => {
  beforeEach(() => {
    fetchHealth.mockReset();
  });

  it('meldet den gesunden Fall', async () => {
    fetchHealth.mockResolvedValue(gesund());

    render(<SystemStatus />);

    expect(
      await screen.findByText('API erreichbar, Datenbank verbunden'),
    ).toBeInTheDocument();
  });

  it('meldet einen Ausfall des Backends', async () => {
    fetchHealth.mockRejectedValue(new Error('Netzwerkfehler'));

    render(<SystemStatus />);

    expect(await screen.findByText('API nicht erreichbar')).toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * EINE ERREICHBARE API MIT TOTER DATENBANK IST NICHT GESUND
   * ==========================================================================
   * Der Grenzfall, den man beim Schreiben leicht uebersieht: Die Anfrage geht
   * durch, es kommt eine Antwort - aber `database: 'down'`. Wer nur
   * unterscheidet, ob der Aufruf gelungen ist, meldet hier faelschlich alles
   * in Ordnung.
   *
   * Das Backend antwortet in diesem Fall mit 503, `fetchHealth` wuerde also
   * ohnehin ablehnen. Der Test haelt trotzdem fest, dass die Anzeige auch
   * dann richtig liegt, wenn eine spaetere Aenderung am Endpoint den Fall
   * durchreicht statt zu werfen.
   */
  it('wertet eine erreichbare API mit ausgefallener Datenbank als Ausfall', async () => {
    fetchHealth.mockResolvedValue(
      gesund({ status: 'degraded', checks: { database: 'down' } }),
    );

    render(<SystemStatus />);

    expect(await screen.findByText('API nicht erreichbar')).toBeInTheDocument();
  });

  it('zeigt zuerst an, dass geprueft wird', async () => {
    fetchHealth.mockReturnValue(new Promise(() => {}));

    render(<SystemStatus />);

    await waitFor(() =>
      expect(screen.getByText('Status wird geprüft …')).toBeInTheDocument(),
    );
  });
});
