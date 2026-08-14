import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AktivitaetsFeed } from './aktivitaets-feed';
import type { FeedEintrag, FeedSeite } from '@/lib/aktivitaeten';

const useAktivitaeten = vi.fn();
const fetchNextPage = vi.fn();

vi.mock('@/lib/aktivitaeten', () => ({
  useAktivitaeten: (orgId: string | undefined, projektId?: string) =>
    useAktivitaeten(orgId, projektId) as unknown,
}));

const eintrag = (ueberschreibung: Partial<FeedEintrag> = {}): FeedEintrag => ({
  id: 'a1',
  type: 'TASK_CREATED',
  actor: { userId: 'u1', name: 'Murat', email: 'murat@example.com' },
  projectId: 'p1',
  taskId: 't1',
  payload: { title: 'Login-Bug', status: 'TODO' },
  createdAt: '2026-08-14T10:03:22.150Z',
  ...ueberschreibung,
});

const seiten = (...listen: FeedEintrag[][]): { pages: FeedSeite[] } => ({
  pages: listen.map((items, index) => ({
    items,
    nextCursor: index < listen.length - 1 ? `cursor-${index}` : null,
  })),
});

describe('Aktivitaets-Feed', () => {
  beforeEach(() => {
    useAktivitaeten.mockReset();
    fetchNextPage.mockReset();
    useAktivitaeten.mockReturnValue({
      data: seiten([eintrag()]),
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('zeigt Akteur und Ereignis in einem Satz', () => {
    render(<AktivitaetsFeed orgId="org-1" />);

    expect(screen.getByText(/hat „Login-Bug" angelegt/)).toBeInTheDocument();
    expect(screen.getByText('Murat')).toBeInTheDocument();
  });

  /**
   * Die Seiten werden erst in der Komponente zusammengelegt. Dieser Test hält
   * fest, dass dabei nichts verlorengeht - der haeufigste Fehler bei
   * seitenweise geladenen Listen ist, nur die zuletzt geladene Seite
   * anzuzeigen.
   */
  it('legt mehrere geladene Seiten zusammen', () => {
    useAktivitaeten.mockReturnValue({
      data: seiten(
        [eintrag({ id: 'a1', payload: { title: 'Erste' } })],
        [eintrag({ id: 'a2', payload: { title: 'Zweite' } })],
      ),
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<AktivitaetsFeed orgId="org-1" />);

    expect(screen.getByText(/„Erste"/)).toBeInTheDocument();
    expect(screen.getByText(/„Zweite"/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  /**
   * ==========================================================================
   * DER KNOPF HAENGT AN hasNextPage, NICHT AN EINER GEZAEHLTEN MENGE
   * ==========================================================================
   * `hasNextPage` folgt daraus, dass das Backend `nextCursor: null` geliefert
   * hat. Die Komponente muss weder zaehlen noch eine Gesamtzahl kennen - und
   * genau deshalb kommt die Cursor-Paginierung ohne ein teures COUNT aus.
   *
   * Der Test prueft beide Richtungen, denn nur der Erfolgspfad waere auch
   * dann gruen, wenn der Knopf IMMER da stuende.
   */
  it('bietet Nachladen nur an, wenn es eine weitere Seite gibt', async () => {
    render(<AktivitaetsFeed orgId="org-1" />);
    expect(
      screen.queryByRole('button', { name: 'Mehr laden' }),
    ).not.toBeInTheDocument();

    useAktivitaeten.mockReturnValue({
      data: seiten([eintrag()], []),
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    });

    render(<AktivitaetsFeed orgId="org-1" />);
    const knopf = screen.getByRole('button', { name: 'Mehr laden' });

    await userEvent.click(knopf);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('sperrt den Knopf, solange nachgeladen wird', () => {
    useAktivitaeten.mockReturnValue({
      data: seiten([eintrag()]),
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    render(<AktivitaetsFeed orgId="org-1" />);

    // Ohne die Sperre loeste ein doppelter Klick zwei Anfragen mit DEMSELBEN
    // Cursor aus - dieselbe Seite zweimal, untereinander angezeigt.
    expect(screen.getByRole('button', { name: 'Lädt …' })).toBeDisabled();
  });

  it('erklaert die leere Liste, statt nichts zu zeigen', () => {
    useAktivitaeten.mockReturnValue({
      data: seiten([]),
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<AktivitaetsFeed orgId="org-1" />);

    expect(screen.getByText(/Noch nichts passiert/)).toBeInTheDocument();
  });

  it('meldet einen Fehler, statt eine leere Liste vorzutaeuschen', () => {
    useAktivitaeten.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(<AktivitaetsFeed orgId="org-1" />);

    // Der Unterschied ist wichtig: "nichts passiert" und "konnte nicht geladen
    // werden" sind zwei verschiedene Aussagen, und nur eine davon stimmt.
    expect(
      screen.getByText(/konnten nicht geladen werden/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Noch nichts passiert/)).not.toBeInTheDocument();
  });

  it('reicht den Projektfilter an den Haken durch', () => {
    render(<AktivitaetsFeed orgId="org-1" projektId="p-9" />);

    expect(useAktivitaeten).toHaveBeenCalledWith('org-1', 'p-9');
  });
});
