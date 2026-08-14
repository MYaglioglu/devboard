import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KennzahlenKacheln } from './kennzahlen';
import type { Kennzahlen } from '@/lib/kennzahlen';

const useKennzahlen = vi.fn();

vi.mock('@/lib/kennzahlen', () => ({
  useKennzahlen: (orgId: string | undefined) => useKennzahlen(orgId) as unknown,
}));

const zahlen = (ueberschreibung: Partial<Kennzahlen> = {}): Kennzahlen => ({
  projects: { active: 3, archived: 1 },
  tasks: { todo: 12, inProgress: 4, done: 20, open: 16 },
  ...ueberschreibung,
});

describe('Kennzahlen-Kacheln', () => {
  beforeEach(() => {
    useKennzahlen.mockReset();
    useKennzahlen.mockReturnValue({
      data: zahlen(),
      isPending: false,
      isError: false,
    });
  });

  it('zeigt die Zahlen des Backends', () => {
    render(<KennzahlenKacheln orgId="org-1" />);

    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('1 archiviert')).toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * `open` WIRD NICHT NACHGERECHNET
   * ==========================================================================
   * Es waere leicht, im Frontend `todo + inProgress` zu bilden. Dieser Test
   * haelt fest, dass genau das NICHT passiert: Er liefert absichtlich eine
   * Zahl, die nicht zur Summe passt, und erwartet den Wert des Backends.
   *
   * Ohne diesen Test koennte jemand die Rechnung ins Frontend ziehen, und beim
   * naechsten neuen Status stuenden zwei Wahrheiten da - die zweite vergisst
   * man, und niemand merkt es, weil die Zahl plausibel aussieht.
   */
  it('uebernimmt open unveraendert, statt es selbst zu rechnen', () => {
    useKennzahlen.mockReturnValue({
      data: zahlen({ tasks: { todo: 1, inProgress: 1, done: 0, open: 99 } }),
      isPending: false,
      isError: false,
    });

    render(<KennzahlenKacheln orgId="org-1" />);

    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  /**
   * ==========================================================================
   * WAEHREND DES LADENS STEHT EIN STRICH, KEINE NULL
   * ==========================================================================
   * `0 offene Aufgaben` ist eine AUSSAGE, und waehrend des Ladens ist sie
   * unwahr - der Nutzer koennte sie nicht von der echten Null unterscheiden.
   * Der Strich sagt "noch nicht bekannt".
   *
   * Derselbe Unterschied wie zwischen `nextCursor: null` und `undefined` im
   * Backend, und beide Male ist die Verwechslung teuer.
   */
  it('zeigt Striche statt Nullen, solange geladen wird', () => {
    useKennzahlen.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });

    render(<KennzahlenKacheln orgId="org-1" />);

    expect(screen.getAllByText('–')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('zeigt echte Nullen, sobald sie geladen sind', () => {
    useKennzahlen.mockReturnValue({
      data: {
        projects: { active: 0, archived: 0 },
        tasks: { todo: 0, inProgress: 0, done: 0, open: 0 },
      },
      isPending: false,
      isError: false,
    });

    render(<KennzahlenKacheln orgId="org-1" />);

    expect(screen.getAllByText('0')).toHaveLength(4);
    // Und der Hinweis auf archivierte Projekte fehlt, wenn es keine gibt -
    // "0 archiviert" waere Rauschen.
    expect(screen.queryByText(/archiviert/)).not.toBeInTheDocument();
  });

  it('meldet einen Fehler, statt Zahlen zu erfinden', () => {
    useKennzahlen.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });

    render(<KennzahlenKacheln orgId="org-1" />);

    expect(
      screen.getByText(/konnten nicht geladen werden/),
    ).toBeInTheDocument();
  });
});
