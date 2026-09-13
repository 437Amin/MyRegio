/**
 * Rechnungen fuer Fahrten - die reinen Regeln.
 *
 * Ohne Datenbank und ohne Netz, damit sich Betraege, Nummern und
 * Pflichtangaben testen lassen (siehe test/rechnung.test.ts).
 *
 * Gerechnet wird durchgehend in Cent. Mit Kommazahlen ergaeben Netto und
 * Steuer zusammen gelegentlich einen Cent mehr oder weniger als der Endpreis.
 */

/**
 * Umsatzsteuersatz auf allen Rechnungen.
 *
 * Der ermaessigte Satz von 7 % nach § 12 Abs. 2 Nr. 10 UStG nennt Taxen, nicht
 * Mietwagen. Entscheidung des Auftraggebers: 19 %.
 */
export const STEUERSATZ = 19;

/**
 * Bis zu diesem Endpreis genuegt eine Kleinbetragsrechnung (§ 33 UStDV) -
 * ohne Name und Anschrift des Fahrgasts. Darueber sind beide Pflicht.
 */
export const KLEINBETRAG_CENT = 250_00;

/** Schuetzt vor Tippfehlern wie 4650 statt 46,50. */
export const HOECHSTBETRAG_CENT = 10_000_00;

export type Zahlungsart = 'bar' | 'karte' | 'ueberweisung';

export const ZAHLUNGSARTEN: Record<Zahlungsart, string> = {
  bar: 'Bar bezahlt',
  karte: 'Mit Karte bezahlt',
  ueberweisung: 'Per Überweisung',
};

/** Eine gespeicherte Rechnung, so wie sie in der Datenbank steht. */
export interface Rechnung {
  id: number;
  jahr: number;
  laufnummer: number;
  rechnungsdatum: string;
  fahrtdatum: string;
  von: string;
  nach: string;
  kunde_name: string;
  kunde_anschrift: string;
  zahlungsart: Zahlungsart;
  brutto_cent: number;
  netto_cent: number;
  steuer_cent: number;
  steuersatz: number;
  /** Firmendaten zum Zeitpunkt der Ausstellung, als JSON */
  absender: string;
  storno_von: number | null;
}

/* ================================================================ Betraege */

/**
 * Liest einen eingetippten Betrag und liefert ihn in Cent.
 *
 * Versteht "46,50", "46.50", "46", "1.234,50" und "46,50 €". Liefert null,
 * wenn sich die Eingabe nicht eindeutig lesen laesst - geraten wird nicht.
 */
export function betragLesen(eingabe: string): number | null {
  let text = eingabe.replace(/\s|€|EUR/gi, '');

  if (text.includes(',')) {
    // Deutsche Schreibweise: Punkte trennen nur Tausender
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(text)) return null;
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "1.500" heisst in Deutschland tausendfuenfhundert, nicht eins fuenfzig
    text = text.replace(/\./g, '');
  } else if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const cent = Math.round(Number(text) * 100);
  return Number.isFinite(cent) && cent > 0 ? cent : null;
}

/**
 * Rechnet die Steuer aus dem Endpreis heraus.
 *
 * Die Steuer wird gerundet, das Netto ist der Rest. So ergeben beide
 * zusammen immer genau den Betrag, den der Fahrgast bezahlt hat.
 */
export function betragAufteilen(
  bruttoCent: number,
  steuersatz = STEUERSATZ,
): { bruttoCent: number; nettoCent: number; steuerCent: number } {
  const steuerCent = Math.round((bruttoCent * steuersatz) / (100 + steuersatz));
  return { bruttoCent, nettoCent: bruttoCent - steuerCent, steuerCent };
}

export function euro(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(cent / 100)
    // Das geschuetzte Leerzeichen vor dem € kann die PDF-Schrift nicht immer
    .replace(/ /g, ' ');
}

/** Betrag fuer ein Eingabefeld: 4650 -> "46,50" */
export function betragFuerEingabe(cent: number): string {
  return (cent / 100).toFixed(2).replace('.', ',');
}

/* ========================================================= Nummer & Datum */

/** 2026, 7 -> "2026-0007". Jedes Jahr beginnt wieder bei 1. */
export function rechnungsnummer(jahr: number, laufnummer: number): string {
  return `${jahr}-${String(laufnummer).padStart(4, '0')}`;
}

/**
 * Das heutige Datum in DEUTSCHER Ortszeit als JJJJ-MM-TT.
 *
 * Cloudflare laeuft in UTC. Am 1. Januar um 0:30 ist dort noch der
 * 31. Dezember - die Rechnung bekaeme sonst die Nummer des Vorjahres.
 */
export function heuteInDeutschland(jetzt: Date): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(jetzt);
  const teil = (art: string) => teile.find((t) => t.type === art)?.value ?? '';
  return `${teil('year')}-${teil('month')}-${teil('day')}`;
}

/** "2026-09-13" -> "13.09.2026" */
export function datumDeutsch(iso: string): string {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}

function gueltigesDatum(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const datum = new Date(`${iso}T00:00:00Z`);
  // Faengt auch den 31.02. ab, den Date stillschweigend zum 03.03. macht
  return !Number.isNaN(datum.getTime()) && datum.toISOString().startsWith(iso);
}

/* ========================================================= Pflichtangaben */

export interface RechnungsEingabe {
  von: string;
  nach: string;
  betrag: string;
  fahrtdatum: string;
  kundeName: string;
  kundeAnschrift: string;
  zahlungsart: string;
}

export interface GepruefteRechnung {
  von: string;
  nach: string;
  fahrtdatum: string;
  kundeName: string;
  kundeAnschrift: string;
  zahlungsart: Zahlungsart;
  bruttoCent: number;
  nettoCent: number;
  steuerCent: number;
  steuersatz: number;
}

/**
 * Prueft eine Eingabe aus dem Formular.
 *
 * Liefert entweder die fertige Rechnung oder alle Fehler auf einmal - damit
 * nicht jeder Fehler einzeln nach dem Absenden auffaellt.
 */
export function rechnungPruefen(
  e: RechnungsEingabe,
  heute: string,
): { rechnung: GepruefteRechnung } | { fehler: string[] } {
  const fehler: string[] = [];
  const von = e.von.trim().slice(0, 200);
  const nach = e.nach.trim().slice(0, 200);
  const kundeName = e.kundeName.trim().slice(0, 120);
  const kundeAnschrift = e.kundeAnschrift.trim().slice(0, 300);
  const fahrtdatum = e.fahrtdatum.trim();

  if (!von) fehler.push('Bitte die Start-Adresse eintragen.');
  if (!nach) fehler.push('Bitte die Ziel-Adresse eintragen.');

  const bruttoCent = betragLesen(e.betrag);
  if (bruttoCent === null) {
    fehler.push('Bitte den Preis als Zahl eintragen, zum Beispiel 46,50.');
  } else if (bruttoCent > HOECHSTBETRAG_CENT) {
    fehler.push(`Der Preis ist höher als ${euro(HOECHSTBETRAG_CENT)} – bitte prüfen.`);
  } else if (bruttoCent > KLEINBETRAG_CENT && (!kundeName || !kundeAnschrift)) {
    fehler.push(
      `Über ${euro(KLEINBETRAG_CENT)} müssen Name und Anschrift des Fahrgasts auf der Rechnung stehen.`,
    );
  }

  // Grobe Grenzen gegen Tippfehler wie 2062 statt 2026
  const heuteJahr = Number(heute.slice(0, 4));
  if (
    !gueltigesDatum(fahrtdatum) ||
    Number(fahrtdatum.slice(0, 4)) < 2020 ||
    Number(fahrtdatum.slice(0, 4)) > heuteJahr + 1
  ) {
    fehler.push('Bitte das Datum der Fahrt eintragen.');
  }

  // Nicht mit "in": Das ließe auch "toString" als Zahlungsart durch
  if (!Object.hasOwn(ZAHLUNGSARTEN, e.zahlungsart)) {
    fehler.push('Bitte die Zahlungsart auswählen.');
  }

  if (fehler.length > 0 || bruttoCent === null) return { fehler };

  return {
    rechnung: {
      von,
      nach,
      fahrtdatum,
      kundeName,
      kundeAnschrift,
      zahlungsart: e.zahlungsart as Zahlungsart,
      ...betragAufteilen(bruttoCent),
      steuersatz: STEUERSATZ,
    },
  };
}

/* ================================================================ Absender */

export interface Absender {
  marke: string;
  firma: string;
  strasse: string;
  ort: string;
  telefon: string;
  email: string;
  /** USt-IdNr. oder Steuernummer - eins von beiden ist Pflicht */
  steuernummer: string;
  iban: string;
  bank: string;
}

/**
 * Stand aus content/einstellungen.yaml. Im Fahrerbereich aenderbar, damit
 * Oender zum Beispiel seine Bankverbindung selbst eintragen kann.
 */
export const STANDARD_ABSENDER: Absender = {
  marke: 'MyRegioCar',
  firma: 'Önder Sarak Mietwagenunternehmen',
  strasse: 'Steiermärker Str. 3-5',
  ort: '70469 Stuttgart',
  telefon: '+49 173 3480810',
  email: 'contact@myregiocar.com',
  steuernummer: 'DE285112009',
  iban: '',
  bank: '',
};

/** Ohne diese Angaben waere keine Rechnung gueltig - sie lassen sich nicht leeren. */
export const PFLICHT_ABSENDER: (keyof Absender)[] = ['firma', 'strasse', 'ort', 'steuernummer'];

export function absenderAusEinstellungen(werte: Record<string, string>): Absender {
  const absender = { ...STANDARD_ABSENDER };
  for (const feld of Object.keys(absender) as (keyof Absender)[]) {
    const wert = werte[`rechnung_${feld}`];
    if (wert === undefined) continue;
    if (!wert.trim() && PFLICHT_ABSENDER.includes(feld)) continue;
    absender[feld] = wert.trim();
  }
  return absender;
}

/**
 * Prueft eine IBAN ueber ihre Pruefziffer und liefert sie in Viererbloecken.
 *
 * Ein Zahlendreher stuende sonst auf jeder Rechnung, und Ueberweisungen
 * kaemen zurueck. Leer ist erlaubt (dann keine Bankverbindung): "".
 */
export function ibanPruefen(eingabe: string): string | null {
  const iban = eingabe.replace(/\s/g, '').toUpperCase();
  if (!iban) return '';
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  if (iban.startsWith('DE') && iban.length !== 22) return null;

  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    // A = 10, B = 11, ... - Stueck fuer Stueck, die Zahl waere zu gross
    const wert = /\d/.test(zeichen) ? zeichen : String(zeichen.charCodeAt(0) - 55);
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1 ? iban.replace(/(.{4})/g, '$1 ').trim() : null;
}

/** "DE285112009" ist eine USt-IdNr., "99/123/45678" eine Steuernummer. */
export function steuernummerBeschriftung(nummer: string): string {
  return /^[A-Z]{2}\s*\d/i.test(nummer) ? 'USt-IdNr.' : 'Steuernummer';
}
