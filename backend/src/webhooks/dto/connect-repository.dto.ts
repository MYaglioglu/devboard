import { z } from 'zod';

/**
 * Eingabe fuer POST /organizations/:orgId/projects/:projectId/repository.
 *
 * ============================================================================
 * WARUM DIE FORM SO GENAU GEPRUEFT WIRD, OBWOHL WIR NUR EMPFANGEN
 * ============================================================================
 * Auf den ersten Blick ist `repositoryFullName` nur eine Beschriftung: Wir
 * rufen GitHub nicht auf, wir warten darauf, dass GitHub uns aufruft. Ein
 * falscher Wert haette also "nur" zur Folge, dass nie etwas ankommt.
 *
 * Zwei Gruende dagegen:
 *
 * 1. Der Wert wird spaeter beim Verarbeiten mit `repository.full_name` aus der
 *    Nutzlast VERGLICHEN - eine gueltige Signatur allein sagt naemlich nur,
 *    dass jemand das Geheimnis kennt, nicht, ueber welches Repository er
 *    spricht. Ein Vergleichswert, dessen Form ungeprueft ist, taugt dafuer
 *    nicht.
 * 2. Er wird nutzersichtbar angezeigt. Alles, was ungeprueft aus einer Eingabe
 *    in eine Anzeige wandert, ist der Anfang einer laengeren Geschichte.
 *
 * Die Regeln stammen von GitHub: Kontonamen duerfen Buchstaben, Ziffern und
 * Bindestriche enthalten und hoechstens 39 Zeichen lang sein.
 * Repository-Namen zusaetzlich Punkt und Unterstrich, hoechstens 100 Zeichen.
 *
 * Bewusst NICHT erlaubt ist eine ganze URL wie
 * `https://github.com/owner/repo`. Das waere bequemer, brauchte aber eine
 * eigene Zerlegung - und die Frage, was bei `github.com.angreifer.example`
 * passiert. Zwei Felder in einem Feld sind eine Fehlerquelle; wir nehmen die
 * Form, die GitHub selbst ueberall verwendet.
 */
const KONTO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;

export const connectRepositorySchema = z.object({
  repositoryFullName: z
    .string()
    .trim()
    .refine(
      (wert) => {
        // Absichtlich `split` mit Laengenpruefung statt eines einzigen
        // regulaeren Ausdrucks ueber das Ganze: Ein Wert mit zwei Schraegen
        // ("a/b/c") faellt hier sicher durch, waehrend ein zu gieriger
        // Ausdruck ihn je nach Formulierung durchlassen wuerde.
        const teile = wert.split('/');

        return (
          teile.length === 2 &&
          KONTO.test(teile[0]) &&
          REPOSITORY.test(teile[1]) &&
          // GitHub erlaubt "." und ".." als Repository-Namen nicht - und genau
          // die waeren die interessanten Werte, wenn der Name je in einen Pfad
          // geriete.
          teile[1] !== '.' &&
          teile[1] !== '..'
        );
      },
      { message: 'Erwartet wird die Form „owner/repo"' },
    ),
});

/** Abgeleitet statt danebengepflegt. */
export type ConnectRepositoryDto = z.infer<typeof connectRepositorySchema>;
