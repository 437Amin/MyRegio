/**
 * Der Fahrgast schreibt dem Fahrer.
 *
 * "Ich stehe am hinteren Ausgang", "Bitte noch fünf Minuten", "Ich habe einen
 * Kinderwagen dabei" - Kleinigkeiten, für die niemand anrufen will und die am
 * Telefon doch jedes Mal gefragt werden.
 *
 * Bewusst EINE Richtung und ohne Rufnummern: Der Fahrgast sieht nie die
 * Nummer des Fahrers, der Fahrer nie mehr als ohnehin im Auftrag steht. Die
 * Nachricht geht über den Bot, den der Fahrer ohnehin offen hat.
 *
 * Der Text wird NICHT gespeichert. Für den Nachweis des Auftragseingangs
 * (§ 49 PBefG) zählt der Auftrag, nicht das Geplauder davor - und was nicht
 * gespeichert ist, muss auch nicht geschützt werden.
 */

import { sicher } from './telegram';

/** Höchstlänge. Eine Nachricht an den Fahrer ist ein Zuruf, kein Brief. */
export const HOECHSTLAENGE = 300;

/** So viele Nachrichten je Fahrt. Danach ist Anrufen das Richtige. */
export const HOECHSTZAHL = 5;

export type Pruefung =
  | { ok: true; text: string }
  | { ok: false; grund: string };

/**
 * Prüft den Text, bevor er den Fahrer erreicht.
 *
 * Rein und ohne Netz - damit jede Regel einzeln prüfbar bleibt.
 */
export function nachrichtPruefen(roh: unknown): Pruefung {
  const text = String(roh ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return { ok: false, grund: 'Bitte schreiben Sie etwas.' };
  if (text.length > HOECHSTLAENGE) {
    return {
      ok: false,
      grund: `Bitte fassen Sie sich kürzer – höchstens ${HOECHSTLAENGE} Zeichen.`,
    };
  }

  return { ok: true, text };
}

/**
 * Die Nachricht, so wie der Fahrer sie sieht.
 *
 * Name und Text werden maskiert: Telegram liest die Nachricht als HTML, und
 * ein Fahrgast soll dem Fahrer keine Auszeichnungen oder Links unterschieben
 * koennen.
 */
export function nachrichtentext(kundeName: string, text: string): string {
  const absender = kundeName.trim() || 'Ihr Fahrgast';
  return `💬 <b>Nachricht von ${sicher(absender)}</b>\n\n${sicher(text)}`;
}
