/**
 * Prueft ein Weiterleitungsziel aus der Adresszeile.
 *
 * ============================================================================
 * WOZU DAS UEBERHAUPT
 * ============================================================================
 * Wer einen Einladungslink oeffnet, ist meist nicht angemeldet. Die
 * Anmeldeseite muss sich deshalb merken, wohin es danach zurueckgehen soll:
 *
 *     /login?weiter=/einladung%3Ftoken%3D9Xk2
 *
 * Nach erfolgreicher Anmeldung wird dorthin weitergeleitet.
 *
 * ============================================================================
 * WARUM DAS OHNE PRUEFUNG EINE LUECKE WAERE - OPEN REDIRECT
 * ============================================================================
 * Der naive Weg ist `router.replace(weiter)`. Damit bestimmt der Absender des
 * Links, wohin der Nutzer nach der Anmeldung geschickt wird:
 *
 *     /login?weiter=https://devb0ard-anmeldung.example/login
 *
 * Der Nutzer sieht eine ECHTE DevBoard-Adresse, meldet sich an - und landet
 * auf einer nachgebauten Seite, die ihn erneut nach seinen Zugangsdaten
 * fragt. Weil er den Anmeldevorgang gerade selbst begonnen hat, wirkt das
 * plausibel.
 *
 * Das ist eine OPEN-REDIRECT-Luecke. Sie stiehlt selbst nichts, aber sie
 * verleiht einer Phishing-Seite die Glaubwuerdigkeit der echten Domain -
 * und genau die ist das, was Nutzer pruefen sollen.
 *
 * ============================================================================
 * WARUM NUR RELATIVE PFADE ERLAUBT SIND
 * ============================================================================
 * Die Regel lautet: Der Wert muss mit genau EINEM Schraegstrich beginnen.
 *
 * Was damit abgewiesen wird:
 *
 *   https://boese.example   absolute Adresse
 *   //boese.example         PROTOKOLLRELATIV - der Browser ergaenzt "https:"
 *                           und landet auf einem fremden Host. Der Klassiker,
 *                           den eine Pruefung auf "beginnt mit /" durchlaesst.
 *   /\boese.example         manche Browser behandeln \ wie /
 *   javascript:...          Skript statt Adresse
 *
 * Eine Positivliste ("beginnt mit einem Schraegstrich, aber nicht mit zwei")
 * ist hier sicherer als eine Sperrliste: Wer verbotene Muster aufzaehlt,
 * vergisst eines.
 */
export function sichererPfad(
  weiter: string | null | undefined,
  ersatz: string,
): string {
  if (!weiter) return ersatz;

  // Genau ein fuehrender Schraegstrich, danach kein weiterer und kein
  // Backslash. Damit bleibt nur ein Pfad innerhalb der eigenen Anwendung.
  if (!/^\/(?![/\\])/.test(weiter)) return ersatz;

  return weiter;
}
