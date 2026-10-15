/**
 * Die Bewertung nach der Fahrt.
 *
 * Sobald der Fahrer die Fahrt abmeldet, bedankt sich die Seite beim Fahrgast
 * und fragt nach Sternen und einem Satz dazu. Das ist der Moment, in dem die
 * Erinnerung frisch ist - eine Mail am Abend erreicht die Haelfte nie.
 *
 * Rein und ohne Datenbank, damit jede Regel einzeln pruefbar bleibt.
 */

/** Hoechstlaenge der Rueckmeldung. */
export const HOECHSTLAENGE = 1000;

export type Pruefung =
  | { ok: true; sterne: number; text: string }
  | { ok: false; grund: string };

/**
 * Prueft, was der Fahrgast abgeschickt hat.
 *
 * Die Sterne sind Pflicht, der Text nicht: Wer nur tippen will, soll nicht
 * schreiben muessen. Umgekehrt waere ein Text ohne Sterne auch in Ordnung -
 * aber die Seite fragt die Sterne zuerst, und ohne sie laesst sich nichts
 * auswerten.
 */
export function bewertungPruefen(rohSterne: unknown, rohText: unknown): Pruefung {
  const sterne = Number(rohSterne);
  if (!Number.isInteger(sterne) || sterne < 1 || sterne > 5) {
    return { ok: false, grund: 'Bitte vergeben Sie ein bis fünf Sterne.' };
  }

  const text = String(rohText ?? '').trim().slice(0, HOECHSTLAENGE);
  return { ok: true, sterne, text };
}

/** Fuenf Zeichen, auf einen Blick lesbar: ★★★★☆ */
export function sterneZeichen(sterne: number): string {
  const zahl = Math.min(5, Math.max(0, Math.round(sterne)));
  return '★'.repeat(zahl) + '☆'.repeat(5 - zahl);
}

/**
 * Die Meldung an den Chef.
 *
 * Eine schlechte Bewertung soll auffallen, solange sich noch etwas tun laesst
 * - deshalb geht sie sofort nach Telegram und nicht in eine Liste, in die
 * jemand irgendwann schaut.
 */
export function chefmeldung(
  sterne: number,
  text: string,
  angaben: { von: string; nach: string; fahrer: string; sicher: (s: string) => string },
): string {
  const zeilen = [
    sterne <= 2 ? '⚠️ <b>Schlechte Bewertung</b>' : '⭐ <b>Neue Bewertung</b>',
    '',
    `${sterneZeichen(sterne)} (${sterne} von 5)`,
    '',
    `<b>Fahrer:</b> ${angaben.sicher(angaben.fahrer)}`,
    `<b>Strecke:</b> ${angaben.sicher(angaben.von)}${angaben.nach ? ` → ${angaben.sicher(angaben.nach)}` : ''}`,
  ];

  if (text) {
    zeilen.push('');
    zeilen.push(`<i>${angaben.sicher(text)}</i>`);
  }

  return zeilen.join('\n');
}
