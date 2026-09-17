/**
 * Schmaler Anschluss an die Telegram-Bot-Schnittstelle.
 *
 * Absichtlich ohne fremde Bibliothek: Wir brauchen genau drei Aufrufe, und
 * jede Abhaengigkeit weniger ist eine Sache weniger, die in drei Jahren
 * nachts kaputtgehen kann.
 */

export interface Knopf {
  text: string;
  daten: string;
}

interface TelegramAntwort {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

/**
 * Adresse der Telegram-Schnittstelle. Ueber die Umgebungsvariable
 * TELEGRAM_BASIS laesst sie sich umbiegen - so kann der Ablauf getestet
 * werden, ohne echte Nachrichten zu verschicken.
 */
let basis = 'https://api.telegram.org';

export function setzeTelegramBasis(neueBasis?: string): void {
  if (neueBasis) basis = neueBasis.replace(/\/$/, '');
}

async function rufeAuf(
  token: string,
  methode: string,
  koerper: Record<string, unknown>,
): Promise<TelegramAntwort> {
  try {
    const antwort = await fetch(`${basis}/bot${token}/${methode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(koerper),
    });
    return (await antwort.json()) as TelegramAntwort;
  } catch (fehler) {
    // Ein Netzfehler darf die Vermittlung nicht abbrechen - der naechste
    // Fahrer soll trotzdem drankommen.
    return {
      ok: false,
      description: fehler instanceof Error ? fehler.message : String(fehler),
    };
  }
}

/** Schickt eine Nachricht, optional mit Knoepfen darunter. */
export async function sendeNachricht(
  token: string,
  chatId: string,
  text: string,
  knoepfe: Knopf[] = [],
): Promise<{ ok: boolean; nachrichtId?: number; fehler?: string }> {
  const koerper: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (knoepfe.length > 0) {
    koerper.reply_markup = {
      inline_keyboard: [
        knoepfe.map((knopf) => ({
          text: knopf.text,
          callback_data: knopf.daten,
        })),
      ],
    };
  }

  const antwort = await rufeAuf(token, 'sendMessage', koerper);
  return {
    ok: antwort.ok,
    nachrichtId: antwort.result?.message_id,
    fehler: antwort.description,
  };
}

/**
 * Quittiert einen Knopfdruck. Ohne diesen Aufruf dreht sich beim Fahrer
 * ewig ein Ladekringel.
 */
export async function quittiereKnopf(
  token: string,
  callbackId: string,
  hinweis = '',
): Promise<void> {
  await rufeAuf(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: hinweis,
    show_alert: false,
  });
}

/**
 * Ersetzt eine bereits gesendete Nachricht - damit die Knoepfe verschwinden,
 * sobald der Auftrag vergeben ist. Sonst tippt ein zweiter Fahrer auf
 * "Annehmen" und wundert sich.
 */
export async function ersetzeNachricht(
  token: string,
  chatId: string,
  nachrichtId: number,
  text: string,
  knoepfe: Knopf[] = [],
): Promise<void> {
  await rufeAuf(token, 'editMessageText', {
    chat_id: chatId,
    message_id: nachrichtId,
    text,
    parse_mode: 'HTML',
    // Ohne Knoepfe bleibt reply_markup leer - dann verschwinden sie, was beim
    // Vergeben eines Auftrags genau richtig ist.
    reply_markup:
      knoepfe.length > 0
        ? {
            inline_keyboard: [
              knoepfe.map((knopf) => ({ text: knopf.text, callback_data: knopf.daten })),
            ],
          }
        : undefined,
  });
}

/** Maskiert Zeichen, die Telegram im HTML-Modus sonst falsch deutet. */
export function sicher(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
