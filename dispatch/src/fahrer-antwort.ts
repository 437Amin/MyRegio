/**
 * Der Fahrer antwortet dem Fahrgast.
 *
 * Er schreibt einfach in den Chat mit dem Bot - kein Knopf, kein Befehl, kein
 * Umweg. Was er tippt, erscheint auf der Seite des Fahrgasts, der gerade auf
 * ihn wartet. "Bin in zwei Minuten da", "Stehe vor dem roten Tor".
 *
 * Gespeichert wird hier anders als bei der Gegenrichtung: Der Fahrgast ruft
 * die Seite in Abstaenden ab, die Antwort muss also irgendwo liegen, bis er
 * sie abholt. Mit dem Abmelden der Fahrt wird sie geloescht - danach wartet
 * niemand mehr darauf.
 */

/** Das Stueck D1, das hier gebraucht wird. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

/** Hoechstlaenge einer Antwort - derselbe Zuruf wie in der Gegenrichtung. */
export const HOECHSTLAENGE = 300;

/** So viele Antworten je Fahrt. Danach ist Anrufen das Richtige. */
export const HOECHSTZAHL = 10;

/** So viele sieht der Fahrgast auf einmal. */
export const SICHTBAR = 3;

export type Pruefung = { ok: true; text: string } | { ok: false; grund: string };

/**
 * Prueft, was der Fahrer getippt hat.
 *
 * Befehle (alles mit "/" am Anfang) sind keine Antwort an den Fahrgast -
 * sonst landete ein vertipptes "/start" beim Kunden auf der Seite.
 */
export function antwortPruefen(roh: unknown): Pruefung {
  const text = String(roh ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return { ok: false, grund: 'leer' };
  if (text.startsWith('/')) return { ok: false, grund: 'befehl' };
  if (text.length > HOECHSTLAENGE) {
    return { ok: false, grund: `zu lang – höchstens ${HOECHSTLAENGE} Zeichen` };
  }

  return { ok: true, text };
}

/** Die Fahrt, auf die sich eine Antwort dieses Fahrers bezieht. */
export async function laufendeFahrtVon(
  db: Datenbank,
  chatId: string,
): Promise<{ auftragId: string; fahrerId: number } | null> {
  const zeile = await db
    .prepare(
      `SELECT a.id AS auftrag_id, f.id AS fahrer_id
         FROM fahrer f JOIN auftraege a ON a.fahrer_id = f.id
        WHERE f.telegram_chat_id = ? AND f.ausgeschieden = 0
          AND a.status = 'angenommen' AND a.beendet_um IS NULL
        ORDER BY a.angenommen_um DESC
        LIMIT 1`,
    )
    .bind(chatId)
    .first<{ auftrag_id: string; fahrer_id: number }>();

  return zeile ? { auftragId: zeile.auftrag_id, fahrerId: zeile.fahrer_id } : null;
}

export type Ablage = 'abgelegt' | 'zu-viele';

/** Legt die Antwort ab, bis der Fahrgast sie abholt. */
export async function antwortAblegen(
  db: Datenbank,
  auftragId: string,
  text: string,
): Promise<Ablage> {
  const bisher = await db
    .prepare('SELECT count(*) AS anzahl FROM fahrer_antworten WHERE auftrag_id = ?')
    .bind(auftragId)
    .first<{ anzahl: number }>();

  if ((bisher?.anzahl ?? 0) >= HOECHSTZAHL) return 'zu-viele';

  await db
    .prepare('INSERT INTO fahrer_antworten (auftrag_id, text) VALUES (?, ?)')
    .bind(auftragId, text)
    .run();

  return 'abgelegt';
}

/** Die letzten Antworten zu einer Fahrt, aelteste zuerst. */
export async function antwortenLesen(
  db: Datenbank,
  auftragId: string,
): Promise<string[]> {
  const zeilen = await db
    .prepare(
      `SELECT text FROM fahrer_antworten
        WHERE auftrag_id = ? ORDER BY id DESC LIMIT ${SICHTBAR}`,
    )
    .bind(auftragId)
    .all<{ text: string }>();

  return (zeilen.results ?? []).map((z) => z.text).reverse();
}

/** Nach der Fahrt wartet niemand mehr - weg damit. */
export async function antwortenVergessen(
  db: Datenbank,
  auftragId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM fahrer_antworten WHERE auftrag_id = ?')
    .bind(auftragId)
    .run();
}
