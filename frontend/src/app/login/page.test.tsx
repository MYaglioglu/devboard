import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFehler } from '@/lib/api';
import LoginSeite from './page';

const replace = vi.fn();
const anmelden = vi.fn();

// `next/navigation` funktioniert nur innerhalb des Next-Routers. Im Test wird
// es durch eine Attrappe ersetzt - so laesst sich pruefen, WOHIN weitergeleitet
// wird, ohne einen ganzen Router aufzubauen.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

// Der AuthProvider wird ebenfalls ersetzt. Dieser Test prueft das FORMULAR,
// nicht die Anmeldelogik - die hat ihre eigenen Tests in auth-context.test.tsx.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ anmelden, nutzer: null, laedt: false }),
}));

describe('Anmeldeseite', () => {
  beforeEach(() => {
    replace.mockReset();
    anmelden.mockReset();
    anmelden.mockResolvedValue(undefined);
  });

  it('zeigt Felder fuer E-Mail und Passwort', () => {
    render(<LoginSeite />);

    expect(screen.getByLabelText('E-Mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument();
  });

  it('lehnt eine ungueltige E-Mail-Adresse ab, ohne den Server zu fragen', async () => {
    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'keine-adresse');
    await nutzer.type(screen.getByLabelText('Passwort'), 'geheim12345');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(
      await screen.findByText(/gueltige E-Mail-Adresse/i),
    ).toBeInTheDocument();

    // Der Sinn der Validierung im Browser: keine unnoetige Anfrage. Sie ist
    // Bequemlichkeit, KEIN Schutz - der sitzt im Backend.
    expect(anmelden).not.toHaveBeenCalled();
  });

  it('verlangt ein Passwort', async () => {
    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'max@example.com');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByText(/Bitte ein Passwort/i)).toBeInTheDocument();
    expect(anmelden).not.toHaveBeenCalled();
  });

  it('meldet bei gueltiger Eingabe an und leitet zum Dashboard', async () => {
    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'max@example.com');
    await nutzer.type(screen.getByLabelText('Passwort'), 'einSicheresPasswort');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() =>
      expect(anmelden).toHaveBeenCalledWith(
        'max@example.com',
        'einSicheresPasswort',
      ),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('zeigt die Fehlermeldung des Servers unveraendert an', async () => {
    anmelden.mockRejectedValue(
      new ApiFehler('E-Mail oder Passwort ist falsch', 401),
    );

    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'max@example.com');
    await nutzer.type(screen.getByLabelText('Passwort'), 'falschesPasswort');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    // Die Meldung ist serverseitig absichtlich generisch. Das Frontend darf
    // sie nicht "hilfreicher" umformulieren - sonst waere die Muehe im
    // Backend umsonst.
    expect(
      await screen.findByText('E-Mail oder Passwort ist falsch'),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('leitet bei einem Netzwerkfehler NICHT weiter', async () => {
    anmelden.mockRejectedValue(new TypeError('Failed to fetch'));

    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'max@example.com');
    await nutzer.type(screen.getByLabelText('Passwort'), 'einSicheresPasswort');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(
      await screen.findByText(/derzeit nicht moeglich/i),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('markiert fehlerhafte Felder fuer Screenreader', async () => {
    const nutzer = userEvent.setup();
    render(<LoginSeite />);

    await nutzer.type(screen.getByLabelText('E-Mail'), 'keine-adresse');
    await nutzer.click(screen.getByRole('button', { name: 'Anmelden' }));

    // Ohne aria-invalid waere die rote Umrandung fuer Screenreader unsichtbar -
    // der Fehler existierte dann nur fuer sehende Nutzer.
    await waitFor(() =>
      expect(screen.getByLabelText('E-Mail')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
  });
});
