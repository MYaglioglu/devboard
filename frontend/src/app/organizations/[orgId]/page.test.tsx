import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFehler } from '@/lib/api';
import OrganisationSeite from './page';
import type { Mitglied, Organisation } from '@/lib/organisationen';

const replace = vi.fn();
const useOrganisation = vi.fn();
const useMitglieder = vi.fn();
const rolleAendern = vi.fn();
const entfernen = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org-1' }),
  useRouter: () => ({ replace }),
}));

vi.mock('@/components/geschuetzt', () => ({
  Geschuetzt: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ nutzer: { id: 'ich', email: 'ich@example.com' } }),
}));

vi.mock('@/lib/organisationen', () => ({
  useOrganisation: () => useOrganisation() as unknown,
  useMitglieder: () => useMitglieder() as unknown,
  useRolleAendern: () => ({ mutateAsync: rolleAendern, isPending: false }),
  useMitgliedEntfernen: () => ({ mutateAsync: entfernen, isPending: false }),
}));

const organisation = (rolle: Organisation['role'] = 'OWNER'): Organisation => ({
  id: 'org-1',
  name: 'Acme GmbH',
  role: rolle,
  createdAt: '2026-08-11T10:00:00.000Z',
});

const mitglied = (ueberschreibung: Partial<Mitglied> = {}): Mitglied => ({
  userId: 'ich',
  email: 'ich@example.com',
  name: 'Ich',
  role: 'OWNER',
  mitgliedSeit: '2026-08-11T10:00:00.000Z',
  ...ueberschreibung,
});

/** Setzt beide Abfragen auf "geladen". */
const zeige = (rolle: Organisation['role'], mitglieder: Mitglied[]) => {
  useOrganisation.mockReturnValue({
    data: organisation(rolle),
    isPending: false,
    isError: false,
  });
  useMitglieder.mockReturnValue({
    data: mitglieder,
    isPending: false,
    isError: false,
  });
};

describe('Organisationsdetailseite', () => {
  beforeEach(() => {
    replace.mockReset();
    useOrganisation.mockReset();
    useMitglieder.mockReset();
    rolleAendern.mockReset();
    entfernen.mockReset();
    rolleAendern.mockResolvedValue(mitglied());
    entfernen.mockResolvedValue(undefined);
  });

  /**
   * ==========================================================================
   * 404 IST EINE AUSSAGE, KEIN LADEFEHLER
   * ==========================================================================
   * Das Backend antwortet mit 404, wenn die Organisation nicht existiert ODER
   * der Nutzer kein Mitglied ist - ununterscheidbar, und das mit Absicht. Der
   * Nutzer soll verstehen, dass er hier nichts zu suchen hat, statt zum
   * Neuladen verleitet zu werden.
   */
  it('erklaert bei 404, dass kein Zugriff besteht', () => {
    useOrganisation.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiFehler('Organisation nicht gefunden', 404),
    });
    useMitglieder.mockReturnValue({ data: undefined, isPending: false });

    render(<OrganisationSeite />);

    expect(
      screen.getByText(/existiert nicht oder Sie sind kein Mitglied/i),
    ).toBeInTheDocument();
  });

  it('unterscheidet einen echten Ladefehler von 404', () => {
    useOrganisation.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiFehler('Interner Serverfehler', 500),
    });
    useMitglieder.mockReturnValue({ data: undefined, isPending: false });

    render(<OrganisationSeite />);

    expect(
      screen.getByText('Die Organisation konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('zeigt Name, eigene Rolle und die Mitglieder', () => {
    zeige('OWNER', [
      mitglied(),
      mitglied({
        userId: 'b',
        email: 'kollege@example.com',
        name: 'Kollege',
        role: 'MEMBER',
      }),
    ]);

    render(<OrganisationSeite />);

    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Ihre Rolle: Eigentümer')).toBeInTheDocument();
    expect(screen.getByText('kollege@example.com')).toBeInTheDocument();
  });

  it('gibt nur einem OWNER die Rollenauswahl', () => {
    zeige('ADMIN', [
      mitglied({ userId: 'b', email: 'kollege@example.com', role: 'MEMBER' }),
    ]);

    render(<OrganisationSeite />);

    // Ein ADMIN darf keine Rollen vergeben - sonst koennte er sich selbst zum
    // OWNER machen. Die Auswahl fehlt deshalb; das Backend lehnt zusaetzlich
    // mit 403 ab.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Mitglied')).toBeInTheDocument();
  });

  it('verbirgt vor einem ADMIN den Entfernen-Knopf bei einem OWNER', () => {
    zeige('ADMIN', [
      mitglied({ userId: 'b', email: 'chef@example.com', role: 'OWNER' }),
    ]);

    render(<OrganisationSeite />);

    // Sonst koennte ein ADMIN alle OWNER entfernen und die Organisation
    // uebernehmen.
    expect(
      screen.queryByRole('button', { name: 'Entfernen' }),
    ).not.toBeInTheDocument();
  });

  it('laesst einen MEMBER die Organisation verlassen, aber niemanden entfernen', () => {
    zeige('MEMBER', [
      mitglied({ role: 'MEMBER' }),
      mitglied({ userId: 'b', email: 'kollege@example.com', role: 'MEMBER' }),
    ]);

    render(<OrganisationSeite />);

    // Der Fall, den ein Guard nicht entscheiden koennte: sich selbst ja,
    // andere nein.
    expect(
      screen.getByRole('button', { name: 'Verlassen' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Entfernen' }),
    ).not.toBeInTheDocument();
  });

  it('fragt vor dem Entfernen nach', async () => {
    const nutzer = userEvent.setup();
    zeige('OWNER', [
      mitglied({ userId: 'b', email: 'kollege@example.com', role: 'MEMBER' }),
    ]);

    render(<OrganisationSeite />);
    await nutzer.click(screen.getByRole('button', { name: 'Entfernen' }));

    // Nichts passiert ohne Bestaetigung - ein Fehlklick darf niemanden
    // hinauswerfen.
    expect(entfernen).not.toHaveBeenCalled();
    expect(screen.getByText('Sicher?')).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await waitFor(() => expect(entfernen).toHaveBeenCalledWith('b'));
  });

  /**
   * ==========================================================================
   * DER FALL, DEN MAN LEICHT UEBERSIEHT
   * ==========================================================================
   * Entfernt man sich selbst, liefert genau die Seite, auf der man steht, ab
   * diesem Moment 404. Ohne Weiterleitung saehe der Nutzer "Diese Organisation
   * existiert nicht" auf einer Seite, die er gerade noch benutzt hat.
   */
  it('leitet zur Uebersicht, wenn man sich selbst entfernt', async () => {
    const nutzer = userEvent.setup();
    zeige('MEMBER', [mitglied({ role: 'MEMBER' })]);

    render(<OrganisationSeite />);
    await nutzer.click(screen.getByRole('button', { name: 'Verlassen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/organizations'));
  });

  it('leitet NICHT weiter, wenn jemand anderes entfernt wird', async () => {
    const nutzer = userEvent.setup();
    zeige('OWNER', [
      mitglied(),
      mitglied({ userId: 'b', email: 'kollege@example.com', role: 'MEMBER' }),
    ]);

    render(<OrganisationSeite />);
    await nutzer.click(screen.getByRole('button', { name: 'Entfernen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));

    await waitFor(() => expect(entfernen).toHaveBeenCalledWith('b'));
    expect(replace).not.toHaveBeenCalled();
  });

  it('aendert die Rolle ueber die Auswahl', async () => {
    const nutzer = userEvent.setup();
    zeige('OWNER', [
      mitglied({ userId: 'b', email: 'kollege@example.com', role: 'MEMBER' }),
    ]);

    render(<OrganisationSeite />);
    await nutzer.selectOptions(
      screen.getByRole('combobox', { name: /Rolle von kollege/i }),
      'ADMIN',
    );

    await waitFor(() =>
      expect(rolleAendern).toHaveBeenCalledWith({
        userId: 'b',
        role: 'ADMIN',
      }),
    );
  });

  /**
   * Die Meldung kommt unveraendert vom Server. Sie ist dort bereits
   * verstaendlich formuliert - eine eigene Fassung im Frontend wuerde bei
   * jeder Aenderung der Regel auseinanderlaufen.
   */
  it('zeigt die Serverbegruendung, wenn der letzte OWNER bleiben muss', async () => {
    const nutzer = userEvent.setup();
    zeige('OWNER', [mitglied()]);
    rolleAendern.mockRejectedValue(
      new ApiFehler('Die Organisation braucht mindestens einen OWNER.', 409),
    );

    render(<OrganisationSeite />);
    await nutzer.selectOptions(
      screen.getByRole('combobox', { name: /Rolle von ich/i }),
      'MEMBER',
    );

    expect(
      await screen.findByText(/mindestens einen OWNER/i),
    ).toBeInTheDocument();
  });
});
