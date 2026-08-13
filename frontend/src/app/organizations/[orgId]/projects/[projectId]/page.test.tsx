import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProjektSeite from './page';
import { ApiFehler } from '@/lib/api';
import type { Projekt } from '@/lib/projekte';

const useOrganisation = vi.fn();
const useProjekt = vi.fn();
const aendern = vi.fn();
const archivieren = vi.fn();
const push = vi.fn();

vi.mock('@/components/geschuetzt', () => ({
  Geschuetzt: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org-1', projectId: 'p1' }),
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/organisationen', () => ({
  useOrganisation: () => useOrganisation() as unknown,
}));

vi.mock('@/lib/projekte', () => ({
  useProjekt: () => useProjekt() as unknown,
  useProjektAendern: () => ({ mutateAsync: aendern }),
  useProjektArchivieren: () => ({ mutateAsync: archivieren, isPending: false }),
}));

const projekt = (ueberschreibung: Partial<Projekt> = {}): Projekt => ({
  id: 'p1',
  name: 'Relaunch',
  description: 'Website neu',
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

const mitProjekt = (daten: Projekt) => {
  useProjekt.mockReturnValue({
    data: daten,
    isPending: false,
    isError: false,
    error: null,
  });
};

describe('Projektseite', () => {
  beforeEach(() => {
    useOrganisation.mockReset();
    useProjekt.mockReset();
    aendern.mockReset();
    archivieren.mockReset();
    push.mockReset();
    aendern.mockResolvedValue(projekt());
    archivieren.mockResolvedValue(undefined);
    alsRolle('OWNER');
  });

  it('zeigt Name und Beschreibung', () => {
    mitProjekt(projekt());

    render(<ProjektSeite />);

    expect(
      screen.getByRole('heading', { name: 'Relaunch' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Website neu')).toBeInTheDocument();
  });

  /**
   * Das Backend macht "existiert nicht" und "gehoert zu einer anderen
   * Organisation" absichtlich ununterscheidbar. Die Oberflaeche muss daraus
   * eine Erklaerung machen - eine allgemeine Stoerungsmeldung wuerde den
   * Nutzer zum Neuladen verleiten, und danach stuende dasselbe da.
   */
  it('erklaert einen 404 statt eine Stoerung zu melden', () => {
    useProjekt.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiFehler('Projekt nicht gefunden', 404),
    });

    render(<ProjektSeite />);

    expect(
      screen.getByText(
        'Dieses Projekt existiert nicht oder gehört zu einer anderen Organisation.',
      ),
    ).toBeInTheDocument();
  });

  it('weist bei einem echten Ladefehler anders aus als bei 404', () => {
    useProjekt.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiFehler('Serverfehler', 500),
    });

    render(<ProjektSeite />);

    expect(
      screen.getByText('Das Projekt konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });

  it('weist auf ein archiviertes Projekt hin und blendet die Verwaltung aus', () => {
    mitProjekt(projekt({ archivedAt: '2026-08-12T10:00:00.000Z' }));

    render(<ProjektSeite />);

    expect(screen.getByText(/ist archiviert/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Projekt archivieren' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt einem MEMBER keine Verwaltung', () => {
    alsRolle('MEMBER');
    mitProjekt(projekt());

    render(<ProjektSeite />);

    expect(
      screen.queryByRole('button', { name: 'Speichern' }),
    ).not.toBeInTheDocument();
  });

  describe('Ändern', () => {
    it('startet mit dem aktuellen Stand in den Feldern', () => {
      mitProjekt(projekt());

      render(<ProjektSeite />);

      expect(screen.getByLabelText('Name')).toHaveValue('Relaunch');
      expect(screen.getByLabelText('Beschreibung')).toHaveValue('Website neu');
    });

    /**
     * ========================================================================
     * DREI WERTE, DREI BEDEUTUNGEN
     * ========================================================================
     * Ein leeres Feld heisst "Beschreibung entfernen", und dafuer erwartet das
     * Backend ausdruecklich `null`. `undefined` hiesse "unveraendert lassen",
     * ein leerer String waere eine Beschreibung, die aus nichts besteht.
     *
     * Ohne diesen Test waere `''` durchgegangen - und die Beschreibung liesse
     * sich nie wieder loeschen, ohne dass jemand einen Fehler saehe.
     */
    it('schickt null, wenn die Beschreibung geleert wird', async () => {
      const nutzer = userEvent.setup();
      mitProjekt(projekt());

      render(<ProjektSeite />);

      await nutzer.clear(screen.getByLabelText('Beschreibung'));
      await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

      await waitFor(() => {
        expect(aendern).toHaveBeenCalledWith({
          name: 'Relaunch',
          description: null,
        });
      });
    });

    it('zeigt die Meldung des Servers, wenn das Speichern scheitert', async () => {
      const nutzer = userEvent.setup();
      mitProjekt(projekt());
      aendern.mockRejectedValue(new ApiFehler('Keine Berechtigung', 403));

      render(<ProjektSeite />);

      await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

      expect(await screen.findByText('Keine Berechtigung')).toBeInTheDocument();
    });
  });

  describe('Archivieren', () => {
    /**
     * Der Schritt ist fuer den Nutzer nicht selbst korrigierbar - ein
     * Zurueckholen gibt es noch nicht. Genau das ist das Kriterium fuer eine
     * Rueckfrage, nicht die HTTP-Methode dahinter.
     */
    it('archiviert nicht auf den ersten Klick', async () => {
      const nutzer = userEvent.setup();
      mitProjekt(projekt());

      render(<ProjektSeite />);

      await nutzer.click(
        screen.getByRole('button', { name: 'Projekt archivieren' }),
      );

      expect(archivieren).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Zurückholen ist derzeit nicht vorgesehen/),
      ).toBeInTheDocument();
    });

    it('archiviert nach der Bestaetigung und kehrt zur Liste zurueck', async () => {
      const nutzer = userEvent.setup();
      mitProjekt(projekt());

      render(<ProjektSeite />);

      await nutzer.click(
        screen.getByRole('button', { name: 'Projekt archivieren' }),
      );
      await nutzer.click(
        screen.getByRole('button', { name: 'Endgültig archivieren' }),
      );

      await waitFor(() => {
        expect(archivieren).toHaveBeenCalledWith('p1');
      });
      // Auf der Detailseite eines archivierten Projekts zu bleiben, waere ein
      // Sackgassen-Zustand: Die Verwaltung ist dann ausgeblendet.
      expect(push).toHaveBeenCalledWith('/organizations/org-1/projects');
    });

    it('laesst sich abbrechen', async () => {
      const nutzer = userEvent.setup();
      mitProjekt(projekt());

      render(<ProjektSeite />);

      await nutzer.click(
        screen.getByRole('button', { name: 'Projekt archivieren' }),
      );
      await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(archivieren).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Projekt archivieren' }),
      ).toBeInTheDocument();
    });
  });
});
