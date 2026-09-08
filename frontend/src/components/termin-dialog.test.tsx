import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminDialog } from './termin-dialog';

/**
 * Die drei Hooks werden ersetzt, nicht die Bausteine darunter.
 *
 * Gegen einen echten `QueryClientProvider` zu testen waere naeher an der
 * Wirklichkeit und wuerde hier vor allem TanStack Query pruefen - fremden
 * Code. Was dieser Dialog selbst entscheidet, ist die Umrechnung der Ortszeit
 * und die Behandlung der leeren Auswahl. Genau darauf zielen die Erwartungen.
 */
const anlegen = vi.fn();

vi.mock('@/lib/kalender', () => ({
  useTerminAnlegen: () => ({ mutateAsync: anlegen }),
}));

vi.mock('@/lib/projekte', () => ({
  useProjekte: () => ({
    data: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Website-Relaunch' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Mobile App' },
    ],
  }),
}));

vi.mock('@/lib/organisationen', () => ({
  useMitglieder: () => ({
    data: [
      { userId: 'nutzer-1', name: 'Murat', email: 'murat@example.com' },
      { userId: 'nutzer-2', name: null, email: 'kollegin@example.com' },
    ],
  }),
}));

const PROJEKT = '11111111-1111-4111-8111-111111111111';

/** Der 15.09.2026 um 09:00 ORTSZEIT - so, wie die Seite ihn hineinreicht. */
const tag = new Date(2026, 8, 15, 9, 0);

const zeichne = (ueberschreibung: { tag?: Date | null } = {}) =>
  render(
    <TerminDialog
      orgId="org-1"
      tag={ueberschreibung.tag === undefined ? tag : ueberschreibung.tag}
      beimSchliessen={() => {}}
    />,
  );

describe('TerminDialog', () => {
  beforeEach(() => {
    anlegen.mockReset();
    anlegen.mockResolvedValue({ id: 'neue-aufgabe' });
  });

  it('belegt das Datumsfeld mit LOKALER Zeit vor, nicht mit UTC', () => {
    zeichne();

    // Der wichtigste Test dieser Datei. `toISOString().slice(0, 16)` waere der
    // naheliegende Einzeiler und stuende im Berliner Sommer auf 07:00 - der
    // Nutzer klickt auf den 15., bekommt 07:00 angeboten und merkt nicht,
    // dass zwei Stunden fehlen.
    expect(screen.getByLabelText('Fällig am')).toHaveValue('2026-09-15T09:00');
  });

  it('nennt den geklickten Tag ausgeschrieben', () => {
    zeichne();

    // Wer sich verklickt hat, soll es sehen, bevor er den Titel tippt - und
    // nicht erst im Datumsfeld nachrechnen muessen.
    expect(
      screen.getByText('Dienstag, 15. September 2026'),
    ).toBeInTheDocument();
  });

  it('schickt den Zeitpunkt, den der Nutzer auf seiner Uhr gemeint hat', async () => {
    zeichne();

    await userEvent.selectOptions(screen.getByLabelText('Projekt'), PROJEKT);
    await userEvent.type(screen.getByLabelText('Titel'), 'Abgabe');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));

    const gesendet = anlegen.mock.calls[0][0] as { dueDate: string };

    // Geprueft wird die BEZIEHUNG, nicht die Zeichenkette: Der gesendete
    // Zeitpunkt muss derselbe sein, den der Nutzer lokal gemeint hat. So
    // laeuft der Test in jeder Zeitzone - in Berlin kommt
    // `2026-09-15T07:00:00.000Z` heraus, in London `08:00:00.000Z`.
    expect(new Date(gesendet.dueDate).getTime()).toBe(tag.getTime());
    expect(new Date(gesendet.dueDate).getHours()).toBe(9);
  });

  it('laesst assigneeId weg, wenn niemand zustaendig ist', async () => {
    zeichne();

    await userEvent.selectOptions(screen.getByLabelText('Projekt'), PROJEKT);
    await userEvent.type(screen.getByLabelText('Titel'), 'Abgabe');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));

    // `undefined` laesst das Feld aus dem JSON verschwinden. Ein leerer String
    // waere fuer den Server eine ungueltige UUID und ergaebe 400 - der Fehler
    // faellt erst beim ersten Anlegen ohne Zustaendigen auf, also fast immer.
    expect(anlegen.mock.calls[0][0]).toMatchObject({ assigneeId: undefined });
  });

  it('schickt die NUTZER-ID des Zustaendigen', async () => {
    zeichne();

    await userEvent.selectOptions(screen.getByLabelText('Projekt'), PROJEKT);
    await userEvent.type(screen.getByLabelText('Titel'), 'Abgabe');
    await userEvent.selectOptions(
      screen.getByLabelText('Zuständig'),
      'nutzer-1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));

    // Nutzer-ID, nicht die der Mitgliedschaft - so verlangt es die API, damit
    // unsere Tabellenstruktur nicht Teil der Schnittstelle wird.
    expect(anlegen.mock.calls[0][0]).toMatchObject({ assigneeId: 'nutzer-1' });
  });

  it('zeigt ein Mitglied ohne Namen mit seiner Adresse', () => {
    zeichne();

    // Sonst stuende in der Liste ein leerer Eintrag, den man nicht auswaehlen
    // kann, ohne zu raten.
    expect(
      screen.getByRole('option', { name: 'kollegin@example.com' }),
    ).toBeInTheDocument();
  });

  it('legt nichts an, solange kein Projekt gewaehlt ist', async () => {
    zeichne();

    await userEvent.type(screen.getByLabelText('Titel'), 'Abgabe');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(await screen.findByText('Bitte ein Projekt wählen')).toBeVisible();
    // Die eigentliche Erwartung: nicht nur die Meldung, sondern dass NICHTS
    // gesendet wurde. Ohne diese Zeile waere der Test auch dann gruen, wenn
    // die Aufgabe zusaetzlich im falschen Projekt landete.
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('legt nichts an, wenn der Titel zu kurz ist', async () => {
    zeichne();

    await userEvent.selectOptions(screen.getByLabelText('Projekt'), PROJEKT);
    await userEvent.type(screen.getByLabelText('Titel'), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(
      await screen.findByText('Der Titel muss mindestens 2 Zeichen lang sein'),
    ).toBeVisible();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('zeigt einen Serverfehler an, statt still zu scheitern', async () => {
    anlegen.mockRejectedValue(new Error('Netzwerk weg'));
    zeichne();

    await userEvent.selectOptions(screen.getByLabelText('Projekt'), PROJEKT);
    await userEvent.type(screen.getByLabelText('Titel'), 'Abgabe');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    // Ein fehlgeschlagenes Anlegen, das nur die Konsole erreicht, sieht fuer
    // den Nutzer aus wie ein erfolgreiches - der Dialog bliebe offen, und er
    // klickt noch einmal.
    expect(
      await screen.findByText('Die Aufgabe konnte nicht angelegt werden.'),
    ).toBeVisible();
  });

  it('ist geschlossen, solange kein Tag gewaehlt ist', () => {
    zeichne({ tag: null });

    // `getByRole('dialog')` findet einen geschlossenen `<dialog>` nicht - er
    // ist fuer die Zugaenglichkeitsbaum nicht vorhanden. Genau das soll
    // gelten: kein Tag, kein Dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
