import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Monatskalender } from './monatskalender';
import type { Kalendereintrag } from '@/lib/kalender';

/**
 * Die Komponente bekommt alles hineingereicht - Monat, Termine, "heute". Sie
 * ruft weder einen Hook noch die Uhr auf, deshalb braucht dieser Test weder
 * einen Zwischenspeicher noch `vi.mock`.
 *
 * Das ist kein Zufall, sondern der Zweck der Aufteilung: Was die Komponente
 * nicht selbst beschafft, muss ein Test auch nicht faelschen.
 */
const termin = (
  ueberschreibung: Partial<Kalendereintrag> = {},
): Kalendereintrag => ({
  id: 'aufgabe-1',
  title: 'Abgabe',
  status: 'TODO',
  version: 0,
  // Ein fester Zeitpunkt. `new Date()` waere hier eine Wette darauf, dass der
  // Test nicht um Mitternacht laeuft.
  dueDate: new Date(2026, 8, 15, 13, 30).toISOString(),
  assignee: null,
  project: { id: 'projekt-1', name: 'Website-Relaunch' },
  ...ueberschreibung,
});

const september = { jahr: 2026, monat: 8 };

describe('Monatskalender', () => {
  it('zeigt einen Termin an seinem Tag', () => {
    render(
      <Monatskalender
        monat={september}
        eintraege={[termin()]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    const eintrag = screen.getByRole('link', { name: /Abgabe/ });

    expect(eintrag).toBeInTheDocument();
    // Der Link fuehrt zum Projekt der Aufgabe - deshalb liefert der Server
    // beim Kalender die Projekt-ID mit, anders als beim Board.
    expect(eintrag).toHaveAttribute(
      'href',
      '/organizations/org-1/projects/projekt-1',
    );
  });

  it('zeigt die Uhrzeit in der Zone des Betrachters', () => {
    // Der Termin ist als LOKALE 13:30 Uhr gebaut und als UTC-Zeichenkette
    // uebergeben - genau der Weg, den ein echter Termin nimmt. Angezeigt
    // werden muss wieder 13:30, egal in welcher Zone der Test laeuft.
    render(
      <Monatskalender
        monat={september}
        eintraege={[termin()]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    expect(screen.getByText('13:30')).toBeInTheDocument();
  });

  it('hebt genau den uebergebenen Tag als heute hervor', () => {
    render(
      <Monatskalender
        monat={september}
        eintraege={[]}
        heute={new Date(2026, 8, 16)}
        orgId="org-1"
      />,
    );

    // Die 16 im September gibt es einmal. Der Vorlauf reicht nur bis zum
    // 31.08., der Nachlauf beginnt beim 01.10. - eine zweite 16 kann also
    // nicht im Raster stehen.
    const sechzehnter = screen.getByText('16');

    expect(sechzehnter.className).toContain('bg-akzent');
  });

  it('markiert kein Feld als heute, wenn der Tag ausserhalb des Monats liegt', () => {
    // Die Gegenprobe. Ohne sie waere der vorige Test auch dann gruen, wenn die
    // Komponente jeden Tag hervorhoebe.
    render(
      <Monatskalender
        monat={september}
        eintraege={[]}
        heute={new Date(2027, 4, 3)}
        orgId="org-1"
      />,
    );

    const hervorgehoben = screen
      .getAllByRole('cell')
      .flatMap((zelle) => Array.from(zelle.querySelectorAll('span')))
      .filter((element) => element.className.includes('bg-akzent'));

    expect(hervorgehoben).toHaveLength(0);
  });

  it('zeigt immer sechs Wochen, damit die Hoehe beim Blaettern gleich bleibt', () => {
    render(
      <Monatskalender
        monat={{ jahr: 2027, monat: 1 }} // Februar 2027 - passt in vier Wochen
        eintraege={[]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    // Sieben Kopfzellen kommen aus `<thead>`, deshalb wird auf `<td>` gezaehlt.
    expect(screen.getAllByRole('cell')).toHaveLength(42);
  });

  it('zeigt Vor- und Nachlauftage, statt Loecher zu lassen', () => {
    render(
      <Monatskalender
        monat={september}
        eintraege={[]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    const zellen = screen.getAllByRole('cell');

    // Der 01.09.2026 ist ein Dienstag - vor ihm steht der 31.08.
    expect(within(zellen[0]).getByText('31')).toBeInTheDocument();
    expect(within(zellen[1]).getByText('1')).toBeInTheDocument();
  });

  it('kuerzt lange Tage und sagt, wie viele fehlen', () => {
    // Vier Termine am selben Tag. Sichtbar sind zwei, der Rest wird gezaehlt -
    // sonst waechst die Zeile und das Raster verliert seine feste Hoehe.
    const vier = Array.from({ length: 4 }, (_, i) =>
      termin({ id: `aufgabe-${i}`, title: `Termin ${i}` }),
    );

    render(
      <Monatskalender
        monat={september}
        eintraege={vier}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('ertraegt einen unbekannten Status, statt abzustuerzen', () => {
    // Die Regel aus Sprint 4: beim Erzeugen auf Vollstaendigkeit pruefen, beim
    // EMPFANGEN nicht. Kaeme im Backend ein vierter Status dazu, waere eine
    // Fassung im Browser, die ihn nicht ertraegt, waehrend jedes Deployments
    // kaputt.
    const unbekannt = {
      ...termin(),
      status: 'BLOCKED',
    } as unknown as Kalendereintrag;

    render(
      <Monatskalender
        monat={september}
        eintraege={[unbekannt]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    expect(screen.getByRole('link', { name: /Abgabe/ })).toBeInTheDocument();
  });

  it('ist als Tabelle ausgezeichnet, mit Wochentagen als Spaltenkoepfen', () => {
    render(
      <Monatskalender
        monat={september}
        eintraege={[]}
        heute={new Date(2026, 8, 1)}
        orgId="org-1"
      />,
    );

    // Nicht Kosmetik: In einer Tabelle liest ein Screenreader beim Betreten
    // einer Zelle die Spaltenueberschrift mit ("Mittwoch, 16"). In einem Grid
    // aus Divs hoert man nur die Zahl.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });
});
