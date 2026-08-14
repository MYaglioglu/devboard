import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ActivitiesService } from '../activities/activities.service';
import { Prisma } from '../generated/prisma/client';
import { TaskStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

/**
 * Geprueft wird hier vor allem, WONACH gefragt wird - der Mandant liegt beim
 * Task eine Ebene tiefer (ueber `project`), und genau diese Bedingung muss in
 * jeder Abfrage stehen.
 *
 * Dazu die Rechenlogik der Position: Sie ist der Kern des Sprints und laesst
 * sich ohne Datenbank pruefen.
 */
describe('TasksService', () => {
  let service: TasksService;

  const ORG_ID = 'b3f1c2d4-0000-4000-8000-0000000000aa';
  const PROJEKT_ID = 'b3f1c2d4-0000-4000-8000-000000000011';
  const AUFGABEN_ID = 'b3f1c2d4-0000-4000-8000-000000000022';
  const NUTZER_ID = 'b3f1c2d4-0000-4000-8000-000000000033';
  const MITGLIEDSCHAFT_ID = 'b3f1c2d4-0000-4000-8000-000000000044';
  const AKTEUR_ID = 'b3f1c2d4-0000-4000-8000-000000000055';

  interface TaskWhere {
    id?: string;
    projectId?: string;
    status?: TaskStatus;
    project?: { organizationId?: string };
  }

  interface TaskCreateArgumente {
    data: {
      projectId: string;
      title: string;
      status: TaskStatus;
      position: Prisma.Decimal;
      assigneeId?: string | null;
    };
    select: Record<string, unknown>;
  }

  interface TaskFindFirstArgumente {
    where: TaskWhere;
    orderBy?: unknown;
    select: Record<string, unknown>;
  }

  interface TaskFindManyArgumente {
    where: TaskWhere;
    orderBy: Record<string, string>[];
    select: Record<string, unknown>;
  }

  interface TaskDeleteManyArgumente {
    where: TaskWhere;
  }

  const projectFindFirst = jest.fn<Promise<unknown>, [unknown]>();
  const taskCreate = jest.fn<Promise<unknown>, [TaskCreateArgumente]>();
  const taskFindFirst = jest.fn<Promise<unknown>, [TaskFindFirstArgumente]>();
  const taskFindMany = jest.fn<Promise<unknown>, [TaskFindManyArgumente]>();
  const taskDeleteMany = jest.fn<
    Promise<{ count: number }>,
    [TaskDeleteManyArgumente]
  >();
  const membershipFindUnique = jest.fn<Promise<unknown>, [unknown]>();

  /** Der Aktivitaets-Eintrag. `payload` bleibt `unknown` - kein `any`, auch hier nicht. */
  interface AktivitaetsArgumente {
    data: {
      organizationId: string;
      actorId: string;
      type: string;
      projectId: string;
      taskId: string | null;
      payload: unknown;
    };
  }

  const activityCreate = jest.fn<Promise<unknown>, [AktivitaetsArgumente]>();

  /**
   * Eine Zeile, wie Prisma sie mit AUFGABE_FELDER liefert. `position` ist
   * ausdruecklich ein Decimal-Objekt und keine Zahl - waere es eine Zahl,
   * ginge `.toString()` zwar gut, aber der Test pruefte etwas anderes als die
   * Wirklichkeit.
   */
  const zeile = (position: string) => ({
    id: AUFGABEN_ID,
    title: 'Aufgabe',
    description: null,
    status: TaskStatus.TODO,
    position: new Prisma.Decimal(position),
    version: 0,
    dueDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignee: null,
  });

  beforeEach(async () => {
    projectFindFirst.mockReset();
    taskCreate.mockReset();
    taskFindFirst.mockReset();
    taskFindMany.mockReset();
    taskDeleteMany.mockReset();
    membershipFindUnique.mockReset();
    activityCreate.mockReset();

    const prismaAttrappe = {
      project: { findFirst: projectFindFirst },
      task: {
        create: taskCreate,
        findFirst: taskFindFirst,
        findMany: taskFindMany,
        deleteMany: taskDeleteMany,
      },
      membership: { findUnique: membershipFindUnique },
      activity: { create: activityCreate },
      // `$transaction` bekommt hier den Attrappen-Client selbst gereicht.
      // Damit laeuft der Code unveraendert; getestet wird die Logik, nicht
      // das Transaktionsverhalten von PostgreSQL - das gehoert in die
      // E2E-Tests gegen die echte Datenbank.
      $transaction: <T>(rueckruf: (tx: unknown) => Promise<T>): Promise<T> =>
        rueckruf(prismaAttrappe),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        // Der echte ActivitiesService - er schreibt ueber den `tx`, den er
        // hereingereicht bekommt. Waere er eine Attrappe, koennte dieser Test
        // nicht mehr zeigen, dass der Eintrag ueber DENSELBEN Klienten laeuft
        // wie die fachliche Aenderung.
        ActivitiesService,
        { provide: PrismaService, useValue: prismaAttrappe },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  describe('erstelle', () => {
    it('haengt die erste Karte einer Spalte an die Ausgangsposition', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      taskFindFirst.mockResolvedValue(null);
      taskCreate.mockResolvedValue(zeile('1000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'Erste',
        status: TaskStatus.TODO,
      });

      const { data } = taskCreate.mock.calls[0][0];
      expect(data.position.toString()).toBe('1000');
    });

    it('haengt weitere Karten unten an, mit Abstand zur letzten', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      taskFindFirst.mockResolvedValue({ position: new Prisma.Decimal('3000') });
      taskCreate.mockResolvedValue(zeile('4000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'Zweite',
        status: TaskStatus.TODO,
      });

      const { data } = taskCreate.mock.calls[0][0];
      expect(data.position.toString()).toBe('4000');
    });

    /**
     * Der Test, der die Praezision bewacht.
     *
     * Waere `position` im Service ein `number`, ergaebe diese Rechnung
     * 1000.0000000000001 oder aehnlich - Gleitkomma kann den Wert nicht
     * darstellen. Mit Decimal kommt er exakt heraus.
     */
    it('rechnet exakt, auch mit vielen Nachkommastellen', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      taskFindFirst.mockResolvedValue({
        position: new Prisma.Decimal('0.000000000000000000000000000001'),
      });
      taskCreate.mockResolvedValue(zeile('1000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'Genau',
        status: TaskStatus.TODO,
      });

      const { data } = taskCreate.mock.calls[0][0];
      expect(data.position.toString()).toBe(
        '1000.000000000000000000000000000001',
      );
    });

    it('sucht die letzte Position in DERSELBEN Spalte, nicht im ganzen Projekt', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      taskFindFirst.mockResolvedValue(null);
      taskCreate.mockResolvedValue(zeile('1000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'In Arbeit',
        status: TaskStatus.IN_PROGRESS,
      });

      const { where } = taskFindFirst.mock.calls[0][0];
      expect(where.status).toBe(TaskStatus.IN_PROGRESS);
      expect(where.projectId).toBe(PROJEKT_ID);
    });

    it('legt nichts in einem Projekt einer fremden Organisation an', async () => {
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
          title: 'Fremd',
          status: TaskStatus.TODO,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(taskCreate).not.toHaveBeenCalled();
    });

    it('legt nichts in einem archivierten Projekt an', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      taskFindFirst.mockResolvedValue(null);
      taskCreate.mockResolvedValue(zeile('1000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'Egal',
        status: TaskStatus.TODO,
      });

      // Die Bedingung selbst wird festgenagelt: `archivedAt: null` muss im
      // WHERE stehen. Ohne diesen Test koennte sie jemand entfernen, ohne dass
      // ein Erfolgspfad-Test es merkt.
      const argumente = projectFindFirst.mock.calls[0][0] as {
        where: { organizationId: string; archivedAt: null };
      };
      expect(argumente.where.organizationId).toBe(ORG_ID);
      expect(argumente.where.archivedAt).toBeNull();
    });
  });

  describe('Zuweisung', () => {
    it('uebersetzt die Nutzer-ID in die Mitgliedschaft DIESER Organisation', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      membershipFindUnique.mockResolvedValue({ id: MITGLIEDSCHAFT_ID });
      taskFindFirst.mockResolvedValue(null);
      taskCreate.mockResolvedValue(zeile('1000'));

      await service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
        title: 'Zugewiesen',
        status: TaskStatus.TODO,
        assigneeId: NUTZER_ID,
      });

      const argumente = membershipFindUnique.mock.calls[0][0] as {
        where: { organizationId_userId: { organizationId: string } };
      };
      expect(argumente.where.organizationId_userId.organizationId).toBe(ORG_ID);

      const { data } = taskCreate.mock.calls[0][0];
      expect(data.assigneeId).toBe(MITGLIEDSCHAFT_ID);
    });

    /**
     * Die Regel "nur an Mitglieder derselben Organisation" - und der Nachweis,
     * dass sie sich aus dem Nachschlag ergibt: Kein Treffer, keine Zuweisung.
     */
    it('weist eine Zuweisung an ein Nichtmitglied mit 400 ab', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });
      membershipFindUnique.mockResolvedValue(null);

      await expect(
        service.erstelle(ORG_ID, AKTEUR_ID, PROJEKT_ID, {
          title: 'Fremdzuweisung',
          status: TaskStatus.TODO,
          assigneeId: NUTZER_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(taskCreate).not.toHaveBeenCalled();
    });
  });

  describe('findeAlle', () => {
    it('filtert ueber die Beziehung zum Projekt auf den Mandanten', async () => {
      taskFindMany.mockResolvedValue([]);

      await service.findeAlle(ORG_ID, PROJEKT_ID);

      const { where } = taskFindMany.mock.calls[0][0];
      expect(where.projectId).toBe(PROJEKT_ID);
      expect(where.project?.organizationId).toBe(ORG_ID);
    });

    it('sortiert nach Spalte, dann Position - und bricht Gleichstaende auf', async () => {
      taskFindMany.mockResolvedValue([]);

      await service.findeAlle(ORG_ID, PROJEKT_ID);

      const { orderBy } = taskFindMany.mock.calls[0][0];
      expect(orderBy[0]).toEqual({ status: 'asc' });
      expect(orderBy[1]).toEqual({ position: 'asc' });
      // Ohne diese beiden waere die Reihenfolge zweier gleich positionierter
      // Karten von Lauf zu Lauf verschieden.
      expect(orderBy.length).toBeGreaterThan(2);
    });

    it('gibt die Position als Zeichenkette heraus, nicht als Zahl', async () => {
      taskFindMany.mockResolvedValue([
        zeile('1000.000000000000000000000000000001'),
      ]);

      const aufgaben = await service.findeAlle(ORG_ID, PROJEKT_ID);

      expect(aufgaben[0].position).toBe('1000.000000000000000000000000000001');
      expect(typeof aufgaben[0].position).toBe('string');
    });
  });

  describe('loesche', () => {
    it('nimmt den Mandanten in die Loeschbedingung auf', async () => {
      taskFindFirst.mockResolvedValue({ title: 'Aufgabe' });
      taskDeleteMany.mockResolvedValue({ count: 1 });

      await service.loesche(ORG_ID, AKTEUR_ID, PROJEKT_ID, AUFGABEN_ID);

      const { where } = taskDeleteMany.mock.calls[0][0];
      expect(where).toEqual({
        id: AUFGABEN_ID,
        projectId: PROJEKT_ID,
        project: { organizationId: ORG_ID },
      });
    });

    it('meldet 404, wenn es die Aufgabe in dieser Organisation nicht gibt', async () => {
      // `null` ausdruecklich, nicht "Attrappe nicht eingerichtet": Sonst waere
      // der Test auch dann gruen, wenn der Service aus einem ganz anderen
      // Grund scheitert - und man sieht dem gruenen Haken nicht an, welche
      // Zeile er bewacht.
      taskFindFirst.mockResolvedValue(null);

      await expect(
        service.loesche(ORG_ID, AKTEUR_ID, PROJEKT_ID, AUFGABEN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);

      // Nicht gefunden heisst: gar nicht erst loeschen.
      expect(taskDeleteMany).not.toHaveBeenCalled();
    });

    /**
     * Der Fall zwischen den beiden Abfragen.
     *
     * Die Aufgabe war beim Lesen des Titels noch da, ist beim DELETE aber
     * weg - zwei gleichzeitige Loeschanfragen, oder ein Doppelklick. Wichtig
     * ist beides: 404 als Antwort, und KEIN Feed-Eintrag. Sonst stuende bei
     * jedem Doppelklick zweimal "Aufgabe geloescht" untereinander.
     */
    it('protokolliert nichts, wenn das DELETE nichts trifft', async () => {
      taskFindFirst.mockResolvedValue({ title: 'Aufgabe' });
      taskDeleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.loesche(ORG_ID, AKTEUR_ID, PROJEKT_ID, AUFGABEN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(activityCreate).not.toHaveBeenCalled();
    });

    /**
     * Der Titel steht im `payload`, nicht hinter `taskId`.
     *
     * `taskId` ist hier ausdruecklich `null`: Die Zeile ist im selben Moment
     * verschwunden, ein Fremdschluessel darauf waere durch `ON DELETE SET
     * NULL` sofort wieder leer. Ohne den Titel im `payload` bliebe im Feed nur
     * "irgendetwas wurde geloescht" uebrig.
     */
    it('protokolliert den Titel der geloeschten Aufgabe', async () => {
      taskFindFirst.mockResolvedValue({ title: 'Login-Bug' });
      taskDeleteMany.mockResolvedValue({ count: 1 });

      await service.loesche(ORG_ID, AKTEUR_ID, PROJEKT_ID, AUFGABEN_ID);

      expect(activityCreate).toHaveBeenCalledTimes(1);
      const { data } = activityCreate.mock.calls[0][0];
      expect(data.type).toBe('TASK_DELETED');
      expect(data.actorId).toBe(AKTEUR_ID);
      expect(data.taskId).toBeNull();
      expect(data.payload).toEqual({ title: 'Login-Bug' });
    });
  });
});
