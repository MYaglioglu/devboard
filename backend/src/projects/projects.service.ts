import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

/**
 * Ein Projekt, wie es die API nach aussen gibt.
 *
 * Bewusst NICHT der Prisma-Typ `Project`: Der enthaelt `organizationId`, und
 * die gehoert nicht in die Antwort. Der Client kennt die Organisation bereits
 * - sie steht in dem Pfad, den er selbst aufgerufen hat. Sie noch einmal
 * mitzugeben, waere doppelte Wahrheit im JSON.
 *
 * Wichtiger noch: Ein eigener Typ zwingt dazu, jedes neue Feld ausdruecklich
 * freizugeben. Gaeben wir den Prisma-Typ direkt heraus, landete jede kuenftige
 * Spalte automatisch in der Antwort - auch eine, die niemand sehen soll.
 */
export interface Projekt {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Die Felder, die nach aussen gehen - an EINER Stelle.
 *
 * Ohne diese Konstante stuende dieselbe Liste in vier Methoden, und die
 * fuenfte vergaesse sie. `select` statt gar nichts ist hier Absicht: Ohne
 * `select` liefert Prisma ALLE Spalten, also auch `organizationId`.
 */
const PROJEKT_FELDER = {
  id: true,
  name: true,
  description: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Prisma meldet "Zeile zum Aendern nicht gefunden" mit dem Code P2025.
 *
 * Warum eine eigene Pruefung und kein `catch (error: any)`: `any` waere im
 * Produktivcode wie im Test der Anfang jedes stillen Fehlers - der Zugriff
 * `error.code` wuerde auch dann durchgehen, wenn es das Feld gar nicht gibt.
 * Der `instanceof`-Test gibt uns stattdessen einen typisierten Fehler.
 */
const istZeileNichtGefunden = (fehler: unknown): boolean =>
  fehler instanceof Prisma.PrismaClientKnownRequestError &&
  fehler.code === 'P2025';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Legt ein Projekt in einer Organisation an.
   *
   * Die `organizationId` stammt aus der vom Guard geprueften Mitgliedschaft,
   * nicht aus dem Request-Koerper - siehe create-project.dto.ts.
   */
  async erstelle(
    organizationId: string,
    daten: CreateProjectDto,
  ): Promise<Projekt> {
    return this.prisma.project.create({
      data: {
        organizationId,
        name: daten.name,
        description: daten.description,
      },
      select: PROJEKT_FELDER,
    });
  }

  /**
   * Alle Projekte einer Organisation.
   *
   * ==========================================================================
   * ARCHIVIERTE PROJEKTE SIND STANDARDMAESSIG NICHT DABEI
   * ==========================================================================
   * `archivedAt: null` ist der Normalfall - wer eine Projektliste oeffnet,
   * will die laufenden Projekte sehen. Der Verlauf ist ueber
   * `?includeArchived=true` erreichbar.
   *
   * Wichtig ist die Richtung der Voreinstellung: Das UNGEFILTERTE Ergebnis
   * waere die bequemere Vorgabe, aber dann muesste jeder Aufrufer daran
   * denken, den Filter zu setzen - und der erste, der es vergisst, zeigt
   * archivierte Projekte an, ohne dass jemand einen Fehler sieht.
   */
  async findeAlle(
    organizationId: string,
    auchArchivierte: boolean,
  ): Promise<Projekt[]> {
    return this.prisma.project.findMany({
      where: {
        organizationId,
        ...(auchArchivierte ? {} : { archivedAt: null }),
      },
      // Neueste zuerst. `createdAt` und nicht `name`, weil eine Projektliste
      // chronologisch gelesen wird - das zuletzt angelegte Projekt ist fast
      // immer das, mit dem gerade gearbeitet wird.
      orderBy: { createdAt: 'desc' },
      select: PROJEKT_FELDER,
    });
  }

  /**
   * Ein einzelnes Projekt.
   *
   * ==========================================================================
   * DIE WICHTIGSTE ZEILE DIESES SERVICES: findFirst STATT findUnique
   * ==========================================================================
   * Naheliegend waere `findUnique({ where: { id } })` und danach ein
   * Vergleich `if (projekt.organizationId !== organizationId) throw`.
   *
   * Das ist genau der Fehler, den Sprint 2 protokolliert hat: Die Daten sind
   * dann bereits GELESEN. Solange nur verglichen wird, faellt es nicht auf -
   * bis jemand die Reihenfolge aendert, den Vergleich in einen frueheren
   * Rueckgabepfad verschiebt oder aus Bequemlichkeit loggt, was er geladen hat.
   *
   * Hier steht der Mandant deshalb IN der Bedingung. `findFirst` statt
   * `findUnique`, weil `findUnique` nur eindeutige Spalten zulaesst und
   * `organizationId` keine ist. Die Abfrage lautet also: "das Projekt mit
   * dieser ID, SOFERN es zu dieser Organisation gehoert" - und nicht "das
   * Projekt mit dieser ID, und dann sehen wir weiter".
   *
   * 404 statt 403: Ein fremdes Projekt existiert fuer diesen Nutzer nicht.
   * Ein 403 wuerde bestaetigen, dass es die ID gibt - dieselbe Ueberlegung wie
   * beim MitgliedschaftsGuard.
   */
  async findeEines(
    organizationId: string,
    projektId: string,
  ): Promise<Projekt> {
    const projekt = await this.prisma.project.findFirst({
      where: { id: projektId, organizationId },
      select: PROJEKT_FELDER,
    });

    if (!projekt) {
      throw new NotFoundException('Projekt nicht gefunden');
    }

    return projekt;
  }

  /**
   * Aendert Name und/oder Beschreibung.
   *
   * ==========================================================================
   * DER MANDANT STEHT AUCH BEIM SCHREIBEN IM WHERE
   * ==========================================================================
   * `update` verlangt normalerweise eine eindeutige Bedingung. Prisma erlaubt
   * daneben zusaetzliche Filter - genau dafuer ist das hier gedacht:
   *
   *     where: { id, organizationId }
   *
   * Passt der Mandant nicht, aendert die Abfrage NICHTS und Prisma meldet
   * P2025. Ein vorheriges Laden mit anschliessender Pruefung waere die
   * Alternative - und haette zwischen Lesen und Schreiben eine Luecke, in der
   * das Projekt verschoben oder geloescht werden kann.
   *
   * `daten` wird unveraendert weitergereicht: Ein fehlendes Feld ist
   * `undefined` und laesst die Spalte in Ruhe, ein ausdrueckliches `null`
   * schreibt NULL. Wer hier "aufraeumt" und `null` zu `undefined` macht,
   * nimmt dem Client die Moeglichkeit, eine Beschreibung wieder zu entfernen.
   */
  async aendere(
    organizationId: string,
    projektId: string,
    daten: UpdateProjectDto,
  ): Promise<Projekt> {
    try {
      return await this.prisma.project.update({
        where: { id: projektId, organizationId },
        data: daten,
        select: PROJEKT_FELDER,
      });
    } catch (fehler) {
      if (istZeileNichtGefunden(fehler)) {
        throw new NotFoundException('Projekt nicht gefunden');
      }
      throw fehler;
    }
  }

  /**
   * Archiviert ein Projekt - der Endpoint heisst DELETE, geloescht wird nichts.
   *
   * ==========================================================================
   * WARUM ZWEI ABFRAGEN UND NICHT EINE
   * ==========================================================================
   * `updateMany` liefert die Anzahl geaenderter Zeilen. Bei 0 gibt es genau
   * zwei moegliche Ursachen, die sich fachlich UNTERSCHEIDEN:
   *
   *   1. Das Projekt existiert (in dieser Organisation) nicht  -> 404
   *   2. Es war bereits archiviert                             -> nichts zu tun
   *
   * Fall 2 als Fehler zu melden waere falsch: Ein zweites DELETE auf dasselbe
   * Projekt soll denselben Zustand hinterlassen wie das erste. Genau das
   * bedeutet IDEMPOTENZ - und ohne sie wird jeder Doppelklick und jeder
   * automatische Wiederholungsversuch zu einer Fehlermeldung.
   *
   * Deshalb die zweite Abfrage: Sie unterscheidet "gibt es nicht" von "war
   * schon". Sie laeuft nur im Ausnahmefall, nicht im Normalbetrieb.
   */
  async archiviere(organizationId: string, projektId: string): Promise<void> {
    const ergebnis = await this.prisma.project.updateMany({
      where: { id: projektId, organizationId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    if (ergebnis.count > 0) {
      return;
    }

    const existiert = await this.prisma.project.findFirst({
      where: { id: projektId, organizationId },
      select: { id: true },
    });

    if (!existiert) {
      throw new NotFoundException('Projekt nicht gefunden');
    }
  }
}
