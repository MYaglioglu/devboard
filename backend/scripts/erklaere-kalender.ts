/**
 * ============================================================================
 * EXPLAIN ANALYZE FUER DIE KALENDERABFRAGE
 * ============================================================================
 * Dieses Skript hat am 02.09.2026 eine Entwurfsentscheidung widerlegt.
 *
 * Urspruenglich stand in schema.prisma, `tasks` brauche KEINE eigene
 * `organizationId`: Ein Index auf `dueDate` allein genuege, weil die
 * Selektivitaet am Datum haenge und nicht am Mandanten. Die Messung zeigte das
 * Gegenteil - das Datumsfenster waehlt die Aufgaben ALLER Mandanten, und erst
 * der Verbund mit `projects` wirft neun Zehntel davon weg.
 *
 * Das Skript bleibt erhalten, damit die Aussage nachpruefbar ist statt
 * behauptet, und damit die naechste Person die Zahlen selbst erzeugen kann,
 * statt der Tabelle in 12_TESTING.md zu glauben.
 *
 * Es misst drei Plaene fuer dieselbe fachliche Frage:
 *
 *   1. wie es heute ist - Filter auf tasks.organizationId, Index
 *      (organizationId, dueDate)
 *   2. Gegenprobe A: der abgeloeste Entwurf - Mandant nur ueber den Verbund,
 *      Index auf dueDate allein
 *   3. Gegenprobe B: gar kein Index auf dueDate
 *
 * Ohne (2) waere "die verdoppelte Spalte lohnt sich" unbelegt, ohne (3) waere
 * "der Index wird ueberhaupt benutzt" unbelegt. Beide Gegenproben laufen in
 * einer Transaktion, die absichtlich scheitert - DDL ist in PostgreSQL
 * transaktional, es bleibt nichts zurueck.
 *
 * ============================================================================
 * WARUM MEHRERE ORGANISATIONEN
 * ============================================================================
 * Der Mandantenfilter kostet nur dann etwas, wenn es ueberhaupt fremde Zeilen
 * im selben Zeitraum GIBT. Bei einer einzigen Organisation waere er gratis,
 * und die Messung wuerde die guenstigste denkbare Lage messen statt der
 * echten.
 *
 * Aufruf:
 *   npm run erklaere:kalender
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Genug Zeilen, dass die Entscheidung des Planers etwas aussagt.
 *
 * Bei ein paar hundert Zeilen waehlt PostgreSQL IMMER einen Seq Scan, und
 * zwar zu Recht - eine kleine Tabelle ganz zu lesen ist billiger, als Index
 * und Tabelle abwechselnd anzuspringen. Ein EXPLAIN auf Testdaten beweist
 * deshalb regelmaessig das Gegenteil dessen, was gemeint war.
 */
const AUFGABEN_JE_ORG = Number(process.env.ZEILEN ?? 8000);
const ORGANISATIONEN = 10;
const PROJEKTE_JE_ORG = 20;

/** Ueber wie viele Tage die Faelligkeiten gestreut werden. */
const STREUUNG_TAGE = 1095; // drei Jahre

const TAG_IN_MS = 86_400_000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

interface PlanZeile {
  'QUERY PLAN': string;
}

const zeigePlan = (zeilen: PlanZeile[]) => {
  for (const zeile of zeilen) {
    console.log(zeile['QUERY PLAN']);
  }
};

/**
 * Die Kalenderabfrage in SQL - so, wie Prisma sie fuer findeZeitraum baut.
 *
 * Handgeschrieben statt aus dem Query-Log kopiert, damit sie lesbar bleibt.
 * Was zaehlt, ist die Form: Mandant und Zeitraum beide auf `tasks`, der
 * Verbund mit `projects` nur noch fuer Name und Archiv-Kennzeichen.
 */
const KALENDER_SQL = `
  SELECT t.id, t.title, t.status, t.version, t."dueDate", p.id AS "projectId", p.name
    FROM tasks t
    JOIN projects p ON p.id = t."projectId"
   WHERE t."organizationId" = $1::uuid
     AND t."dueDate" >= $2::timestamp
     AND t."dueDate" <  $3::timestamp
     AND p."archivedAt" IS NULL
   ORDER BY t."dueDate" ASC, t.id ASC`;

/**
 * Der abgeloeste Entwurf: Der Mandant steht nicht auf der Aufgabe, sondern
 * wird ueber den Verbund geholt.
 *
 * Fachlich liefert er dasselbe Ergebnis - nur deshalb ist der Vergleich
 * ueberhaupt zulaessig. Eine schnellere Abfrage, die etwas anderes
 * zurueckgibt, ist keine Verbesserung, sondern ein Fehler; das ist die Lehre
 * aus der N+1-Messung in Sprint 4.
 */
const KALENDER_SQL_ALT = `
  SELECT t.id, t.title, t.status, t.version, t."dueDate", p.id AS "projectId", p.name
    FROM tasks t
    JOIN projects p ON p.id = t."projectId"
   WHERE t."dueDate" >= $2::timestamp
     AND t."dueDate" <  $3::timestamp
     AND p."organizationId" = $1::uuid
     AND p."archivedAt" IS NULL
   ORDER BY t."dueDate" ASC, t.id ASC`;

const main = async () => {
  const kennung = randomUUID().slice(0, 8);

  const nutzer = await prisma.user.create({
    data: {
      email: `kalender-explain-${kennung}@example.com`,
      passwordHash: 'nicht-verwendet',
    },
    select: { id: true },
  });

  console.log(
    `Lege ${ORGANISATIONEN} Organisationen mit je ${AUFGABEN_JE_ORG} Aufgaben an ...`,
  );

  const beobachteteOrg: string[] = [];
  const anfang = new Date('2026-01-01T00:00:00.000Z').getTime();

  for (let o = 0; o < ORGANISATIONEN; o += 1) {
    const organisation = await prisma.organization.create({
      data: {
        name: `KALENDER EXPLAIN ${kennung} ${o}`,
        memberships: { create: { userId: nutzer.id, role: 'OWNER' } },
      },
      select: { id: true },
    });

    if (o === 0) beobachteteOrg.push(organisation.id);

    const projektIds: string[] = [];
    for (let p = 0; p < PROJEKTE_JE_ORG; p += 1) {
      const projekt = await prisma.project.create({
        data: { organizationId: organisation.id, name: `Projekt ${o}-${p}` },
        select: { id: true },
      });
      projektIds.push(projekt.id);
    }

    const BLOCK = 4000;
    for (let i = 0; i < AUFGABEN_JE_ORG; i += BLOCK) {
      await prisma.task.createMany({
        data: Array.from(
          { length: Math.min(BLOCK, AUFGABEN_JE_ORG - i) },
          (_, k) => ({
            projectId: projektIds[(i + k) % PROJEKTE_JE_ORG],
            organizationId: organisation.id,
            title: `Aufgabe ${o}-${i + k}`,
            position: (i + k + 1) * 1000,
            // Ueber drei Jahre gestreut, aber nicht zufaellig: eine feste
            // Folge macht den Lauf wiederholbar. Ein Zufallsgenerator wuerde
            // den Plan von Lauf zu Lauf verschieben, und die Messung waere
            // nicht mehr vergleichbar.
            dueDate: new Date(
              anfang + (((i + k) * 7919) % STREUUNG_TAGE) * TAG_IN_MS,
            ),
          }),
        ),
      });
    }
  }

  // ==========================================================================
  // OHNE ANALYZE SIND DIE SCHAETZUNGEN DES PLANERS WERTLOS
  // ==========================================================================
  // Der Autovacuum-Prozess pflegt die Statistiken, laeuft aber nicht sofort
  // nach einem Massen-INSERT. Ohne dieses ANALYZE plant der Optimierer auf dem
  // Stand "Tabelle ist leer". Genau das ist die haeufigste Ursache fuer "der
  // Index wird ignoriert" nach einem Import - und kein Fehler im Index.
  await prisma.$executeRawUnsafe('ANALYZE tasks');
  await prisma.$executeRawUnsafe('ANALYZE projects');

  const gesamt = await prisma.task.count();
  console.log(`Aufgaben in der Tabelle: ${gesamt}`);

  // Ein Fenster von 92 Tagen - die Obergrenze aus dem Query-DTO. Gemessen
  // wird der teuerste erlaubte Fall, nicht der bequemste.
  const von = new Date('2026-09-01T00:00:00.000Z');
  const bis = new Date(von.getTime() + 92 * TAG_IN_MS);
  const werte = [beobachteteOrg[0], von, bis];

  console.log(
    '\n=== 1. Wie es heute ist: Filter auf tasks.organizationId, Index (organizationId, dueDate) ===',
  );
  zeigePlan(
    await prisma.$queryRawUnsafe<PlanZeile[]>(
      `EXPLAIN (ANALYZE, BUFFERS) ${KALENDER_SQL}`,
      ...werte,
    ),
  );

  console.log(
    '\n=== 2. Gegenprobe A: abgeloester Entwurf - Mandant nur ueber den Verbund, Index auf dueDate allein ===',
  );
  await inVerworfenerTransaktion(async (tx) => {
    // Der alte Zustand wird HERGESTELLT statt gedanklich verglichen. Anders
    // liesse sich nicht sagen, ob die Aenderung ueberhaupt etwas gebracht hat.
    await tx.$executeRawUnsafe('DROP INDEX "tasks_organizationId_dueDate_idx"');
    await tx.$executeRawUnsafe(
      'CREATE INDEX "tasks_dueDate_idx" ON tasks("dueDate")',
    );
    await tx.$executeRawUnsafe('ANALYZE tasks');

    zeigePlan(
      await tx.$queryRawUnsafe<PlanZeile[]>(
        `EXPLAIN (ANALYZE, BUFFERS) ${KALENDER_SQL_ALT}`,
        ...werte,
      ),
    );
  });

  console.log('\n=== 3. Gegenprobe B: gar kein Index auf dueDate ===');
  await inVerworfenerTransaktion(async (tx) => {
    await tx.$executeRawUnsafe('DROP INDEX "tasks_organizationId_dueDate_idx"');
    await tx.$executeRawUnsafe('ANALYZE tasks');

    zeigePlan(
      await tx.$queryRawUnsafe<PlanZeile[]>(
        `EXPLAIN (ANALYZE, BUFFERS) ${KALENDER_SQL}`,
        ...werte,
      ),
    );
  });

  await prisma.organization.deleteMany({
    where: { name: { contains: `EXPLAIN ${kennung}` } },
  });
  await prisma.user.deleteMany({ where: { id: nutzer.id } });
  await prisma.$disconnect();
};

/**
 * Fuehrt etwas aus und rollt es garantiert zurueck.
 *
 * DDL ist in PostgreSQL transaktional - ein `DROP INDEX` oder `ALTER TABLE`
 * in einer Transaktion, die scheitert, hinterlaesst nichts. Der geworfene
 * Fehler ist deshalb kein Fehler, sondern das Mittel.
 */
const inVerworfenerTransaktion = async (
  arbeit: (
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ) => Promise<void>,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await arbeit(tx);
      throw new Error('ROLLBACK-ABSICHT');
    });
  } catch (fehler) {
    if (!(fehler instanceof Error) || fehler.message !== 'ROLLBACK-ABSICHT') {
      throw fehler;
    }
  }
};

main().catch(async (fehler) => {
  console.error(fehler);
  await prisma.$disconnect();
  process.exit(1);
});
