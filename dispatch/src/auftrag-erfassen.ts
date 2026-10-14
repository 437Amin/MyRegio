import { HOECHSTBETRAG_CENT, betragLesen } from './rechnung';
import { berlinNachIso, zeitpunktDeutsch } from './zeit';

/**
 * Prueft, was am Telefon aufgenommen wurde.
 *
 * Rein, ohne Datenbank und ohne Netz - damit jede Regel einzeln testbar ist
 * (siehe test/auftrag-erfassen.test.ts). Der Preis wird hier NICHT gerechnet:
 * Das bleibt beim Server, sonst waere er aus dem Browser beeinflussbar.
 */

/**
 * Wie der Auftrag hereinkam. Pflichtangabe - sie ist der Nachweis des
 * Auftragseingangs am Betriebssitz nach § 49 PBefG.
 */
export const KANAELE: Record<string, string> = {
  telefon: 'Telefon',
  whatsapp: 'WhatsApp',
  persoenlich: 'Persönlich',
};

/** Dieselben Anlaesse wie im Buchungsassistenten auf der Website. */
export const ANLAESSE: string[] = [
  'Flughafentransfer',
  'Stadt- oder Überlandfahrt',
  'Krankenfahrt',
  'Geschäftsfahrt',
  'Kurierfahrt',
  'Park & Fly',
];

/** So weit darf rueckwirkend erfasst werden. */
export const RUECKWIRKEND_TAGE = 30;

export interface ErfassungsEingabe {
  kanal: string;
  art: string;
  abholung: string;
  ziel: string;
  /** Wurden beide Adressen aus der Vorschlagsliste gewaehlt? */
  vonGewaehlt: boolean;
  nachGewaehlt: boolean;
  wann: string;
  datum: string;
  zeit: string;
  name: string;
  telefon: string;
  /** Moechte der Fahrgast eine Rechnung per E-Mail? */
  rechnungGewuenscht: boolean;
  /** Freiwillig. Mit der Angabe stimmt er der Nachricht nach der Fahrt zu. */
  email: string;
  personen: string;
  anmerkung: string;
  preis: string;
  preisAbweichend: boolean;
  eingangDatum: string;
  eingangZeit: string;
}

export interface GepruefterAuftrag {
  kanal: string;
  art: string;
  abholung: string;
  ziel: string;
  sofort: number;
  wunschIso: string;
  wunschzeit: string;
  personen: number;
  anmerkung: string;
  kundeName: string;
  kundeTelefon: string;
  /** 1, wenn eine Rechnung per E-Mail gewuenscht ist */
  rechnungGewuenscht: number;
  /** 1, wenn eine Nachricht nach der Fahrt gewuenscht ist */
  bewertungGewuenscht: number;
  /** Leer, wenn nichts davon gewuenscht ist - dann wird nichts gespeichert */
  kundeEmail: string;
  eingangIso: string;
  /**
   * true: Der Server rechnet den Festpreis aus den gewaehlten Punkten.
   * false: Es gilt der von Hand eingetragene Betrag.
   */
  preisBerechnen: boolean;
  /** Von Hand eingetragener Betrag in Cent, sonst null */
  preisCent: number | null;
}

export type Erfassungsergebnis =
  | { fehler: string[] }
  | { auftrag: GepruefterAuftrag };

/** Mindestens 7, hoechstens 15 Ziffern - so sieht jede echte Rufnummer aus. */
export function plausibleTelefonnummer(wert: string): boolean {
  const ziffern = String(wert).replace(/[^0-9]/g, '');
  return ziffern.length >= 7 && ziffern.length <= 15;
}

/**
 * Prueft eine E-Mail-Adresse so streng wie noetig und so locker wie moeglich.
 *
 * Streng genug fuer die Tippfehler, an denen eine Rechnung wirklich scheitert:
 * fehlendes @, Leerzeichen, abgeschnittene Endung ("gmail.c"), doppelter
 * Punkt. Locker genug, um keine echte Adresse abzuweisen - Pluszeichen, lange
 * Endungen und Umlautdomains sind erlaubt.
 *
 * Bewusst nicht strenger: Wer eine gueltige Adresse hat und sie nicht
 * eintragen darf, bekommt gar keine Rechnung. Das waere der schlimmere
 * Fehler als eine Mail, die zurueckkommt.
 */
export function plausibleEmail(wert: string): boolean {
  const text = String(wert).trim();
  if (text.length < 6 || text.length > 254) return false;
  if (/\s/.test(text)) return false;

  const teile = text.split('@');
  if (teile.length !== 2) return false;

  const [davor, danach] = teile;
  if (!davor || davor.length > 64) return false;
  if (!danach || danach.includes('..')) return false;
  if (danach.startsWith('.') || danach.endsWith('.')) return false;

  // Es muss eine Endung geben, und sie braucht mindestens zwei Zeichen
  const punkt = danach.lastIndexOf('.');
  return punkt >= 1 && danach.length - punkt - 1 >= 2;
}

function kurz(wert: string, laenge = 500): string {
  return wert.trim().slice(0, laenge);
}

export function erfassungPruefen(
  eingabe: ErfassungsEingabe,
  jetzt: Date,
): Erfassungsergebnis {
  const fehler: string[] = [];

  if (!KANAELE[eingabe.kanal]) {
    fehler.push('Bitte angeben, wie der Auftrag hereinkam – Telefon, WhatsApp oder persönlich.');
  }

  const abholung = kurz(eingabe.abholung);
  if (!abholung) fehler.push('Die Abholadresse fehlt.');

  const name = kurz(eingabe.name, 120);
  if (!name) fehler.push('Der Name des Fahrgasts fehlt.');

  const telefon = kurz(eingabe.telefon, 40);
  if (!telefon) {
    fehler.push('Die Telefonnummer des Fahrgasts fehlt.');
  } else if (!plausibleTelefonnummer(telefon)) {
    fehler.push('Die Telefonnummer sieht nicht richtig aus – bitte prüfen.');
  }

  // --- E-Mail --------------------------------------------------------------
  // Freiwillig. Wer sie angibt, bekommt nach der Fahrt eine kurze Nachricht;
  // fuer eine Rechnung ist sie Pflicht. Ohne Angabe wird nichts gespeichert.
  const rechnungGewuenscht = Boolean(eingabe.rechnungGewuenscht);
  const email = kurz(eingabe.email, 254);
  if ((email || rechnungGewuenscht) && !plausibleEmail(email)) {
    fehler.push(
      email
        ? 'Die E-Mail-Adresse sieht nicht richtig aus – bitte prüfen.'
        : 'Für die Rechnung per E-Mail fehlt die Adresse des Fahrgasts.',
    );
  }

  // --- Zeitpunkt der Fahrt -------------------------------------------------
  const sofort = eingabe.wann !== 'spaeter';
  let wunschIso = '';
  let wunschzeit = '';

  if (!sofort) {
    const iso = berlinNachIso(eingabe.datum, eingabe.zeit);
    if (!iso) {
      fehler.push('Datum oder Uhrzeit der Fahrt sind unvollständig.');
    } else {
      const grenze = jetzt.getTime() + 365 * 24 * 3600_000;
      if (new Date(iso).getTime() > grenze) {
        fehler.push('Der Zeitpunkt der Fahrt liegt mehr als ein Jahr in der Zukunft.');
      } else {
        wunschIso = iso;
        wunschzeit = zeitpunktDeutsch(iso);
      }
    }
  }

  // --- Eingang des Auftrags ------------------------------------------------
  // Vorgabe ist jetzt. Oender notiert am Telefon oft auf Papier und tippt
  // spaeter ein - fuer § 49 zaehlt der echte Eingang, nicht die Erfassung.
  let eingangIso = jetzt.toISOString();
  if (eingabe.eingangDatum || eingabe.eingangZeit) {
    const iso = berlinNachIso(eingabe.eingangDatum, eingabe.eingangZeit);
    if (!iso) {
      fehler.push('Der Zeitpunkt des Auftragseingangs ist unvollständig.');
    } else {
      const zeitpunkt = new Date(iso).getTime();
      // Fuenf Minuten Spielraum: Die Uhr des Handys geht selten genau
      if (zeitpunkt > jetzt.getTime() + 5 * 60_000) {
        fehler.push('Der Auftragseingang kann nicht in der Zukunft liegen.');
      } else if (zeitpunkt < jetzt.getTime() - RUECKWIRKEND_TAGE * 24 * 3600_000) {
        fehler.push(`Der Auftragseingang liegt mehr als ${RUECKWIRKEND_TAGE} Tage zurück.`);
      } else {
        eingangIso = iso;
      }
    }
  }

  // --- Preis ---------------------------------------------------------------
  // Aus Freitext laesst sich keine Strecke messen und damit kein Festpreis
  // rechnen. Geraten wird nicht - dann muss der vereinbarte Betrag herein.
  const ausAuswahl = eingabe.vonGewaehlt && eingabe.nachGewaehlt;
  const preisBerechnen = ausAuswahl && !eingabe.preisAbweichend;

  let preisCent: number | null = null;
  if (!preisBerechnen) {
    const betrag = betragLesen(eingabe.preis ?? '');
    if (betrag === null) {
      fehler.push(
        ausAuswahl
          ? 'Bitte den abweichend vereinbarten Preis eintragen, zum Beispiel 40,00.'
          : 'Ohne ausgewählte Adressen lässt sich kein Preis berechnen – bitte den vereinbarten Preis eintragen, zum Beispiel 40,00.',
      );
    } else if (betrag > HOECHSTBETRAG_CENT) {
      fehler.push('Der Preis ist zu hoch – bitte prüfen.');
    } else {
      preisCent = betrag;
    }
  }

  if (fehler.length > 0) return { fehler };

  const personen = Number(eingabe.personen);
  return {
    auftrag: {
      kanal: eingabe.kanal,
      art: ANLAESSE.includes(eingabe.art) ? eingabe.art : 'Fahrt',
      abholung,
      ziel: kurz(eingabe.ziel),
      sofort: sofort ? 1 : 0,
      wunschIso,
      wunschzeit,
      personen: Number.isFinite(personen) ? Math.min(Math.max(Math.round(personen), 1), 8) : 1,
      anmerkung: kurz(eingabe.anmerkung),
      kundeName: name,
      kundeTelefon: telefon,
      rechnungGewuenscht: rechnungGewuenscht ? 1 : 0,
      bewertungGewuenscht: email ? 1 : 0,
      kundeEmail: email,
      eingangIso,
      preisBerechnen,
      preisCent,
    },
  };
}
