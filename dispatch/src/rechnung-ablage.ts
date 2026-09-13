import type { Absender, GepruefteRechnung, Rechnung } from './rechnung';

/**
 * Rechnungen speichern und laden.
 *
 * Eine ausgestellte Rechnung wird nie geaendert und nie geloescht - das
 * verlangen Umsatzsteuergesetz und GoBD. Ein Fehler wird mit einer
 * Stornorechnung aufgehoben, die eine eigene Nummer bekommt. Beide bleiben
 * stehen, damit die Nummernfolge lueckenlos ist.
 */

/** Das Stueck D1, das hier gebraucht wird - so laesst es sich auch testen. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

/**
 * Legt eine Rechnung mit der naechsten freien Nummer des Jahres an.
 *
 * Nummer und Datensatz entstehen in EINER Anweisung. D1 fuehrt Anweisungen
 * nacheinander aus, zwei gleichzeitige Rechnungen koennen also nicht dieselbe
 * Nummer ziehen - und falls doch, verhindert es der eindeutige Index.
 */
export async function rechnungAnlegen(
  db: Datenbank,
  r: GepruefteRechnung,
  absender: Absender,
  rechnungsdatum: string,
): Promise<number> {
  const jahr = Number(rechnungsdatum.slice(0, 4));
  const zeile = await db
    .prepare(
      `INSERT INTO rechnungen
         (jahr, laufnummer, rechnungsdatum, fahrtdatum, von, nach, kunde_name,
          kunde_anschrift, zahlungsart, brutto_cent, netto_cent, steuer_cent,
          steuersatz, absender)
       VALUES (?, (SELECT COALESCE(MAX(laufnummer), 0) + 1 FROM rechnungen WHERE jahr = ?),
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      jahr,
      jahr,
      rechnungsdatum,
      r.fahrtdatum,
      r.von,
      r.nach,
      r.kundeName,
      r.kundeAnschrift,
      r.zahlungsart,
      r.bruttoCent,
      r.nettoCent,
      r.steuerCent,
      r.steuersatz,
      JSON.stringify(absender),
    )
    .first<{ id: number }>();

  return zeile!.id;
}

/**
 * Hebt eine Rechnung mit einer Stornorechnung auf.
 *
 * Die Stornorechnung uebernimmt alle Angaben mit umgekehrtem Vorzeichen.
 * Die Betraege werden bewusst nicht neu gerechnet: Beim Runden negativer
 * Zahlen koennte ein Cent Unterschied zur Originalrechnung entstehen.
 *
 * Liefert die Nummer der Stornorechnung - auch wenn schon vorher storniert
 * wurde, etwa durch doppeltes Tippen. Null, wenn es nichts zu stornieren gibt.
 */
export async function rechnungStornieren(
  db: Datenbank,
  id: number,
  absender: Absender,
  rechnungsdatum: string,
): Promise<number | null> {
  const bestehend = await stornoZu(db, id);
  if (bestehend) return bestehend;

  const jahr = Number(rechnungsdatum.slice(0, 4));
  try {
    const zeile = await db
      .prepare(
        `INSERT INTO rechnungen
           (jahr, laufnummer, rechnungsdatum, fahrtdatum, von, nach, kunde_name,
            kunde_anschrift, zahlungsart, brutto_cent, netto_cent, steuer_cent,
            steuersatz, absender, storno_von)
         SELECT ?, (SELECT COALESCE(MAX(laufnummer), 0) + 1 FROM rechnungen WHERE jahr = ?),
                ?, fahrtdatum, von, nach, kunde_name, kunde_anschrift, zahlungsart,
                -brutto_cent, -netto_cent, -steuer_cent, steuersatz, ?, id
           FROM rechnungen
          WHERE id = ? AND storno_von IS NULL
         RETURNING id`,
      )
      .bind(jahr, jahr, rechnungsdatum, JSON.stringify(absender), id)
      .first<{ id: number }>();
    return zeile?.id ?? null;
  } catch (fehler) {
    // Zwei Stornos im selben Augenblick: Der eindeutige Index laesst nur
    // eines durch, das andere bekommt dessen Nummer
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    if (!/UNIQUE/i.test(meldung)) throw fehler;
    return stornoZu(db, id);
  }
}

async function stornoZu(db: Datenbank, id: number): Promise<number | null> {
  const zeile = await db
    .prepare('SELECT id FROM rechnungen WHERE storno_von = ?')
    .bind(id)
    .first<{ id: number }>();
  return zeile?.id ?? null;
}

export interface RechnungMitStorno extends Rechnung {
  /** Nummer der Stornorechnung, falls diese Rechnung aufgehoben wurde */
  storniert_durch: number | null;
}

export async function rechnungLaden(
  db: Datenbank,
  id: number,
): Promise<RechnungMitStorno | null> {
  return db
    .prepare(
      `SELECT r.*, (SELECT s.id FROM rechnungen s WHERE s.storno_von = r.id) AS storniert_durch
         FROM rechnungen r WHERE r.id = ?`,
    )
    .bind(id)
    .first<RechnungMitStorno>();
}

export async function letzteRechnungen(
  db: Datenbank,
  anzahl = 100,
): Promise<RechnungMitStorno[]> {
  const ergebnis = await db
    .prepare(
      `SELECT r.*, (SELECT s.id FROM rechnungen s WHERE s.storno_von = r.id) AS storniert_durch
         FROM rechnungen r ORDER BY r.id DESC LIMIT ?`,
    )
    .bind(anzahl)
    .all<RechnungMitStorno>();
  return ergebnis.results ?? [];
}
