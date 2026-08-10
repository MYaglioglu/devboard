import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Geschuetzt } from './geschuetzt';

const replace = vi.fn();
const authZustand = {
  nutzer: null as { id: string; email: string } | null,
  laedt: true,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authZustand,
}));

describe('Geschuetzt', () => {
  beforeEach(() => {
    replace.mockReset();
    authZustand.nutzer = null;
    authZustand.laedt = true;
  });

  it('zeigt waehrend der Sitzungspruefung einen Hinweis', () => {
    render(
      <Geschuetzt>
        <p>Geheimer Inhalt</p>
      </Geschuetzt>,
    );

    expect(screen.getByText(/Sitzung wird geprüft/i)).toBeInTheDocument();
    expect(screen.queryByText('Geheimer Inhalt')).not.toBeInTheDocument();
  });

  it('leitet waehrend der Pruefung NICHT um', () => {
    render(
      <Geschuetzt>
        <p>Geheimer Inhalt</p>
      </Geschuetzt>,
    );

    // Der wichtigste Fall beim Neuladen: Solange das stille Erneuern laeuft,
    // darf nicht weitergeleitet werden - sonst floege ein angemeldeter Nutzer
    // bei jedem Neuladen kurz auf die Anmeldeseite.
    expect(replace).not.toHaveBeenCalled();
  });

  it('leitet ohne Sitzung auf die Anmeldeseite um', async () => {
    authZustand.laedt = false;

    render(
      <Geschuetzt>
        <p>Geheimer Inhalt</p>
      </Geschuetzt>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('zeigt den Inhalt waehrend der Weiterleitung nicht an', () => {
    authZustand.laedt = false;

    render(
      <Geschuetzt>
        <p>Geheimer Inhalt</p>
      </Geschuetzt>,
    );

    // Ohne diese Sperre blitzte der Inhalt kurz auf, bevor die Weiterleitung
    // greift - Unbefugte saehen fuer einen Moment Daten.
    expect(screen.queryByText('Geheimer Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt den Inhalt bei bestehender Sitzung', () => {
    authZustand.laedt = false;
    authZustand.nutzer = { id: 'nutzer-1', email: 'max@example.com' };

    render(
      <Geschuetzt>
        <p>Geheimer Inhalt</p>
      </Geschuetzt>,
    );

    expect(screen.getByText('Geheimer Inhalt')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
