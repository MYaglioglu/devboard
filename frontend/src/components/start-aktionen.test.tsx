import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartAktionen } from './start-aktionen';

const useAuth = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuth() as unknown,
}));

describe('Handlungsaufforderungen auf der Startseite', () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it('bietet Besuchern Anmelden und Registrieren an', () => {
    useAuth.mockReturnValue({ nutzer: null, laedt: false });

    render(<StartAktionen />);

    expect(screen.getByRole('link', { name: 'Anmelden' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Konto anlegen' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('fuehrt Angemeldete direkt weiter', () => {
    useAuth.mockReturnValue({
      nutzer: { id: 'n-1', email: 'max@example.com' },
      laedt: false,
    });

    render(<StartAktionen />);

    expect(screen.getByRole('link', { name: 'Zum Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(
      screen.queryByRole('link', { name: 'Anmelden' }),
    ).not.toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * WAEHREND DER KLAERUNG WIRD NICHT VORWEGGENOMMEN
   * ==========================================================================
   * `laedt: true` heisst, dass der Anmeldezustand noch geprueft wird. Es waere
   * verlockend, in dieser Zeit schon die angemeldete Fassung zu zeigen, wenn
   * ein Nutzer im Kontext steht - der Wechsel kaeme dann fruehe.
   *
   * Dieser Test haelt das Gegenteil fest: Solange geklaert wird, sieht man die
   * Besucher-Fassung. Ein Knopf, der nach einer halben Sekunde seine
   * Beschriftung wechselt, wirkt kaputt - und die Besucher-Fassung ist der
   * haeufigere Fall und der, der ohnehin passt, wenn niemand angemeldet ist.
   */
  it('zeigt waehrend der Klaerung die Fassung fuer Besucher', () => {
    useAuth.mockReturnValue({
      nutzer: { id: 'n-1', email: 'max@example.com' },
      laedt: true,
    });

    render(<StartAktionen />);

    expect(screen.getByRole('link', { name: 'Anmelden' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Zum Dashboard' }),
    ).not.toBeInTheDocument();
  });
});
