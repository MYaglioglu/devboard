import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProjekteSeite from './page';
import { ApiFehler } from '@/lib/api';
import type { Projekt } from '@/lib/projekte';

const useOrganisation = vi.fn();
const useProjekte = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/components/geschuetzt', () => ({
  Geschuetzt: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org-1' }),
}));

vi.mock('@/lib/organisationen', () => ({
  useOrganisation: () => useOrganisation() as unknown,
}));

vi.mock('@/lib/projekte', () => ({
  useProjekte: (orgId: string, auchArchivierte: boolean) =>
    useProjekte(orgId, auchArchivierte) as unknown,
  useProjektAnlegen: () => ({ mutateAsync }),
}));

const projekt = (ueberschreibung: Partial<Projekt> = {}): Projekt => ({
  id: 'p1',
  name: 'Relaunch',
  description: null,
  archivedAt: null,
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
  ...ueberschreibung,
});

const alsRolle = (role: 'OWNER' | 'ADMIN' | 'MEMBER') => {
  useOrganisation.mockReturnValue({
    data: { id: 'org-1', name: 'Acme', role, createdAt: '' },
    isPending: false,
    isError: false,
  });
};

const mitProjekten = (data: Projekt[]) => {
  useProjekte.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
  });
};

describe('Projektliste', () => {
  beforeEach(() => {
    useOrganisation.mockReset();
    useProjekte.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(projekt());
    alsRolle('OWNER');
  });

  it('zeigt einen erklaerenden Leerzustand statt einer leeren Flaeche', () => {
    mitProjekten([]);

    render(<ProjekteSeite />);

    expect(screen.getByText('Noch kein Projekt angelegt.')).toBeInTheDocument();
  });

  it('zeigt Name und Beschreibung je Projekt', () => {
    mitProjekten([projekt({ description: 'Website neu' })]);

    render(<ProjekteSeite />);

    expect(screen.getByText('Relaunch')).toBeInTheDocument();
    expect(screen.getByText('Website neu')).toBeInTheDocument();
  });

  it('kennzeichnet archivierte Projekte', () => {
    mitProjekten([
      projekt(),
      projekt({
        id: 'p2',
        name: 'Altes Projekt',
        archivedAt: '2026-08-12T10:00:00.000Z',
      }),
    ]);

    render(<ProjekteSeite />);

    expect(screen.getByText('archiviert')).toBeInTheDocument();
    // Nur das archivierte traegt die Kennzeichnung, nicht beide.
    expect(screen.getAllByText('archiviert')).toHaveLength(1);
  });

  /**
   * Der Umschalter darf nicht nur die Anzeige filtern, sondern muss eine
   * ANDERE Abfrage ausloesen - die archivierten Projekte sind gar nicht erst
   * geladen. Ein Test, der nur den Haken prueft, wuerde eine rein
   * clientseitige Filterung durchgehen lassen.
   */
  it('laedt archivierte Projekte erst auf Anforderung nach', async () => {
    const nutzer = userEvent.setup();
    mitProjekten([projekt()]);

    render(<ProjekteSeite />);

    expect(useProjekte).toHaveBeenCalledWith('org-1', false);

    await nutzer.click(
      screen.getByRole('checkbox', { name: 'Archivierte anzeigen' }),
    );

    await waitFor(() => {
      expect(useProjekte).toHaveBeenCalledWith('org-1', true);
    });
  });

  it('erklaert einen 404 statt eine allgemeine Stoerung zu melden', () => {
    useProjekte.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiFehler('Organisation nicht gefunden', 404),
    });

    render(<ProjekteSeite />);

    expect(
      screen.getByText(
        'Diese Organisation existiert nicht oder Sie sind kein Mitglied.',
      ),
    ).toBeInTheDocument();
  });

  describe('Anlegen', () => {
    it('legt ein Projekt an und laesst die Beschreibung weg, wenn sie leer ist', async () => {
      const nutzer = userEvent.setup();
      mitProjekten([]);

      render(<ProjekteSeite />);

      await nutzer.type(screen.getByLabelText('Name'), 'Neues Projekt');
      await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          name: 'Neues Projekt',
          // Nicht '' - das Backend unterscheidet "fehlt" von "leer".
          description: undefined,
        });
      });
    });

    it('prueft die Mindestlaenge, bevor eine Anfrage laeuft', async () => {
      const nutzer = userEvent.setup();
      mitProjekten([]);

      render(<ProjekteSeite />);

      await nutzer.type(screen.getByLabelText('Name'), 'A');
      await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

      expect(
        await screen.findByText('Der Name muss mindestens 2 Zeichen lang sein'),
      ).toBeInTheDocument();
      // Die Bequemlichkeitspruefung erspart dem Server eine Anfrage, die er
      // ohnehin mit 400 beantworten wuerde.
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('zeigt die Meldung des Servers, wenn das Anlegen scheitert', async () => {
      const nutzer = userEvent.setup();
      mitProjekten([]);
      mutateAsync.mockRejectedValue(new ApiFehler('Keine Berechtigung', 403));

      render(<ProjekteSeite />);

      await nutzer.type(screen.getByLabelText('Name'), 'Verboten');
      await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

      expect(await screen.findByText('Keine Berechtigung')).toBeInTheDocument();
    });

    /**
     * ========================================================================
     * DIE ROLLE STEUERT DIE ANZEIGE, NICHT DEN ZUGRIFF
     * ========================================================================
     * Dass ein MEMBER das Formular nicht sieht, ist Hoeflichkeit - der Schutz
     * sitzt im Backend (403). Der Test haelt trotzdem fest, dass die
     * Oberflaeche nichts anbietet, was ohnehin scheitern wuerde.
     */
    it('zeigt einem MEMBER kein Anlegeformular', () => {
      alsRolle('MEMBER');
      mitProjekten([projekt()]);

      render(<ProjekteSeite />);

      expect(
        screen.queryByRole('button', { name: 'Anlegen' }),
      ).not.toBeInTheDocument();
    });

    it('zeigt einem ADMIN das Anlegeformular', () => {
      alsRolle('ADMIN');
      mitProjekten([projekt()]);

      render(<ProjekteSeite />);

      expect(
        screen.getByRole('button', { name: 'Anlegen' }),
      ).toBeInTheDocument();
    });
  });
});
