import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartAktionen } from './start-aktionen';

const useAuth = vi.fn();
const push = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuth() as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('Handlungsaufforderungen auf der Startseite', () => {
  beforeEach(() => {
    useAuth.mockReset();
    push.mockReset();
  });

  it('bietet Besuchern die Demo als ersten Weg an', () => {
    useAuth.mockReturnValue({
      nutzer: null,
      laedt: false,
      demoStarten: vi.fn(),
    });

    render(<StartAktionen />);

    expect(
      screen.getByRole('button', { name: 'Demo ansehen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anmelden' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Konto anlegen' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('startet die Demo und leitet ins Dashboard weiter', async () => {
    const demoStarten = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ nutzer: null, laedt: false, demoStarten });

    render(<StartAktionen />);
    await userEvent.click(screen.getByRole('button', { name: 'Demo ansehen' }));

    expect(demoStarten).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  /**
   * ==========================================================================
   * EIN ZWEITER KLICK LEGT EINE ZWEITE UMGEBUNG AN
   * ==========================================================================
   * Der Knopf ruft einen Endpoint auf, der DATENSAETZE ANLEGT. Bliebe er
   * waehrend des Aufrufs bedienbar, erzeugte ein ungeduldiger Doppelklick zwei
   * Demo-Organisationen - eine davon verwaist sofort, weil die Weiterleitung
   * nur in eine fuehrt.
   *
   * Der Server ist dagegen gedrosselt, aber sich darauf zu verlassen hiesse,
   * den Missbrauch erst am Limit abzufangen statt ihn zu vermeiden.
   */
  it('sperrt den Knopf, solange die Demo vorbereitet wird', async () => {
    let aufloesen: (() => void) | undefined;
    const demoStarten = vi.fn(
      () =>
        new Promise<void>((res) => {
          aufloesen = res;
        }),
    );
    useAuth.mockReturnValue({ nutzer: null, laedt: false, demoStarten });

    render(<StartAktionen />);
    const knopf = screen.getByRole('button', { name: 'Demo ansehen' });
    await userEvent.click(knopf);

    const beschaeftigt = screen.getByRole('button', {
      name: 'Wird vorbereitet …',
    });
    expect(beschaeftigt).toBeDisabled();

    await userEvent.click(beschaeftigt);
    expect(demoStarten).toHaveBeenCalledTimes(1);

    aufloesen?.();
  });

  it('meldet einen Fehlschlag, statt stumm nichts zu tun', async () => {
    const demoStarten = vi.fn().mockRejectedValue(new Error('429'));
    useAuth.mockReturnValue({ nutzer: null, laedt: false, demoStarten });

    render(<StartAktionen />);
    await userEvent.click(screen.getByRole('button', { name: 'Demo ansehen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /nicht gestartet werden/i,
    );
    expect(push).not.toHaveBeenCalled();
    // Nach einem Fehler muss ein zweiter Versuch moeglich sein.
    expect(screen.getByRole('button', { name: 'Demo ansehen' })).toBeEnabled();
  });

  it('fuehrt Angemeldete direkt weiter', () => {
    useAuth.mockReturnValue({
      nutzer: { id: 'n-1', email: 'max@example.com' },
      laedt: false,
      demoStarten: vi.fn(),
    });

    render(<StartAktionen />);

    expect(screen.getByRole('link', { name: 'Zum Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(
      screen.queryByRole('button', { name: 'Demo ansehen' }),
    ).not.toBeInTheDocument();
  });

  /**
   * `laedt: true` heisst, dass der Anmeldezustand noch geprueft wird. Es waere
   * verlockend, in dieser Zeit schon die angemeldete Fassung zu zeigen, wenn
   * ein Nutzer im Kontext steht. Dieser Test haelt das Gegenteil fest: Ein
   * Knopf, der nach einer halben Sekunde seine Beschriftung wechselt, wirkt
   * kaputt.
   */
  it('zeigt waehrend der Klaerung die Fassung fuer Besucher', () => {
    useAuth.mockReturnValue({
      nutzer: { id: 'n-1', email: 'max@example.com' },
      laedt: true,
      demoStarten: vi.fn(),
    });

    render(<StartAktionen />);

    expect(
      screen.getByRole('button', { name: 'Demo ansehen' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Zum Dashboard' }),
    ).not.toBeInTheDocument();
  });
});
