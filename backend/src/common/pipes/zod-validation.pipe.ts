import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validiert eingehende Daten gegen ein Zod-Schema.
 *
 * ============================================================================
 * WAS IST EINE PIPE?
 * ============================================================================
 * Eine Pipe laeuft in NestJS ZWISCHEN dem eingehenden Request und dem
 * Controller. Sie kann Daten pruefen (validieren) und umformen
 * (transformieren). Erst wenn sie durchlaeuft, sieht der Controller die Daten.
 *
 * In Spring Boot entspricht das einem Argument Resolver bzw. der Validierung
 * per @Valid.
 *
 * Der Gewinn: Der Controller bekommt garantiert gueltige, korrekt typisierte
 * Daten. Er muss selbst nichts pruefen - "validiere am Rand, vertraue innen".
 *
 * ============================================================================
 * WARUM ZOD UND NICHT CLASS-VALIDATOR?
 * ============================================================================
 * NestJS bringt ueblicherweise class-validator mit (Decorators an DTO-Klassen).
 * Wir nehmen Zod, weil:
 *
 *   1. das Frontend Zod ohnehin nutzt (React Hook Form) - dieselbe
 *      Denkweise auf beiden Seiten, spaeter sogar teilbare Schemata;
 *   2. Zod den TypeScript-Typ aus dem Schema ABLEITET. Bei class-validator
 *      pflegt man Typ und Validierung getrennt und sie koennen auseinander
 *      laufen;
 *   3. Zod-Schemata Werte auch umformen koennen (hier: E-Mail trimmen und
 *      kleinschreiben) - Validierung und Normalisierung an einer Stelle.
 *
 * Nachteil, den man kennen sollte: Die automatische Swagger-Erzeugung von
 * NestJS ist auf class-validator zugeschnitten. Fuer OpenAPI braeuchte es
 * spaeter ein Zusatzpaket.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  // Die Signatur von PipeTransform kennt zusaetzlich `metadata` (Angaben zu
  // Ziel und Typ des Parameters). TypeScript erlaubt, unbenutzte Parameter
  // wegzulassen - wir brauchen die Angaben hier nicht.
  transform(wert: unknown): T {
    const ergebnis = this.schema.safeParse(wert);

    if (!ergebnis.success) {
      // Rueckgabe als Feld-zu-Meldung-Zuordnung, damit das Frontend die
      // Fehler direkt an den passenden Eingabefeldern anzeigen kann.
      const fehler: Record<string, string[]> = {};

      for (const problem of ergebnis.error.issues) {
        const feld = problem.path.join('.') || '_';
        (fehler[feld] ??= []).push(problem.message);
      }

      // 400 Bad Request: Die Anfrage war syntaktisch in Ordnung, aber
      // inhaltlich unbrauchbar. Kein 422 - NestJS und die meisten
      // REST-Konventionen im Node-Umfeld nutzen dafuer 400.
      throw new BadRequestException({
        message: 'Validierung fehlgeschlagen',
        errors: fehler,
      });
    }

    return ergebnis.data;
  }
}
