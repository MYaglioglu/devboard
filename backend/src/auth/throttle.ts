/**
 * Strengere Grenzen fuer Anmelden und Registrieren.
 *
 * ============================================================================
 * WARUM FEST IM CODE UND NICHT IN DER KONFIGURATION?
 * ============================================================================
 * Decorators werden beim LADEN der Datei ausgewertet - zu einem Zeitpunkt, an
 * dem das ConfigModule die .env noch gar nicht gelesen hat. Ein Wert aus der
 * Konfiguration waere hier schlicht `undefined`.
 *
 * Inhaltlich ist das auch richtig so: Das ist eine Sicherheitsentscheidung,
 * keine Betriebseinstellung. Wer sie pro Umgebung lockern kann, lockert sie
 * irgendwann versehentlich in Produktion.
 *
 * Das GLOBALE Rate Limiting bleibt konfigurierbar (THROTTLE_LIMIT), weil es
 * von der erwarteten Last abhaengt - und weil Testlaeufe es abschalten
 * koennen muessen, um sich nicht selbst auszusperren.
 */
export const ANMELDE_GRENZE = {
  /** Versuche pro Zeitfenster und IP-Adresse. */
  limit: 5,
  /** Zeitfenster in Millisekunden. */
  ttl: 60_000,
} as const;
