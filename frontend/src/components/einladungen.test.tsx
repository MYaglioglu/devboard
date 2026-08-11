import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EinladungenBereich } from './einladungen';
import { ApiFehler } from '@/lib/api';
import type { AusgestellteEinladung, Einladung } from '@/lib/organisationen';

const useEinladungen = vi.fn();
const einladen = vi.fn();
const zurueckziehen = vi.fn();

vi.mock('@/lib/organisationen', () => ({
  useEinladungen: (orgId: string, aktiv: boolean) =>
    useEinladungen(orgId, aktiv) as unknown,
  useEinladen: () => ({ mutateAsync: einladen }),
  useEinladungZurueckziehen: () => ({
    mutateAsync: zurueckziehen,
    isPending: false,
  }),
}));

const einladung = (ueberschreibung: Partial<Einladung> = {}): Einladung => ({
  id: 'e1',
  email: 'gast@example.com',
  role: 'MEMBER',
  expiresAt: '2026-08-18T10:00:00.000Z',
  createdAt: '2026-08-11T10:00:00.000Z',
  ...ueberschreibung,
});

const ausgestellt: AusgestellteEinladung = {
  ...einladung(),
  token: 'geheimer-token-9Xk2',
};

describe('Einladungsbereich', () => {
  beforeEach(() => {
    useEinladungen.mockReset();
    einladen.mockReset();
    zurueckziehen.mockReset();
    einladen.mockResolvedValue(ausgestellt);
    zurueckziehen.mockResolvedValue(undefined);
    useEinladungen.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
  });

  /**
   * ==========================================================================
   * EIN MEMBER SIEHT DIESEN BEREICH GAR NICHT
   * ==========================================================================
   * Er darf sehen, WER dazugehoert - nicht, wer noch eingeladen ist. Das sind
   * E-Mail-Adressen von Menschen ausserhalb des Teams. Das Backend lehnt fuer
   * ihn mit 403 ab; hier wird die Abfrage deshalb gar nicht erst gestartet.
   */
  it('rendert fuer einen MEMBER nichts und fragt nicht ab', () => {
    const { container } = render(
      <EinladungenBereich orgId="org-1" eigeneRolle="MEMBER" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(useEinladungen).toHaveBeenCalledWith('org-1', false);
  });

  it('zeigt offene Einladungen mit Rolle und Ablauf', () => {
    useEinladungen.mockReturnValue({
      data: [einladung()],
      isPending: false,
      isError: false,
    });

    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    expect(screen.getByText('gast@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Mitglied · gültig bis/)).toBeInTheDocument();
  });

  it('erklaert die leere Liste', () => {
    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    expect(screen.getByText('Keine offenen Einladungen.')).toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * DER WICHTIGSTE TEST DIESER DATEI
   * ==========================================================================
   * Das Backend speichert nur den SHA-256-Hash und gibt den Rohwert genau
   * einmal zurueck. Er laesst sich nicht nachschlagen - wer ihn verliert, muss
   * neu einladen.
   *
   * Die Oberflaeche MUSS ihn deshalb im Moment des Anlegens zeigen UND sagen,
   * dass er danach weg ist. Dasselbe Verhalten wie bei frisch erzeugten
   * API-Schluesseln bei GitHub oder Stripe - dieselbe Ursache.
   */
  it('zeigt den Einladungslink nach dem Anlegen und weist auf die Einmaligkeit hin', async () => {
    const nutzer = userEvent.setup();
    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'gast@example.com',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    await waitFor(() =>
      expect(einladen).toHaveBeenCalledWith({
        email: 'gast@example.com',
        role: 'MEMBER',
      }),
    );

    expect(
      await screen.findByText(/nur dieses eine Mal angezeigt/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\/einladung\?token=geheimer-token-9Xk2/),
    ).toBeInTheDocument();
  });

  it('blendet den Token erst aus, wenn der Nutzer schliesst', async () => {
    const nutzer = userEvent.setup();
    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'gast@example.com',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    const kasten = await screen.findByText(/nur dieses eine Mal angezeigt/i);
    expect(kasten).toBeInTheDocument();

    // Ein Kasten, der von selbst verschwindet, waere hier eine Falle - der
    // Wert ist danach unwiederbringlich weg.
    await nutzer.click(screen.getByRole('button', { name: 'Schließen' }));

    await waitFor(() =>
      expect(
        screen.queryByText(/nur dieses eine Mal angezeigt/i),
      ).not.toBeInTheDocument(),
    );
  });

  /**
   * Ein ADMIN darf nur MEMBER einladen - sonst koennte er ueber den Umweg der
   * Einladung Rechte vergeben, die zu vergeben ihm nicht zusteht. Das Backend
   * lehnt mit 403 ab; hier verschwindet die Auswahl, damit der Versuch gar
   * nicht erst entsteht.
   */
  it('gibt einem ADMIN keine Rollenauswahl und laedt als MEMBER ein', async () => {
    const nutzer = userEvent.setup();
    render(<EinladungenBereich orgId="org-1" eigeneRolle="ADMIN" />);

    expect(screen.queryByLabelText('Rolle')).not.toBeInTheDocument();

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'gast@example.com',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    await waitFor(() =>
      expect(einladen).toHaveBeenCalledWith({
        email: 'gast@example.com',
        role: 'MEMBER',
      }),
    );
  });

  it('laesst einen OWNER die Rolle waehlen', async () => {
    const nutzer = userEvent.setup();
    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'gast@example.com',
    );
    await nutzer.selectOptions(screen.getByLabelText('Rolle'), 'ADMIN');
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    await waitFor(() =>
      expect(einladen).toHaveBeenCalledWith({
        email: 'gast@example.com',
        role: 'ADMIN',
      }),
    );
  });

  it('lehnt eine ungueltige Adresse ab, ohne den Server zu fragen', async () => {
    const nutzer = userEvent.setup();
    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'keine-adresse',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    expect(
      await screen.findByText(/gültige E-Mail-Adresse/i),
    ).toBeInTheDocument();
    expect(einladen).not.toHaveBeenCalled();
  });

  it('zeigt die Serverbegruendung bei einem Fehlschlag', async () => {
    const nutzer = userEvent.setup();
    einladen.mockRejectedValue(
      new ApiFehler('Als ADMIN können Sie nur MEMBER einladen', 403),
    );

    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);

    await nutzer.type(
      screen.getByLabelText('E-Mail-Adresse einladen'),
      'gast@example.com',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Einladen' }));

    expect(await screen.findByText(/nur MEMBER einladen/i)).toBeInTheDocument();
  });

  it('zieht eine Einladung zurueck', async () => {
    const nutzer = userEvent.setup();
    useEinladungen.mockReturnValue({
      data: [einladung()],
      isPending: false,
      isError: false,
    });

    render(<EinladungenBereich orgId="org-1" eigeneRolle="OWNER" />);
    await nutzer.click(screen.getByRole('button', { name: 'Zurückziehen' }));

    await waitFor(() => expect(zurueckziehen).toHaveBeenCalledWith('e1'));
  });
});
