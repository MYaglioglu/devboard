/**
 * ============================================================================
 * EXPLAIN ANALYZE FUER DIE BEIDEN FEED-PFADE
 * ============================================================================
 * In `08_DATABASE.md` steht behauptet, dass der organisationsweite Index den
 * projektgefilterten Feed NICHT bedient und deshalb ein zweiter noetig ist.
 * Dieses Skript prueft das nach - mit dem Ausfuehrungsplan, den PostgreSQL
 * tatsaechlich waehlt.
 *
 * ============================================================================
 * WARUM SO VIELE TESTZEILEN
 * ============================================================================
 * Bei ein paar hundert Zeilen nimmt der Planer IMMER einen Seq Scan, und zwar
 * zu Recht: Eine kleine Tabelle vollstaendig zu lesen ist billiger, als
 * Index und Tabelle abwechselnd anzuspringen. Ein `EXPLAIN` auf Testdaten
 * beweist deshalb regelmaessig das Gegenteil dessen, was gemeint war - und
 * "der Index wird nicht benutzt" ist die falsche Schlussfolgerung daraus.
 *
 * Deshalb hier 40.000 Zeilen: genug, dass sich der Index lohnt und die
 * Entscheidung des Planers etwas aussagt.
 *
 * Aufruf:
 *   npm run erklaere:feed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '../src/generated/prisma/client';

const ZEILEN = Number(process.env.ZEILEN ?? 40000);
const PROJEKTE = 50;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

interface PlanZeile {
  'QUERY PLAN': string;
}

const erklaere = async (titel: string, sql: string, werte: unknown[]) => {
  const zeilen = await prisma.$queryRawUnsafe<PlanZeile[]>(
    `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
    ...werte,
  );

  console.log(`\n--- ${titel} ---`);
  for (const zeile of zeilen) {
    console.log(zeile['QUERY PLAN']);
  }
};

const main = async () => {
  const kennung = randomUUID().slice(0, 8);

  const nutzer = await prisma.user.create({
    data: {
      email: `explain-${kennung}@example.com`,
      passwordHash: 'nicht-verwendet',
    },
    select: { id: true },
  });

  const organisation = await prisma.organization.create({
    data: {
      name: `EXPLAIN ${kennung}`,
      memberships: { create: { userId: nutzer.id, role: 'OWNER' } },
    },
    select: { id: true },
  });

  const projektIds: string[] = [];
  for (let p = 0; p < PROJEKTE; p += 1) {
    const projekt = await prisma.project.create({
      data: { organizationId: organisation.id, name: `Projekt ${p}` },
      select: { id: true },
    });
    projektIds.push(projekt.id);
  }

  console.log(`Lege ${ZEILEN} Aktivitaeten an ...`);

  // In Bloecken, damit ein einzelnes INSERT nicht zu gross wird.
  const BLOCK = 5000;
  for (let i = 0; i < ZEILEN; i += BLOCK) {
    await prisma.activity.createMany({
      data: Array.from({ length: Math.min(BLOCK, ZEILEN - i) }, (_, k) => ({
        organizationId: organisation.id,
        projectId: projektIds[(i + k) % PROJEKTE],
        actorId: nutzer.id,
        type: 'TASK_CREATED' as const,
        payload: { title: `Eintrag ${i + k}`, status: 'TODO' },
        // Zeitlich gestreut, damit die Sortierung etwas zu tun hat.
        createdAt: new Date(Date.now() - (i + k) * 1000),
      })),
    });
  }

  // ==========================================================================
  // OHNE ANALYZE SIND DIE SCHAETZUNGEN DES PLANERS WERTLOS
  // ==========================================================================
  // PostgreSQL entscheidet anhand von Statistiken (Zeilenzahl, Verteilung der
  // Werte). Die werden vom Autovacuum-Prozess gepflegt - der laeuft aber nicht
  // sofort nach einem Massen-INSERT. Ohne dieses ANALYZE plant der Optimierer
  // auf dem Stand "Tabelle ist leer" und waehlt einen Seq Scan, obwohl der
  // Index die bessere Wahl waere.
  //
  // Genau das ist die haeufigste Ursache fuer "der Index wird ignoriert" nach
  // einem Datenimport - und es ist kein Fehler im Index.
  await prisma.$executeRawUnsafe('ANALYZE activities');

  const feedSql = `
    SELECT id, type, "projectId", "taskId", payload, "createdAt", "actorId"
      FROM activities
     WHERE "organizationId" = $1::uuid
     ORDER BY "createdAt" DESC, id DESC
     LIMIT 20`;

  const projektSql = `
    SELECT id, type, "projectId", "taskId", payload, "createdAt", "actorId"
      FROM activities
     WHERE "organizationId" = $1::uuid AND "projectId" = $2::uuid
     ORDER BY "createdAt" DESC, id DESC
     LIMIT 20`;

  await erklaere('Feed der Organisation', feedSql, [organisation.id]);
  await erklaere('Feed eines Projekts', projektSql, [
    organisation.id,
    projektIds[0],
  ]);

  // ==========================================================================
  // DIE GEGENPROBE: DERSELBE PFAD OHNE DEN ZWEITEN INDEX
  // ==========================================================================
  // Der Index wird nur fuer diese Transaktion unsichtbar gemacht und danach
  // zurueckgerollt - `DROP INDEX` innerhalb einer Transaktion, die scheitert,
  // hinterlaesst nichts. Ohne diese Gegenprobe waere "der zweite Index ist
  // noetig" wieder nur eine Behauptung.
  console.log(
    '\n=== Gegenprobe: projektgefilterter Feed OHNE zweiten Index ===',
  );
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'DROP INDEX "activities_projectId_createdAt_id_idx"',
      );

      const zeilen = await tx.$queryRawUnsafe<PlanZeile[]>(
        `EXPLAIN (ANALYZE, BUFFERS) ${projektSql}`,
        organisation.id,
        projektIds[0],
      );

      for (const zeile of zeilen) {
        console.log(zeile['QUERY PLAN']);
      }

      throw new Error('ROLLBACK-ABSICHT');
    });
  } catch (fehler) {
    if (!(fehler instanceof Error) || fehler.message !== 'ROLLBACK-ABSICHT') {
      throw fehler;
    }
  }

  await prisma.organization.deleteMany({ where: { id: organisation.id } });
  await prisma.user.deleteMany({ where: { id: nutzer.id } });
  await prisma.$disconnect();
};

main().catch(async (fehler) => {
  console.error(fehler);
  await prisma.$disconnect();
  process.exit(1);
});
