import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrganisationenSeite from './page';
import type { Organisation } from '@/lib/organisationen';

const useOrganisationen = vi.fn();
const mutateAsync = vi.fn();

// Der Schutzmantel wird durchgereicht - dieser Test prueft die SEITE, nicht
// die Weiterleitung fuer nicht angemeldete Nutzer. Die hat ihre eigenen Tests
// in geschuetzt.test.tsx.
vi.mock('@/components/geschuetzt', () => ({
  Geschuetzt: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/organisationen', () => ({
  useOrganisationen: () => useOrganisationen() as unknown,
  useOrganisationAnlegen: () => ({ mutateAsync }),
}));

const organisation = (
  ueberschreibung: Partial<Organisation> = {},
): Organisation => ({
  id: 'a1',
  name: 'Acme GmbH',
  role: 'OWNER',
  createdAt: '2026-08-11T10:00:00.000Z',
  ...ueberschreibung,
});

describe('Organisationsseite', () => {
  beforeEach(() => {
    useOrganisationen.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(organisation());
    window.localStorage.clear();
  });

  it('zeigt einen erklaerenden Leerzustand statt einer leeren Flaeche', () => {
    useOrganisationen.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    // "Keine Organisation" ist ein gueltiger Zustand, kein Fehler - wir legen
    // bei der Registrierung bewusst keine automatisch an. Eine leere Liste
    // ohne Text wuerde wie ein Ladefehler wirken.
    expect(screen.getByText('Noch keine Organisation')).toBeInTheDocument();
  });

  it('zeigt Name und eigene Rolle je Organisation', () => {
    useOrganisationen.mockReturnValue({
      data: [
        organisation(),
        organisation({ id: 'b2', name: 'Kunde X', role: 'MEMBER' }),
      ],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Eigentümer')).toBeInTheDocument();
    expect(screen.getByText('Mitglied')).toBeInTheDocument();
  });

  it('markiert ohne gespeicherte Auswahl die erste Organisation als aktiv', async () => {
    useOrganisationen.mockReturnValue({
      data: [organisation(), organisation({ id: 'b2', name: 'Kunde X' })],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    expect(await screen.findByText('aktiv')).toBeInTheDocument();
    // Genau eine ist aktiv - nicht keine und nicht zwei.
    expect(screen.getAllByText('aktiv')).toHaveLength(1);
  });

  it('merkt sich die gewaehlte Organisation ueber localStorage', async () => {
    const nutzer = userEvent.setup();
    useOrganisationen.mockReturnValue({
      data: [organisation(), organisation({ id: 'b2', name: 'Kunde X' })],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    await nutzer.click(
      await screen.findByRole('button', { name: 'Aktivieren' }),
    );

    expect(window.localStorage.getItem('devboard.aktive-organisation')).toBe(
      'b2',
    );
  });

  /**
   * ==========================================================================
   * PERSISTIERTER ZUSTAND IST EINE VERMUTUNG, KEINE AUSSAGE
   * ==========================================================================
   * Zwischen dem Speichern und dem naechsten Besuch kann die Mitgliedschaft
   * beendet worden sein. Wuerde die gespeicherte ID ungeprueft benutzt, liefe
   * jede Anfrage in ein 404 und die Anwendung saehe kaputt aus, obwohl alles
   * richtig funktioniert.
   */
  it('faellt auf die erste Organisation zurueck, wenn die gemerkte fehlt', async () => {
    window.localStorage.setItem(
      'devboard.aktive-organisation',
      'nicht-mehr-mitglied',
    );
    useOrganisationen.mockReturnValue({
      data: [organisation({ id: 'a1', name: 'Acme GmbH' })],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    expect(await screen.findByText('aktiv')).toBeInTheDocument();
  });

  it('lehnt einen zu kurzen Namen ab, ohne den Server zu fragen', async () => {
    const nutzer = userEvent.setup();
    useOrganisationen.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    await nutzer.type(screen.getByLabelText('Name'), 'A');
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(
      await screen.findByText(/mindestens 2 Zeichen/i),
    ).toBeInTheDocument();

    // Der Sinn der Pruefung im Browser: keine unnoetige Anfrage. Sie ist
    // Bequemlichkeit, KEIN Schutz - der sitzt im Backend, wo dasselbe Schema
    // ein zweites Mal prueft.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('legt eine Organisation an und leert danach das Feld', async () => {
    const nutzer = userEvent.setup();
    useOrganisationen.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });

    render(<OrganisationenSeite />);

    const feld = screen.getByLabelText('Name');
    await nutzer.type(feld, 'Neue Firma');
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Neue Firma'));

    // Ohne das Leeren stuende der alte Name noch im Feld - und ein zweiter
    // Klick legte versehentlich dieselbe Organisation noch einmal an.
    await waitFor(() => expect(feld).toHaveValue(''));
  });

  it('zeigt einen Hinweis, wenn die Liste nicht geladen werden kann', () => {
    useOrganisationen.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });

    render(<OrganisationenSeite />);

    expect(
      screen.getByText('Organisationen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});
