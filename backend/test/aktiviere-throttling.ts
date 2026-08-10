/**
 * Schaltet das Rate Limiting fuer eine einzelne Testdatei ein.
 *
 * ============================================================================
 * WARUM EINE EIGENE DATEI NUR FUER EINE ZUWEISUNG?
 * ============================================================================
 * `ConfigModule.forRoot()` steht als Argument im @Module-Decorator und wird
 * damit ausgewertet, sobald `app.module.ts` IMPORTIERT wird - lange bevor
 * `beforeAll` laeuft. Eine Zuweisung an process.env in `beforeAll` kommt also
 * grundsaetzlich zu spaet.
 *
 * Import-Anweisungen werden dagegen in ihrer Reihenfolge ausgefuehrt. Wird
 * diese Datei VOR dem AppModule importiert, steht der Wert rechtzeitig:
 *
 *     import './aktiviere-throttling';        // zuerst
 *     import { AppModule } from '../src/app.module';
 *
 * Der Normalfall im Testlauf ist THROTTLE_LIMIT=0 (im npm-Skript gesetzt) -
 * sonst wuerden sich die Auth-Tests mit ihren dutzenden Anmeldungen selbst
 * aussperren. Nur die Haertungs-Tests brauchen es aktiv.
 *
 * `overrideGuard` waere der naheliegende Weg gewesen, funktioniert bei ueber
 * APP_GUARD registrierten Guards aber nicht: Sie haengen am Token APP_GUARD,
 * nicht an ihrer eigenen Klasse.
 */
process.env.THROTTLE_LIMIT = '1000';
