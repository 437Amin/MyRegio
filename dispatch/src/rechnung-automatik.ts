/**
 * Die Rechnung entsteht von selbst, sobald der Fahrer die Fahrt abmeldet.
 *
 * Die Entscheidung darueber steht hier getrennt und ohne Datenbank, damit
 * jede Regel einzeln pruefbar ist. Sie ist heikel: Eine Rechnung zu viel ist
 * schlimmer als eine zu wenig - stornieren muss man von Hand, nachschicken
 * geht auf Knopfdruck.
 */

import { KLEINBETRAG_CENT, euro, type Zahlungsart } from './rechnung';

/** Was aus dem Auftrag gebraucht wird, um zu entscheiden. */
export interface AuftragFuerRechnung {
  rechnung_gewuenscht: number;
  kunde_email: string;
  /** Vereinbarter Festpreis in Euro. 0 heisst: wurde nie ermittelt. */
  preis: number;
}

export type Entscheidung =
  /** Es gibt nichts zu tun - der Fahrgast wollte keine Rechnung. */
  | { art: 'keine' }
  /** Rechnung anlegen und verschicken. */
  | { art: 'automatisch'; bruttoCent: number }
  /** Der Chef muss ran. Der Grund steht so da, dass er ihn vorlesen koennte. */
  | { art: 'von-hand'; grund: string };

/**
 * Entscheidet, was nach der Fahrt mit der Rechnung geschieht.
 *
 * Ueber dem Kleinbetrag (250 EUR) verlangt § 33 UStDV Name UND Anschrift des
 * Fahrgasts. Die Anschrift fragen wir bei der Bestellung bewusst nicht ab -
 * fuer eine Taxifahrt waere das eine Huerde, die kaum jemand nimmt. Also
 * uebernimmt in diesen Faellen der Chef.
 */
export function rechnungsentscheidung(auftrag: AuftragFuerRechnung): Entscheidung {
  if (!auftrag.rechnung_gewuenscht) return { art: 'keine' };

  if (!auftrag.kunde_email.trim()) {
    return {
      art: 'von-hand',
      grund: 'Der Fahrgast wollte eine Rechnung, es ist aber keine E-Mail-Adresse hinterlegt.',
    };
  }

  const bruttoCent = Math.round(auftrag.preis * 100);
  if (bruttoCent <= 0) {
    return {
      art: 'von-hand',
      grund: 'Für die Fahrt steht kein Festpreis fest – der Betrag muss von Hand eingetragen werden.',
    };
  }

  if (bruttoCent > KLEINBETRAG_CENT) {
    return {
      art: 'von-hand',
      grund:
        `Die Fahrt kostet ${euro(bruttoCent)}. Über ${euro(KLEINBETRAG_CENT)} müssen Name` +
        ' und Anschrift des Fahrgasts auf der Rechnung stehen – die Anschrift liegt uns nicht vor.',
    };
  }

  return { art: 'automatisch', bruttoCent };
}

/**
 * Wie wurde bezahlt? Der Fahrer tippt es beim Abmelden an.
 *
 * Ohne Angabe bliebe nur das Raten, und auf einer Rechnung stuende dann
 * moeglicherweise "Bar bezahlt", obwohl mit Karte gezahlt wurde.
 */
export function zahlungsartLesen(wert: unknown): Zahlungsart | null {
  const text = String(wert ?? '').trim();
  return text === 'bar' || text === 'karte' || text === 'ueberweisung' ? text : null;
}
