import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Monatskalender } from './monatskalender';
import type { Kalendereintrag } from '@/lib/kalender';

/**
 * Die Komponente bekommt alles hineingereicht - Monat, Termine, "heute" und
 * die Funktion fuer den Klick. Sie ruft weder einen Hook noch die Uhr auf,
 * deshalb braucht dieser Test weder einen Zwischenspeicher noch `vi.mock`.
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

/**
 * Rendert mit Vorgaben. Ohne diese Hilfe stuenden in jedem Test vier
 * unveraenderliche Zeilen, und beim Hinzufuegen einer Eigenschaft muesste man
 * neun Stellen anfassen - genau das ist beim Nachziehen von `beiTagKlick`
 * passiert, und der Compiler hat alle neun gemeldet.
 */
const zeichne = (
  ueberschreibung: Partial<Parameters<typeof Monatskalender>[0]> = {},
) =>
  render(
    <Monatskalender
      monat={september}
      eintraege={[]}
      heute={new Date(2026, 8, 1)}
      orgId="org-1"
      beiTagKlick={() => {}}
      {...ueberschreibung}
    />,
  );

describe('Monatskalender', () => {
  it('zeigt einen Termin an seinem Tag', () => {
    zeichne({ eintraege: [termin()] });

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
    zeichne({ eintraege: [termin()] });

    expect(screen.getByText('13:30')).toBeInTheDocument();
  });

  it('hebt genau den uebergebenen Tag als heute hervor', () => {
    zeichne({ heute: new Date(2026, 8, 16) });

    // Die 16 im September gibt es einmal. Der Vorlauf reicht nur bis zum
    // 31.08., der Nachlauf beginnt beim 01.10. - eine zweite 16 kann also
    // nicht im Raster stehen.
    expect(screen.getByText('16').className).toContain('bg-akzent');
  });

  it('markiert kein Feld als heute, wenn der Tag ausserhalb des Monats liegt', () => {
    // Die Gegenprobe. Ohne sie waere der vorige Test auch dann gruen, wenn die
    // Komponente jeden Tag hervorhoebe.
    zeichne({ heute: new Date(2027, 4, 3) });

    const hervorgehoben = screen
      .getAllByRole('cell')
      .flatMap((zelle) => Array.from(zelle.querySelectorAll('span')))
      .filter((element) => element.className.includes('bg-akzent'));

    expect(hervorgehoben).toHaveLength(0);
  });

  it('zeigt immer sechs Wochen, damit die Hoehe beim Blaettern gleich bleibt', () => {
    // Februar 2027 passt rechnerisch in vier Wochen.
    zeichne({ monat: { jahr: 2027, monat: 1 } });

    // Sieben Kopfzellen kommen aus `<thead>`, deshalb wird auf `<td>` gezaehlt.
    expect(screen.getAllByRole('cell')).toHaveLength(42);
  });

  it('zeigt Vor- und Nachlauftage, statt Loecher zu lassen', () => {
    zeichne();

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

    zeichne({ eintraege: vier });

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

    zeichne({ eintraege: [unbekannt] });

    expect(screen.getByRole('link', { name: /Abgabe/ })).toBeInTheDocument();
  });

  it('ist als Tabelle ausgezeichnet, mit Wochentagen als Spaltenkoepfen', () => {
    zeichne();

    // Nicht Kosmetik: In einer Tabelle liest ein Screenreader beim Betreten
    // einer Zelle die Spaltenueberschrift mit ("Mittwoch, 16"). In einem Grid
    // aus Divs hoert man nur die Zahl.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  /**
   * ==========================================================================
   * DIE ANLEGE-FLAECHE
   * ==========================================================================
   */
  describe('Klick auf einen Tag', () => {
    it('meldet den geklickten Tag', async () => {
      const gemeldet = vi.fn();
      zeichne({ beiTagKlick: gemeldet });

      // Ueber den ZUGAENGLICHEN NAMEN gefunden, nicht ueber eine CSS-Klasse
      // oder eine Testkennung. Findet der Test den Knopf so, findet ihn auch
      // ein Screenreader - das ist der eigentliche Gewinn dieser Abfrageart.
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Aufgabe am Dienstag, 15. September 2026 anlegen',
        }),
      );

      expect(gemeldet).toHaveBeenCalledTimes(1);

      const gemeldeterTag = gemeldet.mock.calls[0][0] as Date;
      expect(gemeldeterTag.getDate()).toBe(15);
      expect(gemeldeterTag.getMonth()).toBe(8);
    });

    it('gibt jedem Tag einen eigenen Namen', () => {
      zeichne();

      // 42 Knoepfe, 42 verschiedene Namen. Hiesse jeder nur "Aufgabe anlegen",
      // waere im Screenreader nicht zu unterscheiden, welcher Tag gemeint ist -
      // und diese Erwartung waere rot.
      const namen = screen
        .getAllByRole('button')
        .map((knopf) => knopf.getAttribute('aria-label'));

      expect(namen).toHaveLength(42);
      expect(new Set(namen).size).toBe(42);
    });

    it('ist auch an einem Tag erreichbar, der schon Termine hat', async () => {
      const gemeldet = vi.fn();
      zeichne({ eintraege: [termin()], beiTagKlick: gemeldet });

      // Der Grenzfall: Die Flaeche darf nicht verschwinden, sobald ein Termin
      // im Feld steht - sonst koennte man einem vollen Tag nichts hinzufuegen.
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Aufgabe am Dienstag, 15. September 2026 anlegen',
        }),
      );

      expect(gemeldet).toHaveBeenCalledTimes(1);
    });

    it('meldet auch einen Vorlauftag mit seinem echten Datum', async () => {
      const gemeldet = vi.fn();
      zeichne({ beiTagKlick: gemeldet });

      // Der 31.08. steht im September-Raster. Ein Klick darauf muss den
      // AUGUST melden, nicht den September - sonst legte man die Aufgabe einen
      // Monat zu spaet an, und im Kalender saehe es richtig aus.
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Aufgabe am Montag, 31. August 2026 anlegen',
        }),
      );

      const gemeldeterTag = gemeldet.mock.calls[0][0] as Date;
      expect(gemeldeterTag.getMonth()).toBe(7);
      expect(gemeldeterTag.getDate()).toBe(31);
    });
  });
});
