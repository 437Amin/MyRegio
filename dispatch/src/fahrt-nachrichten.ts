/**
 * Der Nachrichtenverlauf zu einer Fahrt - beide Richtungen.
 *
 * Der Fahrgast schreibt auf der Statusseite, der Fahrer in seinem Chat mit
 * dem Bot. Beide sehen denselben Verlauf, so wie man es von jedem
 * Nachrichtendienst kennt.
 *
 * Deshalb wird hier auch der Text des Fahrgasts abgelegt - in der ersten
 * Fassung geschah das bewusst nicht. Ein Verlauf, den nur eine Seite sieht,
 * ist aber kein Verlauf. Der Preis dafuer ist, dass die Texte bis zum Ende
 * der Fahrt liegen; mit dem Abmelden werden sie geloescht. Danach wartet
 * niemand mehr darauf, und was nicht gespeichert ist, muss auch nicht
 * geschuetzt werden.
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

/** Wer geschrieben hat. */
export type Seite = 'fahrgast' | 'fahrer';

export interface Nachricht {
  von: Seite;
  text: string;
  /** Uhrzeit in deutscher Ortszeit, z. B. "20:41" */
  zeit: string;
}

/** Hoechstlaenge einer Nachricht. Ein Zuruf, kein Brief. */
export const HOECHSTLAENGE = 300;

/** So viele Nachrichten je Fahrt insgesamt. Danach ist Anrufen das Richtige. */
export const HOECHSTZAHL = 20;

/** So viele sieht man auf einmal. */
export const SICHTBAR = 8;

export type Pruefung = { ok: true; text: string } | { ok: false; grund: string };

/**
 * Prueft einen Text, egal von welcher Seite.
 *
 * Befehle (alles mit "/" am Anfang) sind keine Nachricht an die Gegenseite -
 * sonst landete ein vertipptes "/start" im Verlauf des Fahrgasts.
 */
export function nachrichtPruefen(roh: unknown): Pruefung {
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

/** Die Fahrt, auf die sich eine Nachricht dieses Fahrers bezieht. */
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

/** Haengt eine Nachricht an den Verlauf. */
export async function nachrichtAblegen(
  db: Datenbank,
  auftragId: string,
  von: Seite,
  text: string,
): Promise<Ablage> {
  const bisher = await db
    .prepare('SELECT count(*) AS anzahl FROM fahrt_nachrichten WHERE auftrag_id = ?')
    .bind(auftragId)
    .first<{ anzahl: number }>();

  if ((bisher?.anzahl ?? 0) >= HOECHSTZAHL) return 'zu-viele';

  await db
    .prepare('INSERT INTO fahrt_nachrichten (auftrag_id, von, text) VALUES (?, ?, ?)')
    .bind(auftragId, von, text)
    .run();

  return 'abgelegt';
}

/**
 * Macht aus der gespeicherten Zeit eine Uhrzeit, die der Fahrgast kennt.
 *
 * SQLite speichert UTC ohne Zeitzone ("2026-10-15 18:41:00"). Ungewandelt
 * stuende auf der Seite im Sommer eine Uhrzeit zwei Stunden daneben.
 */
export function uhrzeit(gespeichert: string): string {
  const datum = new Date(
    /[TZ]|[+-]\d\d:\d\d$/.test(gespeichert)
      ? gespeichert
      : gespeichert.replace(' ', 'T') + 'Z',
  );
  if (Number.isNaN(datum.getTime())) return '';

  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(datum);
}

/** Der Verlauf zu einer Fahrt, aelteste zuerst. */
export async function verlaufLesen(
  db: Datenbank,
  auftragId: string,
): Promise<Nachricht[]> {
  const zeilen = await db
    .prepare(
      `SELECT von, text, zeitpunkt FROM fahrt_nachrichten
        WHERE auftrag_id = ? ORDER BY id DESC LIMIT ${SICHTBAR}`,
    )
    .bind(auftragId)
    .all<{ von: string; text: string; zeitpunkt: string }>();

  return (zeilen.results ?? [])
    .map((z) => ({
      von: (z.von === 'fahrer' ? 'fahrer' : 'fahrgast') as Seite,
      text: z.text,
      zeit: uhrzeit(z.zeitpunkt),
    }))
    .reverse();
}

/** Nach der Fahrt wartet niemand mehr - weg damit. */
export async function verlaufVergessen(
  db: Datenbank,
  auftragId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM fahrt_nachrichten WHERE auftrag_id = ?')
    .bind(auftragId)
    .run();
}
