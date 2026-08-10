import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest statt Jest im Frontend.
 *
 * Grund: Next.js baut mit demselben Werkzeug-Unterbau (esbuild/SWC, Vite-nah).
 * Vitest versteht TSX, Pfad-Aliasse und ESM ohne zusaetzliche Uebersetzer -
 * bei Jest braeuchte es dafuer Babel- oder SWC-Konfiguration.
 *
 * Im Backend bleibt Jest: Es kam mit NestJS mit, funktioniert dort einwandfrei,
 * und ein Wechsel waere Arbeit ohne Gegenwert. Zwei Testlaeufer in einem
 * Repository sind kein Schoenheitsfehler, sondern die Folge davon, dass beide
 * Projekte eigenstaendig sind (ADR-005).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom bildet Browser-APIs (document, window) in Node nach. Ohne das
    // koennte keine React-Komponente gerendert werden.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Bewusst KEIN `globals: true`: describe/it/expect werden ausdruecklich
    // importiert. Das haelt den Linter zufrieden und macht in jeder Datei
    // sichtbar, woher die Funktionen stammen.
    globals: false,
  },
  resolve: {
    // Muss zum Pfad-Alias in der tsconfig.json passen, sonst findet der Test
    // die Importe mit "@/" nicht.
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
