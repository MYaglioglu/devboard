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
