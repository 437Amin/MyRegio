import type { Bestellung, StatusAntwort, Umgebung } from './typen';
import { quittiereKnopf, sendeNachricht, setzeTelegramBasis } from './telegram';
import { adminRoute } from './admin';

export { Vermittlung } from './vermittlung-do';

/**
 * Auftragsvermittlung fuer MyRegioCar.
 *
 * Nimmt Bestellungen von der Website entgegen, legt sie in der Datenbank ab
 * und uebergibt sie an ein Vermittlungsobjekt, das die Fahrer der Reihe nach
 * per Telegram fragt.
 */

const MAX_LAENGE = 500;
const BESTELLUNGEN_PRO_STUNDE = 5;

export default {
  async fetch(anfrage: Request, env: Umgebung): Promise<Response> {
    setzeTelegramBasis(env.TELEGRAM_BASIS);

    const url = new URL(anfrage.url);
    const pfad = url.pathname;

    if (anfrage.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: kopfzeilen(env, anfrage) });
    }

    try {
      if (pfad === '/api/bestellung' && anfrage.method === 'POST') {
        return await bestellungAnnehmen(anfrage, env);
      }

      if (pfad.startsWith('/api/status/') && anfrage.method === 'GET') {
        return await statusAbfragen(pfad.split('/').pop()!, env, anfrage);
      }

      if (pfad === '/telegram/webhook' && anfrage.method === 'POST') {
        return await telegramEmpfangen(anfrage, env);
      }

      if (pfad === '/' || pfad.startsWith('/fahrer')) {
        return await adminRoute(anfrage, env);
      }

      return antwort({ fehler: 'Unbekannter Aufruf' }, 404, env, anfrage);
    } catch (fehler) {
      console.error('Unerwarteter Fehler:', fehler);
      return antwort({ fehler: 'Interner Fehler' }, 500, env, anfrage);
    }
  },
};

/* ========================================================================== */
/*  Bestellung von der Website                                                */
/* ========================================================================== */

async function bestellungAnnehmen(
  anfrage: Request,
  env: Umgebung,
): Promise<Response> {
  const roh = (await anfrage.json().catch(() => null)) as Bestellung | null;
  if (!roh) return antwort({ fehler: 'Ungültige Anfrage' }, 400, env,
      anfrage,);

  const fehlend = ['art', 'abholung', 'name', 'telefon'].filter(
    (feld) => !String((roh as unknown as Record<string, unknown>)[feld] ?? '').trim(),
  );
  if (fehlend.length > 0) {
    return antwort(
      { fehler: `Es fehlen noch Angaben: ${fehlend.join(', ')}` },
      400,
      env,
    );
  }

  // Vor der Drosselung pruefen, damit Tippfehler nicht aufs Kontingent gehen
  if (!plausibleTelefonnummer(roh.telefon)) {
    return antwort(
      { fehler: 'Bitte geben Sie eine gültige Telefonnummer an.' },
      400,
      env,
      anfrage,
    );
  }

  const kennung = await ipKennung(anfrage, env);
  if (await zuVieleBestellungen(kennung, env)) {
    return antwort(
      {
        fehler:
          'Es liegen bereits mehrere Anfragen von Ihnen vor. Bitte rufen Sie uns direkt an.',
      },
      429,
      env,
      anfrage,
    );
  }

  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO auftraege
       (id, art, abholung, ziel, wunschzeit, wunsch_iso, sofort, personen, gepaeck,
        kindersitze, anmerkung, kunde_name, kunde_telefon)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      kurz(roh.art),
      kurz(roh.abholung),
      kurz(roh.ziel ?? ''),
      kurz(roh.wunschzeit ?? ''),
      gueltigesDatum(roh.wunschIso),
      roh.sofort ? 1 : 0,
      zahl(roh.personen, 1, 1, 8),
      zahl(roh.gepaeck, 0, 0, 10),
      zahl(roh.kindersitze, 0, 0, 4),
      kurz(roh.anmerkung ?? ''),
      kurz(roh.name),
      kurz(roh.telefon, 40),
    )
    .run();

  await env.DB.prepare('INSERT INTO drosselung (kennung) VALUES (?)')
    .bind(kennung)
    .run();

  // Vermittlung anstossen. Das Objekt uebernimmt ab hier eigenstaendig -
  // auch das Weiterreichen nach 40 Sekunden.
  const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(id));
  await objekt.fetch('https://vermittlung/start', {
    method: 'POST',
    body: JSON.stringify({ auftragId: id }),
  });

  return antwort({ auftragId: id }, 201, env,
      anfrage,);
}

async function statusAbfragen(
  id: string,
  env: Umgebung,
  anfrage?: Request,
): Promise<Response> {
  const zeile = await env.DB.prepare(
    `SELECT a.status, a.angenommen_um, f.name AS fahrername
       FROM auftraege a
       LEFT JOIN fahrer f ON f.id = a.fahrer_id
      WHERE a.id = ?`,
  )
    .bind(id)
    .first<{ status: string; angenommen_um: string | null; fahrername: string | null }>();

  if (!zeile) return antwort({ fehler: 'Unbekannter Auftrag' }, 404, env,
      anfrage,);

  const ergebnis: StatusAntwort = {
    status: zeile.status as StatusAntwort['status'],
    // Nur der Vorname - mehr braucht der Fahrgast nicht zu wissen
    fahrer: zeile.fahrername?.split(' ')[0],
    angenommenUm: zeile.angenommen_um ?? undefined,
  };
  return antwort(ergebnis, 200, env, anfrage);
}

/* ========================================================================== */
/*  Telegram                                                                  */
/* ========================================================================== */

async function telegramEmpfangen(
  anfrage: Request,
  env: Umgebung,
): Promise<Response> {
  // Telegram weist sich mit diesem Kopf aus. Ohne die Pruefung koennte jeder
  // beliebige Auftraege als angenommen melden.
  const geheimnis = anfrage.headers.get('x-telegram-bot-api-secret-token');
  if (geheimnis !== env.TELEGRAM_WEBHOOK_GEHEIMNIS) {
    return new Response('Nicht berechtigt', { status: 401 });
  }

  const update = (await anfrage.json().catch(() => null)) as any;
  if (!update) return new Response('ok');

  // --- Fahrer meldet sich am Bot an: /start ABC123 -------------------------
  const text: string | undefined = update.message?.text;
  if (text?.startsWith('/start')) {
    const code = text.split(/\s+/)[1]?.trim().toUpperCase();
    const chatId = String(update.message.chat.id);

    if (!code) {
      await sendeNachricht(
        env.TELEGRAM_TOKEN,
        chatId,
        'Willkommen bei MyRegioCar.\n\nBitte melde dich mit deinem persönlichen Code an:\n<code>/start DEINCODE</code>\n\nDen Code bekommst du vom Chef.',
      );
      return new Response('ok');
    }

    const fahrer = await env.DB.prepare(
      'SELECT id, name FROM fahrer WHERE anmeldecode = ?',
    )
      .bind(code)
      .first<{ id: number; name: string }>();

    if (!fahrer) {
      await sendeNachricht(
        env.TELEGRAM_TOKEN,
        chatId,
        '❌ Diesen Code kenne ich nicht. Bitte frag noch einmal beim Chef nach.',
      );
      return new Response('ok');
    }

    await env.DB.prepare('UPDATE fahrer SET telegram_chat_id = ? WHERE id = ?')
      .bind(chatId, fahrer.id)
      .run();

    await sendeNachricht(
      env.TELEGRAM_TOKEN,
      chatId,
      `✅ Angemeldet als <b>${fahrer.name}</b>.\n\nDu bekommst ab jetzt Fahraufträge hier herein. Tippe auf „Annehmen", wenn du eine Fahrt übernimmst – die Adresse erscheint danach.`,
    );
    return new Response('ok');
  }

  // --- Fahrer tippt auf Annehmen oder Ablehnen -----------------------------
  const knopf = update.callback_query;
  if (knopf?.data) {
    const [aktion, auftragId, fahrerIdText] = String(knopf.data).split(':');
    const fahrerId = Number(fahrerIdText);

    if (!auftragId || !Number.isFinite(fahrerId)) {
      await quittiereKnopf(env.TELEGRAM_TOKEN, knopf.id, 'Ungültige Angabe');
      return new Response('ok');
    }

    // Gehoert der Knopf wirklich zu diesem Chat? Schuetzt davor, dass ein
    // weitergeleiteter Knopf von einem fremden Konto gedrueckt wird.
    const chatId = String(knopf.message?.chat?.id ?? '');
    const passt = await env.DB.prepare(
      'SELECT 1 FROM fahrer WHERE id = ? AND telegram_chat_id = ?',
    )
      .bind(fahrerId, chatId)
      .first();

    if (!passt) {
      await quittiereKnopf(env.TELEGRAM_TOKEN, knopf.id, 'Nicht für dich bestimmt');
      return new Response('ok');
    }

    const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(auftragId));
    const ergebnis = (await (
      await objekt.fetch('https://vermittlung/antwort', {
        method: 'POST',
        body: JSON.stringify({ fahrerId, annahme: aktion === 'ja' }),
      })
    ).json()) as { ergebnis: string };

    const hinweise: Record<string, string> = {
      angenommen: 'Die Fahrt gehört dir.',
      vergeben: 'Schon vergeben.',
      abgelehnt: 'Abgelehnt.',
      unbekannt: 'Auftrag nicht gefunden.',
    };
    await quittiereKnopf(
      env.TELEGRAM_TOKEN,
      knopf.id,
      hinweise[ergebnis.ergebnis] ?? '',
    );
  }

  return new Response('ok');
}

/* ========================================================================== */
/*  Hilfen                                                                    */
/* ========================================================================== */

/**
 * ERLAUBTE_HERKUNFT darf mehrere Adressen mit Komma getrennt enthalten -
 * etwa die Live-Adresse und http://localhost:4321 zum Entwickeln.
 * Zurueckgegeben wird immer nur die eine, die tatsaechlich angefragt hat.
 */
function kopfzeilen(env: Umgebung, anfrage?: Request): HeadersInit {
  const erlaubte = (env.ERLAUBTE_HERKUNFT || '*')
    .split(',')
    .map((eintrag) => eintrag.trim())
    .filter(Boolean);

  const herkunft = anfrage?.headers.get('origin') ?? '';
  const passend = erlaubte.includes('*')
    ? '*'
    : erlaubte.includes(herkunft)
      ? herkunft
      : (erlaubte[0] ?? '*');

  return {
    'access-control-allow-origin': passend,
    // Sonst liefert ein Zwischenspeicher die Antwort fuer die falsche Adresse aus
    vary: 'Origin',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function antwort(
  daten: unknown,
  status: number,
  env: Umgebung,
  anfrage?: Request,
): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...kopfzeilen(env, anfrage),
    },
  });
}

function kurz(wert: unknown, laenge = MAX_LAENGE): string {
  return String(wert ?? '').trim().slice(0, laenge);
}

function zahl(wert: unknown, standard: number, min: number, max: number): number {
  const n = Number(wert);
  if (!Number.isFinite(n)) return standard;
  return Math.min(Math.max(Math.round(n), min), max);
}

/** Nimmt einen Zeitpunkt nur an, wenn er sich lesen laesst. */
function gueltigesDatum(wert: unknown): string {
  const text = String(wert ?? '').trim();
  if (!text) return '';
  const datum = new Date(text);
  return Number.isNaN(datum.getTime()) ? '' : datum.toISOString();
}

function plausibleTelefonnummer(wert: string): boolean {
  const ziffern = String(wert).replace(/[^0-9]/g, '');
  return ziffern.length >= 7 && ziffern.length <= 15;
}

/** Gesalzener Hash der IP - die Adresse selbst wird nicht gespeichert. */
async function ipKennung(anfrage: Request, env: Umgebung): Promise<string> {
  const ip = anfrage.headers.get('cf-connecting-ip') ?? 'unbekannt';
  const roh = new TextEncoder().encode(ip + '|' + env.TELEGRAM_WEBHOOK_GEHEIMNIS);
  const hash = await crypto.subtle.digest('SHA-256', roh);
  return [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function zuVieleBestellungen(
  kennung: string,
  env: Umgebung,
): Promise<boolean> {
  // Alte Eintraege wegraeumen - laenger als eine Stunde brauchen wir sie nicht
  await env.DB.prepare(
    "DELETE FROM drosselung WHERE zeitpunkt < datetime('now', '-1 hour')",
  ).run();

  const zeile = await env.DB.prepare(
    `SELECT COUNT(*) AS anzahl FROM drosselung
      WHERE kennung = ? AND zeitpunkt > datetime('now', '-1 hour')`,
  )
    .bind(kennung)
    .first<{ anzahl: number }>();

  return (zeile?.anzahl ?? 0) >= BESTELLUNGEN_PRO_STUNDE;
}
