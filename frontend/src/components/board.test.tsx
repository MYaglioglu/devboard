import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Board } from './board';
import { ApiFehler } from '@/lib/api';
import type { Aufgabe, AufgabenStatus } from '@/lib/aufgaben';

const useAufgaben = vi.fn();
const verschieben = vi.fn();
const anlegen = vi.fn();
const loeschen = vi.fn();

vi.mock('@/lib/aufgaben', async () => {
  const echt =
    await vi.importActual<typeof import('@/lib/aufgaben')>('@/lib/aufgaben');

  return {
    // `istKonflikt` bleibt die ECHTE Funktion: Sie ist genau der Punkt, an dem
    // sich ein 409 von einem echten Fehler unterscheidet. Waere sie
    // nachgebildet, pruefte der Test nur seine eigene Attrappe.
    istKonflikt: echt.istKonflikt,
    useAufgaben: () => useAufgaben() as unknown,
    useAufgabeVerschieben: () => ({ mutate: verschieben }),
    useAufgabeAnlegen: () => ({ mutate: anlegen }),
    useAufgabeLoeschen: () => ({ mutate: loeschen }),
  };
});

const karte = (
  id: string,
  status: AufgabenStatus = 'TODO',
  ueberschreibung: Partial<Aufgabe> = {},
): Aufgabe => ({
  id,
  title: `Karte ${id}`,
  description: null,
  status,
  position: '1000',
  version: 0,
  assignee: null,
  dueDate: null,
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
  ...ueberschreibung,
});

const mitAufgaben = (data: Aufgabe[]) => {
  useAufgaben.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
  });
};

const zeige = (schreibgeschuetzt = false) =>
  render(
    <Board
      orgId="org-1"
      projektId="p1"
      schreibgeschuetzt={schreibgeschuetzt}
    />,
  );

describe('Board', () => {
  beforeEach(() => {
    useAufgaben.mockReset();
    verschieben.mockReset();
    anlegen.mockReset();
    loeschen.mockReset();
  });

  it('zeigt alle drei Spalten, auch die leeren', () => {
    mitAufgaben([karte('a')]);

    zeige();

    // Eine leere Spalte wegzulassen waere ein Loch im Board - und der Grund,
    // warum das Backend eine flache Liste liefert statt gruppierter Daten.
    expect(screen.getByRole('region', { name: 'Offen' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'In Arbeit' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Erledigt' }),
    ).toBeInTheDocument();
  });

  it('sortiert die Karten in ihre Spalten', () => {
    mitAufgaben([karte('a'), karte('b', 'DONE')]);

    zeige();

    const offen = screen.getByRole('region', { name: 'Offen' });
    const erledigt = screen.getByRole('region', { name: 'Erledigt' });

    expect(offen).toHaveTextContent('Karte a');
    expect(erledigt).toHaveTextContent('Karte b');
    expect(offen).not.toHaveTextContent('Karte b');
  });

  it('zeigt den Zustaendigen, wenn es einen gibt', () => {
    mitAufgaben([
      karte('a', 'TODO', {
        assignee: { userId: 'u1', name: 'Murat', email: 'm@example.com' },
      }),
    ]);

    zeige();

    expect(screen.getByText('Murat')).toBeInTheDocument();
  });

  it('faellt auf die E-Mail zurueck, wenn kein Name hinterlegt ist', () => {
    mitAufgaben([
      karte('a', 'TODO', {
        assignee: { userId: 'u1', name: null, email: 'm@example.com' },
      }),
    ]);

    zeige();

    expect(screen.getByText('m@example.com')).toBeInTheDocument();
  });

  describe('Anlegen', () => {
    it('legt eine Aufgabe in der Spalte an, in der das Feld steht', async () => {
      const nutzer = userEvent.setup();
      mitAufgaben([]);

      zeige();

      // Der zugaengliche Name traegt die BESCHRIFTUNG der Spalte, nicht ihren
      // Enum-Wert: Ein Screenreader liest genau diesen Text als Feldnamen vor,
      // und "Neue Aufgabe in IN_PROGRESS" waere eine interne Kennung.
      await nutzer.type(
        screen.getByLabelText('Neue Aufgabe in In Arbeit'),
        'Etwas tun',
      );
      await nutzer.click(
        screen.getAllByRole('button', { name: '+' })[1] ??
          screen.getByRole('button', { name: '+' }),
      );

      await waitFor(() => {
        expect(anlegen).toHaveBeenCalledWith(
          { title: 'Etwas tun', status: 'IN_PROGRESS' },
          expect.anything(),
        );
      });
    });

    it('schickt einen zu kurzen Titel gar nicht erst ab', async () => {
      const nutzer = userEvent.setup();
      mitAufgaben([]);

      zeige();

      const feld = screen.getByLabelText('Neue Aufgabe in Offen');
      await nutzer.type(feld, 'A{Enter}');

      // Das Backend verlangt zwei Zeichen. Die Anfrage waere eine 400, die
      // niemand braucht.
      expect(anlegen).not.toHaveBeenCalled();
    });
  });

  it('loescht eine Karte auf Knopfdruck', async () => {
    const nutzer = userEvent.setup();
    mitAufgaben([karte('a')]);

    zeige();

    await nutzer.click(screen.getByRole('button', { name: 'Karte a löschen' }));

    expect(loeschen).toHaveBeenCalledWith('a');
  });

  /**
   * ==========================================================================
   * EIN ARCHIVIERTES PROJEKT IST LESBAR, ABER NICHT VERAENDERBAR
   * ==========================================================================
   * Das Backend lehnt neue Aufgaben darin mit 404 ab. Die Oberflaeche bietet
   * deshalb nichts an, was ohnehin scheitern wuerde - dieselbe Regel wie bei
   * der Rollenanzeige.
   */
  describe('archiviertes Projekt', () => {
    it('zeigt die Karten weiterhin', () => {
      mitAufgaben([karte('a')]);

      zeige(true);

      expect(screen.getByText('Karte a')).toBeInTheDocument();
    });

    it('bietet weder Anlegen noch Loeschen an', () => {
      mitAufgaben([karte('a')]);

      zeige(true);

      expect(
        screen.queryByLabelText('Neue Aufgabe in Offen'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Karte a löschen' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Ladezustaende', () => {
    it('meldet einen Ladefehler', () => {
      useAufgaben.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new ApiFehler('Serverfehler', 500),
      });

      zeige();

      expect(
        screen.getByText('Die Aufgaben konnten nicht geladen werden.'),
      ).toBeInTheDocument();
    });

    it('zeigt waehrend des Ladens keinen leeren Rahmen', () => {
      useAufgaben.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      });

      zeige();

      expect(screen.getByText('Lade Aufgaben …')).toBeInTheDocument();
    });
  });
});
