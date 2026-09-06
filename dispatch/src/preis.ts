/**
 * Berechnung des Festpreises.
 *
 * Bewusst ohne Netz und ohne Datenbank, damit sich jede Zahl testen laesst
 * (siehe test/preis.test.ts). Ein angezeigter Festpreis ist rechtlich
 * bindend - hier darf nichts schaetzen.
 *
 * Die Rechnung laeuft NUR auf dem Server. Ein im Browser berechneter Preis
 * liesse sich manipulieren.
 */

export interface Tarif {
  /** Fester Betrag je Fahrt, unabhaengig von der Strecke */
  grundpreis: number;
  /** Bis zu dieser Kilometerzahl gilt der Nahpreis */
  kmGrenze: number;
  /** Preis je Kilometer innerhalb der Grenze */
  preisNah: number;
  /** Preis je Kilometer oberhalb der Grenze */
  preisFern: number;
  /** Darunter wird nicht abgerechnet */
  mindestpreis: number;
  /** Auf dieses Vielfache wird aufgerundet, z. B. 0.5 */
  rundung: number;
}

export const STANDARD_TARIF: Tarif = {
  grundpreis: 3.5,
  kmGrenze: 4,
  preisNah: 2.6,
  preisFern: 2.2,
  mindestpreis: 12,
  rundung: 0.5,
};

/**
 * Ermittelt den Festpreis fuer eine Strecke.
 *
 * Aufgerundet wird immer, nie ab: Der Betrag ist verbindlich, und ein paar
 * Cent Puffer sind besser als ein Preis, der die Kosten nicht deckt.
 */
export function preisBerechnen(streckeKm: number, tarif: Tarif): number {
  if (!Number.isFinite(streckeKm) || streckeKm < 0) {
    throw new Error('Die Strecke muss eine Zahl ab 0 sein.');
  }

  const nah = Math.min(streckeKm, tarif.kmGrenze);
  const fern = Math.max(0, streckeKm - tarif.kmGrenze);

  const roh = tarif.grundpreis + nah * tarif.preisNah + fern * tarif.preisFern;

  const gerundet =
    tarif.rundung > 0
      ? Math.ceil(roh / tarif.rundung - 1e-9) * tarif.rundung
      : roh;

  // Auf zwei Nachkommastellen bringen, sonst schleppt sich 53.50000000001 mit
  return Math.round(Math.max(gerundet, tarif.mindestpreis) * 100) / 100;
}

/**
 * Vergleichspreis nach dem Stuttgarter Taxitarif.
 *
 * Nur zur Einordnung fuer den Betreiber gedacht - damit er im Fahrerbereich
 * sieht, wie seine Preise zum Taxi stehen. Wird Kunden NICHT angezeigt:
 * Als Mietwagenunternehmen darf man sich nicht mit dem Taxi vergleichen,
 * ohne den Unterschied deutlich zu machen.
 */
export function taxiVergleich(streckeKm: number): number {
  const grundpreis = 4.2;
  const nah = Math.min(streckeKm, 4) * 3.0;
  const fern = Math.max(0, streckeKm - 4) * 2.5;
  return Math.round((grundpreis + nah + fern) * 100) / 100;
}

/** Liest den Tarif aus den Einstellungen, mit Rueckfall auf die Standardwerte. */
export function tarifAusEinstellungen(werte: Record<string, string>): Tarif {
  const zahl = (schluessel: string, standard: number): number => {
    const wert = Number(werte[schluessel]);
    return Number.isFinite(wert) && wert >= 0 ? wert : standard;
  };

  return {
    grundpreis: zahl('tarif_grundpreis', STANDARD_TARIF.grundpreis),
    kmGrenze: zahl('tarif_km_grenze', STANDARD_TARIF.kmGrenze),
    preisNah: zahl('tarif_preis_nah', STANDARD_TARIF.preisNah),
    preisFern: zahl('tarif_preis_fern', STANDARD_TARIF.preisFern),
    mindestpreis: zahl('tarif_mindestpreis', STANDARD_TARIF.mindestpreis),
    rundung: zahl('tarif_rundung', STANDARD_TARIF.rundung),
  };
}
