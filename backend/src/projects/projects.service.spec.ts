import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

  const projectCreate = jest.fn<Promise<unknown>, [CreateArgumente]>();
  const projectFindMany = jest.fn<Promise<unknown>, [FindManyArgumente]>();
  const projectFindFirst = jest.fn<Promise<unknown>, [FindFirstArgumente]>();
  const projectUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [UpdateManyArgumente]
  >();

  beforeEach(async () => {
    projectCreate.mockReset();
    projectFindMany.mockReset();
    projectFindFirst.mockReset();
    projectUpdateMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              create: projectCreate,
              findMany: projectFindMany,
              findFirst: projectFindFirst,
              updateMany: projectUpdateMany,
            },
          },
        },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  describe('erstelle', () => {
    it('schreibt die Organisation aus dem Pfad, nicht aus den Eingabedaten', async () => {
      projectCreate.mockResolvedValue({ id: PROJEKT_ID });

      await service.erstelle(ORG_ID, { name: 'Relaunch' });

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

      await service.erstelle(ORG_ID, { name: 'Relaunch' });

      const argumente = projectCreate.mock.calls[0][0];
      expect(argumente.select).toBeDefined();
      expect(argumente.select.organizationId).toBeUndefined();
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

      await service.archiviere(ORG_ID, PROJEKT_ID);

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
        service.archiviere(ORG_ID, PROJEKT_ID),
      ).resolves.toBeUndefined();
    });

    it('meldet 404, wenn es das Projekt in dieser Organisation nicht gibt', async () => {
      projectUpdateMany.mockResolvedValue({ count: 0 });
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.archiviere(FREMDE_ORG_ID, PROJEKT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
