import { TaskStatus } from '../generated/prisma/enums';
import { zuZeile } from './ereignisse';

/**
 * Diese Datei braucht keine Datenbank, kein NestJS und keine Attrappen -
 * `zuZeile` ist eine reine Funktion. Dieselbe Trennung wie bei `positionen.ts`
 * in Sprint 3: Was rein rechnend ist, wird vom Ein- und Ausgabe-Teil getrennt,
 * weil die Testkosten um eine Groessenordnung auseinanderliegen.
 *
 * Geprueft wird hier vor allem der `payload` - genau das Feld, das die
 * Datenbank NICHT prueft. Ein `jsonb` ohne Constraint bekommt seine Struktur
 * ausschliesslich von diesem Code; ohne diese Tests waere die Zusicherung aus
 * ADR-011 unbelegt.
 */
describe('zuZeile', () => {
  const PROJEKT_ID = 'b3f1c2d4-0000-4000-8000-000000000011';
  const AUFGABEN_ID = 'b3f1c2d4-0000-4000-8000-000000000022';

  it('uebersetzt das Anlegen eines Projekts', () => {
    const zeile = zuZeile({
      typ: 'PROJEKT_ANGELEGT',
      projektId: PROJEKT_ID,
      name: 'Relaunch',
    });

    expect(zeile).toEqual({
      type: 'PROJECT_CREATED',
      projectId: PROJEKT_ID,
      taskId: null,
      payload: { name: 'Relaunch' },
    });
  });

  /**
   * Der wichtigste Test dieser Datei.
   *
   * Beim Verschieben ist der ALTE Status die einzige Angabe, die sich nach dem
   * UPDATE nicht mehr rekonstruieren laesst - `tasks.status` traegt dann
   * bereits den neuen Wert. Faellt `fromStatus` aus dem `payload`, faellt die
   * Aussage des Eintrags in sich zusammen, ohne dass irgendetwas rot wird:
   * `jsonb` nimmt jedes Objekt an.
   */
  it('haelt beim Verschieben den alten UND den neuen Status fest', () => {
    const zeile = zuZeile({
      typ: 'AUFGABE_VERSCHOBEN',
      projektId: PROJEKT_ID,
      aufgabenId: AUFGABEN_ID,
      titel: 'Login-Bug',
      vonStatus: TaskStatus.TODO,
      nachStatus: TaskStatus.DONE,
    });

    expect(zeile.type).toBe('TASK_MOVED');
    expect(zeile.taskId).toBe(AUFGABEN_ID);
    expect(zeile.payload).toEqual({
      title: 'Login-Bug',
      fromStatus: TaskStatus.TODO,
      toStatus: TaskStatus.DONE,
    });
  });

  /**
   * Umsortieren innerhalb einer Spalte: Die Karte hat den Platz gewechselt,
   * nicht die Spalte. Das ist ein gueltiges Ereignis und kein Sonderfall, den
   * die Abbildung wegfiltern duerfte - welchen Satz das Frontend daraus baut,
   * entscheidet es selbst.
   */
  it('laesst gleichen Von- und Nach-Status zu', () => {
    const zeile = zuZeile({
      typ: 'AUFGABE_VERSCHOBEN',
      projektId: PROJEKT_ID,
      aufgabenId: AUFGABEN_ID,
      titel: 'Login-Bug',
      vonStatus: TaskStatus.IN_PROGRESS,
      nachStatus: TaskStatus.IN_PROGRESS,
    });

    expect(zeile.payload).toEqual({
      title: 'Login-Bug',
      fromStatus: TaskStatus.IN_PROGRESS,
      toStatus: TaskStatus.IN_PROGRESS,
    });
  });

  /**
   * Beim Loeschen bleibt `taskId` leer - und das ist Absicht, kein Versehen.
   * Die Zeile verschwindet in derselben Transaktion; ein Fremdschluessel
   * darauf waere durch `ON DELETE SET NULL` sofort wieder leer. Der Titel im
   * `payload` ist danach die einzige Auskunft, die der Eintrag noch geben kann.
   */
  it('schreibt beim Loeschen keine taskId, aber den Titel', () => {
    const zeile = zuZeile({
      typ: 'AUFGABE_GELOESCHT',
      projektId: PROJEKT_ID,
      titel: 'Login-Bug',
    });

    expect(zeile.type).toBe('TASK_DELETED');
    expect(zeile.taskId).toBeNull();
    expect(zeile.payload).toEqual({ title: 'Login-Bug' });
  });

  it('haelt bei Aenderungen fest, WELCHE Felder betroffen waren', () => {
    const zeile = zuZeile({
      typ: 'AUFGABE_GEAENDERT',
      projektId: PROJEKT_ID,
      aufgabenId: AUFGABEN_ID,
      titel: 'Login-Bug',
      geaenderteFelder: ['title', 'dueDate'],
    });

    expect(zeile.payload).toEqual({
      title: 'Login-Bug',
      changedFields: ['title', 'dueDate'],
    });
  });

  /**
   * Eine leere Liste geaenderter Felder ist erlaubt - ein PATCH mit leerem
   * Koerper ist eine gueltige, wenn auch wirkungslose Anfrage. Hier faellt die
   * Entscheidung bewusst gegen "dann kein Eintrag": Das waere eine fachliche
   * Regel, und die gehoert in den Service, nicht in die Abbildung. Diese
   * Funktion uebersetzt, sie urteilt nicht.
   */
  it('kommt mit einer leeren Liste geaenderter Felder zurecht', () => {
    const zeile = zuZeile({
      typ: 'PROJEKT_GEAENDERT',
      projektId: PROJEKT_ID,
      name: 'Relaunch',
      geaenderteFelder: [],
    });

    expect(zeile.payload).toEqual({ name: 'Relaunch', changedFields: [] });
  });
});
