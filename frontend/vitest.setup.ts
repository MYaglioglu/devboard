import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Nach jedem Test das gerenderte DOM entfernen. Ohne diesen Schritt wuerden
// sich Komponenten aus vorherigen Tests im Dokument stapeln und Abfragen wie
// `getByRole` faenden mehrere Treffer - eine der haeufigsten Ursachen fuer
// Tests, die einzeln laufen, aber gemeinsam fehlschlagen.
afterEach(() => {
  cleanup();
});

// ============================================================================
// jsdom KENNT `<dialog>` NUR HALB
// ============================================================================
// Das Element gibt es, seine beiden wichtigsten Methoden aber nicht:
// `showModal()` und `close()` sind in jsdom nicht umgesetzt. Ein Dialog, der
// im Browser einwandfrei laeuft, wirft im Test deshalb
// "showModal is not a function".
//
// Der naheliegende Ausweg waere, in der Komponente zu pruefen, ob es die
// Methode gibt. Das waere eine Zeile Produktionscode, die nur wegen der
// Testumgebung existiert - und damit genau die Sorte Kompromiss, die sich
// spaeter niemand mehr erklaeren kann.
//
// Richtig ist, die LUECKE DER UMGEBUNG in der Umgebung zu schliessen. Die
// Ersatzfassung tut das, worauf sich die Tests verlassen: `open` setzen und
// `close` als Ereignis melden. Was sie NICHT nachbildet, ist der eigentliche
// Gewinn eines echten `<dialog>` - Fokusfalle, Escape und `::backdrop`. Die
// gibt es nur im Browser, und deshalb ersetzt kein Test hier das Anschauen.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function zeigeModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };

  HTMLDialogElement.prototype.close ??= function schliesse(
    this: HTMLDialogElement,
  ) {
    this.open = false;
    // Das Ereignis ist der Grund, warum die Ersatzfassung mehr tut als ein
    // leerer Rumpf: Der Dialog raeumt in `onClose` auf, und ohne dieses
    // Ereignis liefe dieser Weg im Test nie.
    this.dispatchEvent(new Event('close'));
  };
}
