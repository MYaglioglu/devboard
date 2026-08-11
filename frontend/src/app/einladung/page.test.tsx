import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EinladungSeite from './page';
import { ApiFehler } from '@/lib/api';

const replace = vi.fn();
const annehmen = vi.fn();
const useAuth = vi.fn();

let suchparameter = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(suchparameter),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuth() as unknown,
}));

vi.mock('@/lib/organisationen', () => ({
  useEinladungAnnehmen: () => ({ mutateAsync: annehmen, isPending: false }),
}));

describe('Einladungsseite', () => {
  beforeEach(() => {
    replace.mockReset();
    annehmen.mockReset();
    useAuth.mockReset();
    annehmen.mockResolvedValue({ organizationId: 'org-1', role: 'MEMBER' });
    suchparameter = 'token=9Xk2';
    useAuth.mockReturnValue({
      nutzer: { id: 'ich', email: 'ich@example.com' },
      laedt: false,
    });
  });

  it('weist einen Link ohne Token ab', async () => {
    suchparameter = '';

    render(<EinladungSeite />);

    expect(
      await screen.findByText(/Link ist unvollständig/i),
    ).toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * DER TYPISCHE BESUCHER IST NICHT ANGEMELDET
   * ==========================================================================
   * Deshalb steht auf dieser Seite bewusst kein <Geschuetzt>: Das wuerde ihn
   * auf /login werfen und dabei den Token aus der Adresszeile verlieren - nach
   * der Anmeldung stuende er ratlos auf dem Dashboard.
   */
  it('bietet einem Abgemeldeten Anmeldung und Registrierung mit Rueckweg an', async () => {
    useAuth.mockReturnValue({ nutzer: null, laedt: false });

    render(<EinladungSeite />);

    const anmelden = await screen.findByRole('link', { name: 'Anmelden' });
    expect(anmelden).toHaveAttribute(
      'href',
      '/login?weiter=%2Feinladung%3Ftoken%3D9Xk2',
    );
    expect(screen.getByRole('link', { name: 'Konto anlegen' })).toHaveAttribute(
      'href',
      '/register?weiter=%2Feinladung%3Ftoken%3D9Xk2',
    );
  });

  it('weist einen Abgemeldeten auf die Adressbindung hin', async () => {
    useAuth.mockReturnValue({ nutzer: null, laedt: false });

    render(<EinladungSeite />);

    // Die Einladung ist an eine Adresse gebunden. Wer sich mit der falschen
    // anmeldet, bekommt 403 - das soll er vorher wissen.
    expect(
      await screen.findByText(/an eine bestimmte E-Mail-Adresse gebunden/i),
    ).toBeInTheDocument();
  });

  it('tritt bei und leitet in die Organisation weiter', async () => {
    const nutzer = userEvent.setup();

    render(<EinladungSeite />);
    await nutzer.click(
      await screen.findByRole('button', { name: 'Beitreten' }),
    );

    await waitFor(() => expect(annehmen).toHaveBeenCalledWith('9Xk2'));
    // Direkt hinein - der Nutzer hat gerade bestaetigt, dass er dorthin will.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/organizations/org-1'),
    );
  });

  /**
   * Die Meldung kommt unveraendert vom Server. "Einladung ungueltig" steht
   * dort fuer unbekannt, bereits eingeloest UND zurueckgezogen - damit
   * niemand erfaehrt, ob ein Token einmal echt war.
   */
  it('zeigt die Serverbegruendung bei einer ungueltigen Einladung', async () => {
    const nutzer = userEvent.setup();
    annehmen.mockRejectedValue(new ApiFehler('Einladung ungueltig', 404));

    render(<EinladungSeite />);
    await nutzer.click(
      await screen.findByRole('button', { name: 'Beitreten' }),
    );

    expect(await screen.findByText('Einladung ungueltig')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('zeigt die Serverbegruendung bei falscher Adresse', async () => {
    const nutzer = userEvent.setup();
    annehmen.mockRejectedValue(
      new ApiFehler(
        'Diese Einladung ist an eine andere E-Mail-Adresse gerichtet',
        403,
      ),
    );

    render(<EinladungSeite />);
    await nutzer.click(
      await screen.findByRole('button', { name: 'Beitreten' }),
    );

    expect(
      await screen.findByText(/andere E-Mail-Adresse gerichtet/i),
    ).toBeInTheDocument();
  });

  it('wartet die stille Anmeldung ab, statt Abgemeldeten-Inhalt zu zeigen', async () => {
    useAuth.mockReturnValue({ nutzer: null, laedt: true });

    render(<EinladungSeite />);

    // Ohne diesen Zustand fluege beim Neuladen kurz "Bitte anmelden" auf,
    // obwohl ein gueltiges Refresh-Cookie vorliegt.
    expect(
      await screen.findByText(/Sitzung wird geprüft/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Anmelden' }),
    ).not.toBeInTheDocument();
  });
});
