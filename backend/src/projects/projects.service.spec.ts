import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ActivitiesService } from '../activities/activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

/**
 * Diese Tests pruefen ueberwiegend die FORM der Datenbankaufrufe, nicht das
 * Ergebnis - denn genau darin steckt der Mandantenschutz.
 *
 * Ein Test, der nur das Rueckgabeobjekt prueft, waere auch dann gruen, wenn
 * `organizationId` im `where` fehlt: Mit einer richtigen ID kommt ja das
 * richtige Projekt zurueck. Der Fehler zeigt sich erst mit einer FREMDEN ID -
 * das prueft der E2E-Test. Hier wird die Bedingung selbst festgenagelt.
 */
describe('ProjectsService', () => {
  let service: ProjectsService;

  const ORG_ID = 'b3f1c2d4-0000-4000-8000-0000000000aa';
  const AKTEUR_ID = 'b3f1c2d4-0000-4000-8000-0000000000cc';
  const FREMDE_ORG_ID = 'b3f1c2d4-0000-4000-8000-0000000000bb';
  const PROJEKT_ID = 'b3f1c2d4-0000-4000-8000-000000000011';

  interface WhereMitMandant {
    id?: string;
    organizationId?: string;
    archivedAt?: Date | null;
  }

  interface FindFirstArgumente {
    where: WhereMitMandant;
    select: Record<string, boolean>;
  }

  interface FindManyArgumente {
    where: WhereMitMandant;
    orderBy: Record<string, string>;
    select: Record<string, boolean>;
  }

  interface CreateArgumente {
    data: { organizationId: string; name: string; description?: string };
    select: Record<string, boolean>;
  }

  interface UpdateManyArgumente {
    where: WhereMitMandant;
    data: { archivedAt: Date };
  }

  /**
   * Der Aktivitaets-Eintrag, wie der ActivitiesService ihn schreibt.
   *
   * `payload` ist bewusst `unknown` und nicht `any`: Die Tests, die den Inhalt
   * pruefen, muessen ihn ausdruecklich eingrenzen. Mit `any` waere jeder
   * Tippfehler in einem Schluessel gruen - im Testcode gilt dieselbe Regel wie
   * im Produktivcode.
   */
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

  const projectCreate = jest.fn<Promise<unknown>, [CreateArgumente]>();
  const projectFindMany = jest.fn<Promise<unknown>, [FindManyArgumente]>();
  const projectFindFirst = jest.fn<Promise<unknown>, [FindFirstArgumente]>();
  const projectUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [UpdateManyArgumente]
  >();
  const projectFindFirstOrThrow = jest.fn<Promise<unknown>, [unknown]>();
  const activityCreate = jest.fn<Promise<unknown>, [AktivitaetsArgumente]>();

  beforeEach(async () => {
    projectCreate.mockReset();
    projectFindMany.mockReset();
    projectFindFirst.mockReset();
    projectUpdateMany.mockReset();
    projectFindFirstOrThrow.mockReset();
    activityCreate.mockReset();

    // ========================================================================
    // WARUM $transaction HIER DIE ARBEIT EINFACH AUSFUEHRT
    // ========================================================================
    // Der Attrappe fehlt jede echte Transaktionssemantik - sie ruft die
    // uebergebene Funktion mit demselben Objekt auf, das auch ausserhalb
    // benutzt wird. Damit prueft dieser Test NICHT, dass ein Rollback
    // funktioniert; das kann nur ein E2E-Test gegen eine echte Datenbank.
    //
    // Was er prueft, ist die FORM: dass der Aktivitaets-Eintrag ueber
    // denselben Klienten laeuft wie die fachliche Aenderung. Wuerde der
    // ActivitiesService sich seinen eigenen PrismaService holen, liefe sein
    // `create` an dieser Attrappe vorbei - und der Test waere rot.
    const datenbank = {
      project: {
        create: projectCreate,
        findMany: projectFindMany,
        findFirst: projectFindFirst,
        findFirstOrThrow: projectFindFirstOrThrow,
        updateMany: projectUpdateMany,
      },
      activity: { create: activityCreate },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        // Der ECHTE ActivitiesService, keine Attrappe: Er ist die Stelle, an
        // der aus einem Ereignis eine Zeile wird. Eine Attrappe wuerde genau
        // die Abbildung wegmocken, um die es hier geht.
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: {
            ...datenbank,
            $transaction: async <T>(
              arbeit: (tx: typeof datenbank) => Promise<T>,
            ): Promise<T> => arbeit(datenbank),
          },
        },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('erstelle', () => {
    it('schreibt die Organisation aus dem Pfad, nicht aus den Eingabedaten', async () => {
      projectCreate.mockResolvedValue({ id: PROJEKT_ID });

      await service.erstelle(ORG_ID, AKTEUR_ID, { name: 'Relaunch' });

      const argumente = projectCreate.mock.calls[0][0];
      expect(argumente.data.organizationId).toBe(ORG_ID);
    });

    /**
     * Ohne `select` liefert Prisma ALLE Spalten - auch `organizationId`. Das
     * waere kein Sicherheitsloch (der Client kennt seine Organisation), aber
     * der Anfang einer Gewohnheit: Die naechste Spalte, die niemand sehen
     * soll, waere dann automatisch in der Antwort.
     */
    it('gibt nur ausgewaehlte Felder heraus, nicht die ganze Zeile', async () => {
      projectCreate.mockResolvedValue({ id: PROJEKT_ID });

      await service.erstelle(ORG_ID, AKTEUR_ID, { name: 'Relaunch' });

      const argumente = projectCreate.mock.calls[0][0];
      expect(argumente.select).toBeDefined();
      expect(argumente.select.organizationId).toBeUndefined();
    });

    it('protokolliert das Anlegen mit Mandant und Akteur', async () => {
      projectCreate.mockResolvedValue({ id: PROJEKT_ID, name: 'Relaunch' });

      await service.erstelle(ORG_ID, AKTEUR_ID, { name: 'Relaunch' });

      expect(activityCreate).toHaveBeenCalledTimes(1);
      const { data } = activityCreate.mock.calls[0][0];
      expect(data.organizationId).toBe(ORG_ID);
      expect(data.actorId).toBe(AKTEUR_ID);
      expect(data.type).toBe('PROJECT_CREATED');
      expect(data.projectId).toBe(PROJEKT_ID);
      expect(data.payload).toEqual({ name: 'Relaunch' });
    });
  });

  describe('findeAlle', () => {
    it('filtert auf die Organisation und blendet Archiviertes aus', async () => {
      projectFindMany.mockResolvedValue([]);

      await service.findeAlle(ORG_ID, false);

      const { where } = projectFindMany.mock.calls[0][0];
      expect(where.organizationId).toBe(ORG_ID);
      expect(where.archivedAt).toBeNull();
    });

    it('nimmt Archiviertes nur auf ausdrueckliche Anforderung dazu', async () => {
      projectFindMany.mockResolvedValue([]);

      await service.findeAlle(ORG_ID, true);

      const { where } = projectFindMany.mock.calls[0][0];
      expect(where.organizationId).toBe(ORG_ID);
      // Kein Filter auf archivedAt - aber der Mandantenfilter bleibt.
      expect(where.archivedAt).toBeUndefined();
    });
  });

  describe('findeEines', () => {
    /**
     * Der wichtigste Test dieser Datei.
     *
     * Er prueft nicht, DASS ein Projekt zurueckkommt, sondern WONACH gefragt
     * wurde. Stuende die Mandantenpruefung erst nach dem Laden, waere dieser
     * Test rot - und genau das soll er sein.
     */
    it('stellt den Mandanten in die WHERE-Bedingung, nicht in eine Pruefung danach', async () => {
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });

      await service.findeEines(ORG_ID, PROJEKT_ID);

      expect(projectFindFirst).toHaveBeenCalledTimes(1);
      const { where } = projectFindFirst.mock.calls[0][0];
      expect(where).toEqual({ id: PROJEKT_ID, organizationId: ORG_ID });
    });

    it('meldet 404, wenn die Abfrage nichts liefert', async () => {
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.findeEines(FREMDE_ORG_ID, PROJEKT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archiviere', () => {
    it('setzt archivedAt nur bei noch nicht archivierten Projekten', async () => {
      projectUpdateMany.mockResolvedValue({ count: 1 });
      projectFindFirstOrThrow.mockResolvedValue({ name: 'Relaunch' });

      await service.archiviere(ORG_ID, AKTEUR_ID, PROJEKT_ID);

      const { where } = projectUpdateMany.mock.calls[0][0];
      expect(where).toEqual({
        id: PROJEKT_ID,
        organizationId: ORG_ID,
        archivedAt: null,
      });
      // Kein zweiter Zugriff im Normalfall - die Rueckfrage laeuft nur, wenn
      // nichts geaendert wurde.
      expect(projectFindFirst).not.toHaveBeenCalled();
    });

    /**
     * Idempotenz: Das zweite DELETE hinterlaesst denselben Zustand wie das
     * erste und meldet keinen Fehler. Ohne diese Unterscheidung wuerde jeder
     * Doppelklick zu einer 404 fuehren.
     */
    it('bleibt still, wenn das Projekt bereits archiviert war', async () => {
      projectUpdateMany.mockResolvedValue({ count: 0 });
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });

      await expect(
        service.archiviere(ORG_ID, AKTEUR_ID, PROJEKT_ID),
      ).resolves.toBeUndefined();
    });

    /**
     * Seit Sprint 4 gehoert zur Idempotenz auch der Feed.
     *
     * Der Test darueber prueft nur, dass KEIN FEHLER kommt - er waere auch
     * dann gruen, wenn bei jedem Doppelklick ein weiterer Eintrag "Projekt
     * archiviert" entstuende. Genau das ist hier der Gegenstand: Zweimal
     * dasselbe Ereignis untereinander waere ein sichtbarer Widerspruch zu der
     * Zusage, die dieser Endpoint gibt.
     */
    it('schreibt keinen zweiten Eintrag, wenn bereits archiviert war', async () => {
      projectUpdateMany.mockResolvedValue({ count: 0 });
      projectFindFirst.mockResolvedValue({ id: PROJEKT_ID });

      await service.archiviere(ORG_ID, AKTEUR_ID, PROJEKT_ID);

      expect(activityCreate).not.toHaveBeenCalled();
    });

    it('meldet 404, wenn es das Projekt in dieser Organisation nicht gibt', async () => {
      projectUpdateMany.mockResolvedValue({ count: 0 });
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.archiviere(FREMDE_ORG_ID, AKTEUR_ID, PROJEKT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('protokolliert nichts, wenn es das Projekt nicht gibt', async () => {
      projectUpdateMany.mockResolvedValue({ count: 0 });
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.archiviere(FREMDE_ORG_ID, AKTEUR_ID, PROJEKT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(activityCreate).not.toHaveBeenCalled();
    });
  });
});
