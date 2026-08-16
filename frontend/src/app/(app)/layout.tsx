import { AppHuelle } from '@/components/app-huelle';

/**
 * Layout aller angemeldeten Seiten.
 *
 * ============================================================================
 * WAS DIESE DATEI NEBENBEI ERLEDIGT
 * ============================================================================
 * `Geschuetzt` steckt jetzt AUCH in der Huelle - jede neue Seite unter `(app)`
 * ist damit geschuetzt, ohne dass jemand daran denken muss. Vorher musste sich
 * jede Seite selbst einpacken; wer es vergass, hatte eine Seite, die ohne
 * Anmeldung kurz aufblitzte.
 *
 * Das ist derselbe Gedanke wie beim global registrierten Guard im Backend:
 * Ein Schutz, an den man denken muss, ist ein Schutz, den man vergisst.
 *
 * Die bestehenden Seiten tragen ihren eigenen `<Geschuetzt>` weiterhin. Das
 * ist Doppelung, aber harmlose - die Komponente prueft denselben Zustand und
 * gibt ihn durch. Sie herauszunehmen waere Aufraeumarbeit an vier Dateien und
 * ihren Tests; sie gehoert in eine eigene Scheibe, nicht in diese.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <AppHuelle>{children}</AppHuelle>;
}
