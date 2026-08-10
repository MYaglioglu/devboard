import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const NUTZER_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
  const ORG_ID = 'b3f1c2d4-0000-4000-8000-0000000000aa';

  /**
   * Die Argumente, mit denen der Service `prisma.organization.create` aufruft.
   * Ausdruecklich typisiert - `jest.fn()` ohne Typangabe liefert `any`, und
   * `any` im Testcode ist genauso gefaehrlich wie im Produktivcode: Der Test
   * wuerde jeden Tippfehler im Zugriffspfad stillschweigend hinnehmen.
   */
  interface OrgCreateArgumente {
    data: {
      name: string;
      memberships: { create: { userId: string; role: Role } };
    };
    select: Record<string, boolean>;
  }

  interface MembershipFindManyArgumente {
    where: { userId: string };
    select: Record<string, unknown>;
    orderBy: Record<string, string>;
  }

  const organizationCreate = jest.fn<Promise<unknown>, [OrgCreateArgumente]>();
  const membershipFindMany = jest.fn<
    Promise<unknown>,
    [MembershipFindManyArgumente]
  >();

  beforeEach(async () => {
    organizationCreate.mockReset();
    membershipFindMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: { create: organizationCreate },
            membership: { findMany: membershipFindMany },
          },
        },
      ],
    }).compile();

    service = module.get(OrganizationsService);
  });

  describe('erstelle', () => {
    /**
     * Der wichtigste Test dieser Datei.
     *
     * Er prueft nicht das Ergebnis, sondern die FORM des Aufrufs - naemlich
     * dass die Mitgliedschaft als verschachtelter Schreibvorgang mitgegeben
     * wird. Genau daran haengt die Atomaritaet: Zwei getrennte `create`-Aufrufe
     * lieferten dasselbe Ergebnis und waeren trotzdem falsch, weil zwischen
     * ihnen etwas schiefgehen kann.
     *
     * Ein Test, der nur das Rueckgabeobjekt prueft, wuerde diesen Unterschied
     * NICHT bemerken. Deshalb steht er hier so.
     */
    it('legt Organisation und OWNER-Mitgliedschaft in EINEM Schreibvorgang an', async () => {
      organizationCreate.mockResolvedValue({
        id: ORG_ID,
        name: 'Acme',
        createdAt: new Date(),
      });

      await service.erstelle(NUTZER_ID, { name: 'Acme' });

      expect(organizationCreate).toHaveBeenCalledTimes(1);

      const argumente = organizationCreate.mock.calls[0][0];
      expect(argumente.data.memberships.create).toEqual({
        userId: NUTZER_ID,
        role: Role.OWNER,
      });
    });

    it('macht den Ersteller zum OWNER, nicht zum ADMIN', async () => {
      organizationCreate.mockResolvedValue({
        id: ORG_ID,
        name: 'Acme',
        createdAt: new Date(),
      });

      const ergebnis = await service.erstelle(NUTZER_ID, { name: 'Acme' });

      // OWNER ist die einzige Rolle, die loeschen und weitere OWNER ernennen
      // darf. Mit ADMIN gaebe es niemanden mit diesen Rechten - die
      // Organisation waere von der ersten Sekunde an unverwaltbar.
      expect(ergebnis.role).toBe(Role.OWNER);
    });
  });

  describe('findeMeine', () => {
    /**
     * Der sicherheitsrelevante Test.
     *
     * Er prueft, dass `userId` in der WHERE-BEDINGUNG steht. Ein Service, der
     * alle Mitgliedschaften laedt und danach filtert, lieferte dasselbe
     * Ergebnis - haette die fremden Daten aber bereits gelesen. Bei einer
     * spaeteren Aenderung (Paginierung, ein `select` mehr) wird aus so einem
     * Nachfilter still ein Leck.
     *
     * Das ist der Kern von Multi-Tenancy: Der Mandant gehoert in die
     * BEDINGUNG, nicht in eine Pruefung danach.
     */
    it('schraenkt die Abfrage ueber die WHERE-Bedingung auf den Nutzer ein', async () => {
      membershipFindMany.mockResolvedValue([]);

      await service.findeMeine(NUTZER_ID);

      const argumente = membershipFindMany.mock.calls[0][0];
      expect(argumente.where).toEqual({ userId: NUTZER_ID });
    });

    it('fragt ueber die Mitgliedschaften ab, nicht ueber die Organisationen', async () => {
      membershipFindMany.mockResolvedValue([]);

      await service.findeMeine(NUTZER_ID);

      // Die Richtung der Abfrage entscheidet, ob der Index auf `userId`
      // ueberhaupt genutzt werden kann. Ueber `organization.findMany` mit
      // `some`-Filter waere das Ergebnis gleich, der Zugriffsweg aber ein
      // anderer - und bei wachsender Zahl an Organisationen deutlich teurer.
      expect(membershipFindMany).toHaveBeenCalledTimes(1);
    });

    it('macht die Verschachtelung flach und reicht die eigene Rolle mit', async () => {
      const angelegt = new Date('2026-08-11T10:00:00.000Z');
      membershipFindMany.mockResolvedValue([
        {
          role: Role.MEMBER,
          organization: { id: ORG_ID, name: 'Acme', createdAt: angelegt },
        },
      ]);

      const ergebnis = await service.findeMeine(NUTZER_ID);

      // Das Frontend soll `organisation.name` lesen, nicht
      // `eintrag.organization.name`. Die Antwort bildet die Fachlichkeit ab,
      // nicht die Tabellenstruktur.
      expect(ergebnis).toEqual([
        { id: ORG_ID, name: 'Acme', createdAt: angelegt, role: Role.MEMBER },
      ]);
    });

    it('liefert eine leere Liste, wenn der Nutzer nirgends Mitglied ist', async () => {
      membershipFindMany.mockResolvedValue([]);

      // Ein gueltiger Zustand, kein Fehler: Wir legen bei der Registrierung
      // bewusst keine Organisation automatisch an. Das Frontend zeigt dafuer
      // einen Leerzustand - eine 404 waere hier falsch, denn die Liste
      // existiert, sie ist nur leer.
      await expect(service.findeMeine(NUTZER_ID)).resolves.toEqual([]);
    });
  });
});
