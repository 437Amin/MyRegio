/**
 * Standortmeldungen der Fahrer aus Telegram.
 *
 * Der Fahrer teilt in Telegram seinen Live-Standort; Telegram schickt den
 * ersten Punkt als Nachricht und jede Aktualisierung als bearbeitete
 * Nachricht. Beides landet hier.
 *
 * ACHTUNG: Beschaeftigtendaten. Die Regeln dazu stehen in schema.sql bei der
 * Tabelle und sind hier umgesetzt:
 *
 *   * gespeichert wird nur, WAEHREND der Fahrer eine Fahrt angenommen hat
 *   * nur der letzte Punkt, kein Verlauf
 *   * mit dem Abmelden der Fahrt wird der Eintrag geloescht
 *
 * Eine Meldung ausserhalb einer Fahrt wird verworfen, nicht aufgehoben. Das
 * ist der Unterschied zwischen "weiss, wo der Wagen gerade ist" und
 * "zeichnet auf, wo der Fahrer war".
 */

import type { Umgebung } from './typen';

/** Das Stueck D1, das hier gebraucht wird. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
}

export interface GemeldeterOrt {
  breite: number;
  laenge: number;
}

/**
 * Liest einen Standort aus einer Telegram-Nachricht.
 *
 * Null, wenn keiner dabei ist oder die Werte unbrauchbar sind - etwa 0/0,
 * ein Punkt im Atlantik, den Telegram nie schickt, der aber als Vorgabewert
 * leicht entsteht.
 */
export function standortAusNachricht(nachricht: unknown): GemeldeterOrt | null {
  const ort = (nachricht as { location?: { latitude?: unknown; longitude?: unknown } })
    ?.location;
  if (!ort) return null;

  const breite = Number(ort.latitude);
  const laenge = Number(ort.longitude);

  if (!Number.isFinite(breite) || !Number.isFinite(laenge)) return null;
  if (Math.abs(breite) > 90 || Math.abs(laenge) > 180) return null;
  if (breite === 0 && laenge === 0) return null;

  return { breite, laenge };
}

/**
 * Haelt den Standort fest - aber nur, wenn der Fahrer gerade unterwegs ist.
 *
 * Liefert zurueck, was geschehen ist. "keine-fahrt" ist kein Fehler, sondern
 * der Normalfall ausserhalb einer Fahrt.
 */
export async function standortMerken(
  db: Datenbank,
  chatId: string,
  ort: GemeldeterOrt,
): Promise<'gemerkt' | 'keine-fahrt' | 'unbekannt'> {
  const fahrer = await db
    .prepare('SELECT id FROM fahrer WHERE telegram_chat_id = ? AND ausgeschieden = 0')
    .bind(chatId)
    .first<{ id: number }>();

  if (!fahrer) return 'unbekannt';

  const laeuft = await db
    .prepare(
      `SELECT 1 FROM auftraege
        WHERE fahrer_id = ? AND status = 'angenommen' AND beendet_um IS NULL
        LIMIT 1`,
    )
    .bind(fahrer.id)
    .first();

  if (!laeuft) return 'keine-fahrt';

  await db
    .prepare(
      `INSERT INTO fahrer_standort (fahrer_id, breite, laenge, zeitpunkt)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(fahrer_id) DO UPDATE
         SET breite = excluded.breite,
             laenge = excluded.laenge,
             zeitpunkt = excluded.zeitpunkt`,
    )
    .bind(fahrer.id, ort.breite, ort.laenge)
    .run();

  return 'gemerkt';
}

/** Loescht den Standort - nach der Fahrt gibt es keinen Grund mehr dafuer. */
export async function standortVergessen(db: Datenbank, fahrerId: number): Promise<void> {
  await db.prepare('DELETE FROM fahrer_standort WHERE fahrer_id = ?').bind(fahrerId).run();
}

/** Der zuletzt gemeldete Standort eines Fahrers. */
export async function standortLesen(
  db: Datenbank,
  fahrerId: number,
): Promise<{ breite: number; laenge: number; zeitpunkt: string } | null> {
  return db
    .prepare('SELECT breite, laenge, zeitpunkt FROM fahrer_standort WHERE fahrer_id = ?')
    .bind(fahrerId)
    .first<{ breite: number; laenge: number; zeitpunkt: string }>();
}

/**
 * Nimmt eine Standortmeldung aus dem Telegram-Webhook entgegen.
 *
 * Gibt es nichts zu tun, passiert nichts - der Fahrer bekommt keine Antwort.
 * Eine Bestaetigung bei jeder Aktualisierung waere alle 15 Sekunden eine
 * Nachricht und damit unbrauchbar.
 */
export async function standortmeldung(update: unknown, env: Umgebung): Promise<boolean> {
  const u = update as { message?: unknown; edited_message?: unknown };
  const nachricht = u.edited_message ?? u.message;
  const ort = standortAusNachricht(nachricht);
  if (!ort) return false;

  const chatId = String(
    (nachricht as { chat?: { id?: unknown } })?.chat?.id ?? '',
  );
  if (!chatId) return false;

  await standortMerken(env.DB, chatId, ort);
  return true;
}
