/**
 * ============================================================================
 * DIE MESSUNG ZU SCHEIBE 4.4 - NICHT DIE BEHAUPTUNG
 * ============================================================================
 * "Keine N+1-Queries" behauptet fast jeder Lebenslauf. Dieses Skript zaehlt
 * nach: Es legt Testdaten an, laesst BEIDE Fassungen der Kennzahlen-Abfrage
 * laufen und zaehlt die SQL-Anweisungen, die Prisma tatsaechlich abgesetzt hat.
 *
 * Warum ein Skript und kein Test: Ein Test soll bei jedem Lauf dasselbe sagen.
 * Eine Messung soll eine ZAHL liefern, und die haengt von der Datenmenge ab -
 * genau das ist ihre Aussage. Beides zu vermischen ergaebe einen Test, der
 * nichts prueft, und eine Messung, die nichts misst.
 *
 * Die naive Fassung steht NUR hier. Sie ist nicht der Code, der laeuft -
 * sie ist der Vergleichswert, ohne den die andere Zahl bedeutungslos waere.
 *
 * Aufruf:
 *   npm run messung:dashboard
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '../src/generated/prisma/client';
import { TaskStatus } from '../src/generated/prisma/enums';

// Ueber die Umgebung einstellbar, damit sich die eigentliche Aussage zeigen
// laesst: nicht "4 ist weniger als 42", sondern dass die eine Zahl mit den
// Daten WAECHST und die andere nicht.
//   PROJEKTE=100 npm run messung:dashboard
const PROJEKTE = Number(process.env.PROJEKTE ?? 20);
const AUFGABEN_JE_PROJEKT = 5;

/**
 * `log: [{ emit: 'event', level: 'query' }]` schaltet das an, worum es hier
 * geht: Prisma meldet jede abgesetzte SQL-Anweisung als Ereignis. Ohne diese
 * Zeile bliebe nur die Vermutung, wie viele es sind - und die Vermutung liegt
 * bei einer ORM regelmaessig daneben, weil `include` und `groupBy` nicht das
 * tun, was der Code aussieht.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  }),
  log: [{ emit: 'event', level: 'query' }],
});

let abfragen: string[] = [];

prisma.$on('query', (ereignis) => {
  abfragen.push(ereignis.query);
});

/** Zaehlt die Abfragen EINES Durchlaufs. */
const miss = async <T>(
  name: string,
  arbeit: () => Promise<T>,
): Promise<{ name: string; anzahl: number; dauer: number; ergebnis: T }> => {
  abfragen = [];
  const start = performance.now();
  const ergebnis = await arbeit();
  const dauer = performance.now() - start;

  // BEGIN/COMMIT werden mitgezaehlt, wenn sie auftreten - sie sind echte
  // Anweisungen und kosten einen Umlauf zur Datenbank. Sie herauszurechnen
  // waere Schoenrechnen.
  return { name, anzahl: abfragen.length, dauer, ergebnis };
};

/**
 * ============================================================================
 * FASSUNG 1: DIE NAIVE - SO SCHREIBT MAN ES BEIM ERSTEN MAL
 * ============================================================================
 * Und das ist keine Uebertreibung: Der Code liest sich vollkommen harmlos.
 * "Hole die Projekte, zaehle je Projekt die Aufgaben." Genau so steht es in
 * unzaehligen Anwendungen, und niemand sieht ihm an, dass er mit jedem neuen
 * Projekt eine Abfrage mehr macht.
 *
 * Das ist die Eigenschaft, die N+1 so teuer macht: Sie faellt in der
 * Entwicklung nicht auf. Mit drei Testprojekten sind es vier Abfragen - kein
 * Mensch bemerkt das. Der Kunde mit zweihundert Projekten bemerkt es.
 */
const naiv = async (organizationId: string) => {
  const projekte = await prisma.project.findMany({
    where: { organizationId, archivedAt: null },
    select: { id: true },
  });

  let offen = 0;
  let erledigt = 0;

  // HIER entsteht das N. Eine Abfrage je Projekt - in einer Schleife, die
  // ueberhaupt nicht nach Datenbank aussieht.
  for (const projekt of projekte) {
    offen += await prisma.task.count({
      where: { projectId: projekt.id, status: { not: TaskStatus.DONE } },
    });
    erledigt += await prisma.task.count({
      where: { projectId: projekt.id, status: TaskStatus.DONE },
    });
  }

  const archiviert = await prisma.project.count({
    where: { organizationId, archivedAt: { not: null } },
  });

  return { projekte: projekte.length, archiviert, offen, erledigt };
};

/**
 * ============================================================================
 * FASSUNG 2: GRUPPIEREN STATT ZAEHLEN
 * ============================================================================
 * Die Zahl der Abfragen haengt jetzt NICHT mehr von der Zahl der Projekte ab.
 * Das ist der eigentliche Punkt - nicht "wenige Abfragen", sondern "eine
 * Anzahl, die nicht mit den Daten waechst".
 *
 * Die Arbeit verschwindet dabei nicht, sie WANDERT: Statt der Anwendung
 * zaehlt die Datenbank, und zwar dort, wo die Daten ohnehin liegen. Sie
 * braucht dafuer einen Durchgang durch den Index statt N Umlaeufe ueber das
 * Netzwerk. Der teure Teil an N+1 ist selten die Rechenzeit - es sind die
 * Wartezeiten.
 */
const gruppiert = async (organizationId: string) => {
  const { aktiv, archiviert, nachStatus } = await prisma.$transaction(
    async (tx) => ({
      aktiv: await tx.project.count({
        where: { organizationId, archivedAt: null },
      }),
      archiviert: await tx.project.count({
        where: { organizationId, archivedAt: { not: null } },
      }),
      nachStatus: await tx.task.groupBy({
        by: ['status'],
        where: { project: { organizationId, archivedAt: null } },
        // `orderBy` ist bei `groupBy` PFLICHT, auch wenn die Reihenfolge hier
        // egal ist - das Ergebnis wird ohnehin nachgeschlagen.
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    }),
    // ======================================================================
    // WARUM DIE ISOLATIONSSTUFE HIER STEHT
    // ======================================================================
    // Eine Transaktion allein macht die drei Zahlen NICHT konsistent. Bei der
    // Voreinstellung READ COMMITTED bekommt JEDE Anweisung ihren eigenen
    // Schnappschuss - wird zwischen der zweiten und der dritten eine Aufgabe
    // angelegt, zaehlen sie unterschiedliche Staende. Das Dashboard zeigte
    // dann Zahlen, die zusammen nie gegolten haben.
    //
    // REPEATABLE READ friert den Schnappschuss beim ERSTEN Lesen ein. Alle
    // drei Zahlen beschreiben damit denselben Augenblick.
    //
    // Der Preis ist gering, weil hier nur gelesen wird: Es gibt keine
    // Schreibkonflikte, die einen Serialisierungsfehler ausloesen koennten.
    // Bei einer schreibenden Transaktion waere das eine andere Abwaegung -
    // dort muesste man mit Wiederholungen rechnen.
    { isolationLevel: 'RepeatableRead' },
  );

  const zaehle = (status: TaskStatus) =>
    nachStatus.find((zeile) => zeile.status === status)?._count._all ?? 0;

  return {
    projekte: aktiv,
    archiviert,
    offen: zaehle(TaskStatus.TODO) + zaehle(TaskStatus.IN_PROGRESS),
    erledigt: zaehle(TaskStatus.DONE),
  };
};

const main = async () => {
  const kennung = randomUUID().slice(0, 8);

  const nutzer = await prisma.user.create({
    data: {
      email: `messung-${kennung}@example.com`,
      passwordHash: 'nicht-verwendet',
    },
    select: { id: true },
  });

  const organisation = await prisma.organization.create({
    data: {
      name: `MESSUNG ${kennung}`,
      memberships: { create: { userId: nutzer.id, role: 'OWNER' } },
    },
    select: { id: true },
  });

  for (let p = 0; p < PROJEKTE; p += 1) {
    const projekt = await prisma.project.create({
      data: { organizationId: organisation.id, name: `Projekt ${p}` },
      select: { id: true },
    });

    await prisma.task.createMany({
      data: Array.from({ length: AUFGABEN_JE_PROJEKT }, (_, t) => ({
        projectId: projekt.id,
        title: `Aufgabe ${p}-${t}`,
        position: (t + 1) * 1000,
        status:
          t % 3 === 0
            ? TaskStatus.DONE
            : t % 3 === 1
              ? TaskStatus.IN_PROGRESS
              : TaskStatus.TODO,
      })),
    });
  }

  console.log(
    `\nTestdaten: ${PROJEKTE} Projekte a ${AUFGABEN_JE_PROJEKT} Aufgaben ` +
      `(${PROJEKTE * AUFGABEN_JE_PROJEKT} Aufgaben)\n`,
  );

  // Ein Aufwaermlauf, dessen Ergebnis verworfen wird: Der erste Zugriff zahlt
  // Verbindungsaufbau und Planerstellung mit. Ohne ihn misst man diese
  // Einmalkosten und nennt es Laufzeit.
  await naiv(organisation.id);

  const a = await miss('naiv (Schleife)', () => naiv(organisation.id));
  const b = await miss('gruppiert (groupBy)', () => gruppiert(organisation.id));

  for (const lauf of [a, b]) {
    console.log(
      `${lauf.name.padEnd(22)} ${String(lauf.anzahl).padStart(3)} Abfragen  ` +
        `${lauf.dauer.toFixed(1).padStart(7)} ms`,
    );
  }

  // Die Gegenprobe, ohne die die ganze Messung wertlos waere: Beide Fassungen
  // muessen DASSELBE liefern. Eine schnellere Abfrage, die etwas anderes
  // zaehlt, ist keine Verbesserung, sondern ein Fehler.
  const gleich =
    JSON.stringify(a.ergebnis) === JSON.stringify(b.ergebnis)
      ? 'identisch'
      : `UNTERSCHIEDLICH: ${JSON.stringify(a.ergebnis)} vs ${JSON.stringify(b.ergebnis)}`;

  console.log(`\nErgebnisse: ${gleich}`);
  console.log(`Werte:      ${JSON.stringify(b.ergebnis)}\n`);

  await prisma.organization.deleteMany({ where: { id: organisation.id } });
  await prisma.user.deleteMany({ where: { id: nutzer.id } });
  await prisma.$disconnect();
};

main().catch(async (fehler) => {
  console.error(fehler);
  await prisma.$disconnect();
  process.exit(1);
});
