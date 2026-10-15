/**
 * Zwischenspeicher für Adressvorschläge.
 *
 * Der Kartendienst hat ein Tageskontingent, und jeder Tastendruck im
 * Adressfeld kostet davon. Dabei tippen zehn Fahrgäste dieselben zehn
 * Strassen: "Steiermaerker Str.", "Flughafen", "Hauptbahnhof". Beim zweiten
 * Mal kommt die Antwort deshalb aus der eigenen Datenbank - das spart
 * Kontingent und ist nebenbei spuerbar schneller.
 *
 * Zwei Regeln, die hier wichtiger sind als die Ersparnis:
 *
 *   * Ein LEERES Ergebnis wird nie gespeichert. Es kann aus einem Ausfall
 *     stammen (Kontingent erschoepft, Netz weg) - dann waere "nichts
 *     gefunden" fuer dreissig Tage einbetoniert.
 *   * Gespeichert wird nur, was der Kartendienst geliefert hat, nicht was ein
 *     Fahrgast getippt hat. Im Schluessel steht zwar seine Eingabe, aber die
 *     ist ein Strassenname, keine Person.
 */

/** Das Stueck D1, das hier gebraucht wird. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
}

export interface Vorschlag {
  text: string;
  breite: number;
  laenge: number;
}

/** So lange gilt ein Eintrag. Strassen ziehen selten um. */
export const HALTBARKEIT_TAGE = 30;

/**
 * Macht aus der Eingabe einen Schluessel.
 *
 * "Steiermärker STR. 3" und " steiermärker str. 3 " sollen denselben Eintrag
 * treffen. Gross- und Kleinschreibung sowie mehrfache Leerzeichen fallen
 * deshalb weg; Umlaute bleiben, sie gehoeren zum Namen.
 */
export function schluessel(gesuch: string): string {
  return gesuch.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Holt gespeicherte Vorschläge - oder null, wenn es keine gibt. */
export async function ausSpeicher(
  db: Datenbank,
  gesuch: string,
): Promise<Vorschlag[] | null> {
  const zeile = await db
    .prepare(
      `SELECT treffer FROM adressen_speicher
        WHERE schluessel = ? AND angelegt > datetime('now', '-${HALTBARKEIT_TAGE} days')`,
    )
    .bind(schluessel(gesuch))
    .first<{ treffer: string }>();

  if (!zeile) return null;

  try {
    const gelesen = JSON.parse(zeile.treffer) as Vorschlag[];
    // Ein kaputter Eintrag soll nicht die Vorschläge lahmlegen
    return Array.isArray(gelesen) && gelesen.length > 0 ? gelesen : null;
  } catch {
    return null;
  }
}

/**
 * Legt Vorschläge ab. Eine leere Liste wird bewusst NICHT gespeichert.
 *
 * Sie kann aus einem Ausfall stammen, und ein eingefrorenes "nichts gefunden"
 * waere schlimmer als jede Anfrage, die wir sparen.
 */
export async function inSpeicher(
  db: Datenbank,
  gesuch: string,
  treffer: Vorschlag[],
): Promise<void> {
  if (treffer.length === 0) return;

  await db
    .prepare(
      `INSERT INTO adressen_speicher (schluessel, treffer, angelegt)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(schluessel) DO UPDATE
         SET treffer = excluded.treffer, angelegt = excluded.angelegt`,
    )
    .bind(schluessel(gesuch), JSON.stringify(treffer))
    .run();
}
