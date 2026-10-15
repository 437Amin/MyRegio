import type { Bestellung, Fahrer, StatusAntwort, Umgebung } from './typen';
import { gueltigerWunschfahrer, oeffentlicheFahrer } from './fahrer-liste';
import { quittiereKnopf, sendeNachricht, setzeTelegramBasis } from './telegram';
import { adminRoute } from './admin';
import { adressenVorschlagen } from './strecke';
import { HEIMAT, festpreisErmitteln, pruefePunkt, type Punkt } from './festpreis';
import { plausibleEmail, plausibleTelefonnummer } from './auftrag-erfassen';
import { standortLesen, standortmeldung } from './standort';
import { ankunftstext } from './ankunft';
import { ausSpeicher, inSpeicher } from './adressen-speicher';
import { nachrichtentext } from './fahrgast-nachricht';
import {
  laufendeFahrtVon,
  nachrichtAblegen,
  nachrichtPruefen,
  verlaufLesen,
} from './fahrt-nachrichten';

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
// Grosszuegig: Eine Preisabfrage kostet nur dann etwas beim Kartendienst,
// wenn die Strecke noch nicht im Speicher liegt. Zu enge Grenzen fuehren
// dazu, dass echte Kunden "Preis auf Anfrage" sehen - und dann ist die
// ganze Funktion nutzlos.
const PREISE_PRO_STUNDE = 200;
const ADRESSEN_PRO_STUNDE = 400;

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

      if (pfad === '/api/adressen' && anfrage.method === 'GET') {
        return await adressenAnfragen(url, env, anfrage);
      }

      if (pfad === '/api/nachricht' && anfrage.method === 'POST') {
        return await nachrichtSenden(anfrage, env);
      }

      if (pfad === '/api/fahrer' && anfrage.method === 'GET') {
        return await fahrerAnfragen(env, anfrage);
      }

      if (pfad === '/api/preis' && anfrage.method === 'POST') {
        return await preisAnfragen(anfrage, env);
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

  // Die Adresse ist freiwillig. Wer sie angibt, hat damit zugestimmt, nach
  // der Fahrt einmal von uns zu hoeren - so steht es im Formular. Eine
  // unbrauchbare Adresse wird abgewiesen und nicht einfach verworfen: Sonst
  // bestellt jemand mit Rechnungswunsch und bekommt kommentarlos keine.
  const rechnungGewuenscht = Boolean(roh.rechnungGewuenscht);
  const kundeEmail = kurz(roh.kundeEmail, 254);
  if ((kundeEmail || rechnungGewuenscht) && !plausibleEmail(kundeEmail)) {
    return antwort(
      { fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' },
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

  // Den Wunschfahrer nachschlagen, bevor er in die Datenbank geht. Eine
  // unbekannte Nummer - etwa aus einer lange offenen Seite, deren Fahrer
  // inzwischen ausgetragen wurde - wuerde sonst am Fremdschluessel scheitern
  // und die ganze Bestellung abbrechen. Die Fahrt ist wichtiger als der Wunsch.
  const wunschFahrerId = await gueltigerWunschfahrer(roh.wunschFahrerId, env.DB);

  // Der Preis wird hier neu gerechnet und NICHT aus dem Browser uebernommen.
  // Faellt die Ermittlung aus, bleibt er bei 0 - dann wird er wie frueher
  // individuell abgesprochen, statt einen falschen Betrag festzuschreiben.
  const vonPunkt = pruefePunkt(roh.vonPunkt);
  const festpreis = await festpreisErmitteln(
    kurz(roh.abholung),
    kurz(roh.ziel ?? ''),
    env,
    vonPunkt,
    pruefePunkt(roh.nachPunkt),
  );

  await env.DB.prepare(
    `INSERT INTO auftraege
       (id, art, abholung, ziel, wunschzeit, wunsch_iso, sofort, personen, gepaeck,
        kindersitze, anmerkung, preis, strecke_km, kunde_name, kunde_telefon,
        wunsch_fahrer_id, rechnung_gewuenscht, bewertung_gewuenscht, kunde_email,
        von_breite, von_laenge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      festpreis?.preis ?? 0,
      festpreis?.km ?? 0,
      kurz(roh.name),
      kurz(roh.telefon, 40),
      wunschFahrerId,
      rechnungGewuenscht ? 1 : 0,
      // Festgehalten, wozu der Fahrgast ja gesagt hat: Mit der Adresse kam
      // die Zustimmung zur Nachricht nach der Fahrt.
      kundeEmail ? 1 : 0,
      kundeEmail,
      // Nur vorhanden, wenn der Fahrgast die Adresse aus den Vorschlaegen
      // gewaehlt hat. Ohne Punkt gibt es spaeter keine Ankunftszeit.
      vonPunkt?.breite ?? 0,
      vonPunkt?.laenge ?? 0,
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
    `SELECT a.status, a.angenommen_um, a.wunsch_fahrer_id, a.fahrer_id,
            a.von_breite, a.von_laenge, a.beendet_um, a.abgeholt_um,
            f.name AS fahrername
       FROM auftraege a
       LEFT JOIN fahrer f ON f.id = a.fahrer_id
      WHERE a.id = ?`,
  )
    .bind(id)
    .first<{
      status: string;
      angenommen_um: string | null;
      wunsch_fahrer_id: number | null;
      fahrer_id: number | null;
      von_breite: number;
      von_laenge: number;
      beendet_um: string | null;
      abgeholt_um: string | null;
      fahrername: string | null;
    }>();

  if (!zeile) return antwort({ fehler: 'Unbekannter Auftrag' }, 404, env,
      anfrage,);

  const ergebnis: StatusAntwort = {
    status: zeile.status as StatusAntwort['status'],
    // Nur der Vorname - mehr braucht der Fahrgast nicht zu wissen
    fahrer: zeile.fahrername?.split(' ')[0],
    angenommenUm: zeile.angenommen_um ?? undefined,
    // Damit die Seite sagen kann: "Ihr Wunschfahrer war nicht verfuegbar"
    wunschVerfehlt: Boolean(
      zeile.wunsch_fahrer_id &&
        zeile.fahrer_id &&
        zeile.wunsch_fahrer_id !== zeile.fahrer_id,
    ),
    ankunft: (await ankunftSatz(zeile, env)) ?? undefined,
    // Damit die Seite aufhoeren kann nachzufragen
    beendet: Boolean(zeile.beendet_um),
    abgeholt: Boolean(zeile.abgeholt_um),
    verlauf: zeile.beendet_um ? undefined : await verlaufLesen(env.DB, id),
  };
  return antwort(ergebnis, 200, env, anfrage);
}

/**
 * Der Fahrer schreibt zurueck.
 *
 * Seine Nachricht landet auf der Seite des Fahrgasts, der gerade auf ihn
 * wartet. Hat er keine laufende Fahrt, sagen wir es ihm - sonst schriebe er
 * ins Leere und wuerde sich wundern, warum niemand antwortet.
 */
async function antwortAnnehmen(
  chatId: string,
  text: string,
  env: Umgebung,
): Promise<Response> {
  const geprueft = nachrichtPruefen(text);
  // Befehle und Leeres stillschweigend uebergehen
  if (!geprueft.ok) {
    if (geprueft.grund.startsWith('zu lang')) {
      await sendeNachricht(env.TELEGRAM_TOKEN, chatId, `⚠️ Nachricht ${geprueft.grund}.`);
    }
    return new Response('ok');
  }

  const fahrt = await laufendeFahrtVon(env.DB, chatId);
  if (!fahrt) {
    await sendeNachricht(
      env.TELEGRAM_TOKEN,
      chatId,
      'Du hast gerade keine laufende Fahrt – diese Nachricht erreicht niemanden.',
    );
    return new Response('ok');
  }

  const ergebnis = await nachrichtAblegen(
    env.DB,
    fahrt.auftragId,
    'fahrer',
    geprueft.text,
  );
  await sendeNachricht(
    env.TELEGRAM_TOKEN,
    chatId,
    ergebnis === 'abgelegt'
      ? '✓ Der Fahrgast sieht es auf seiner Seite.'
      : '⚠️ Für diese Fahrt sind genug Nachrichten raus – bitte ruf den Fahrgast an.',
  );
  return new Response('ok');
}

/**
 * Der Fahrgast schreibt dem Fahrer.
 *
 * Nur waehrend einer laufenden Fahrt und nur an den Fahrer, der sie hat.
 * Rufnummern werden dabei auf keiner Seite sichtbar - die Nachricht geht
 * ueber den Bot. Die Regeln zum Text stehen in fahrgast-nachricht.ts.
 */
async function nachrichtSenden(anfrage: Request, env: Umgebung): Promise<Response> {
  const roh = (await anfrage.json().catch(() => null)) as {
    auftragId?: string;
    text?: string;
  } | null;

  const auftragId = kurz(roh?.auftragId, 60);
  if (!auftragId) return antwort({ fehler: 'Unbekannte Fahrt' }, 400, env, anfrage);

  const geprueft = nachrichtPruefen(roh?.text);
  if (!geprueft.ok) return antwort({ fehler: geprueft.grund }, 400, env, anfrage);

  const zeile = await env.DB.prepare(
    `SELECT a.kunde_name, a.beendet_um, a.status, f.telegram_chat_id
       FROM auftraege a JOIN fahrer f ON f.id = a.fahrer_id
      WHERE a.id = ?`,
  )
    .bind(auftragId)
    .first<{
      kunde_name: string;
      beendet_um: string | null;
      status: string;
      telegram_chat_id: string | null;
    }>();

  // Nach der Fahrt gibt es nichts mehr auszurichten - und vorher weiss
  // niemand, an wen.
  if (!zeile || zeile.status !== 'angenommen' || zeile.beendet_um || !zeile.telegram_chat_id) {
    return antwort(
      { fehler: 'Für diese Fahrt ist gerade kein Fahrer erreichbar.' },
      409,
      env,
      anfrage,
    );
  }

  // Je Fahrt begrenzt: Wer mehr zu sagen hat, soll anrufen. Gezaehlt wird am
  // Verlauf selbst - beide Richtungen zusammen.
  const abgelegt = await nachrichtAblegen(
    env.DB,
    auftragId,
    'fahrgast',
    geprueft.text,
  );
  if (abgelegt === 'zu-viele') {
    return antwort(
      { fehler: 'Bitte rufen Sie an – mehr Nachrichten gehen für diese Fahrt nicht.' },
      429,
      env,
      anfrage,
    );
  }

  const ergebnis = await sendeNachricht(
    env.TELEGRAM_TOKEN,
    zeile.telegram_chat_id,
    nachrichtentext(zeile.kunde_name, geprueft.text),
  );

  if (!ergebnis.ok) {
    return antwort(
      { fehler: 'Die Nachricht ging nicht durch. Bitte rufen Sie an.' },
      502,
      env,
      anfrage,
    );
  }

  return antwort({ gesendet: true }, 200, env, anfrage);
}

/**
 * Der Satz zur Ankunft - oder nichts.
 *
 * Nach aussen geht nie der Standort des Fahrers, sondern nur eine geschaetzte
 * Zeit. Und nur, solange die Fahrt laeuft: Danach hat niemand mehr ein
 * berechtigtes Interesse daran, wo der Wagen gerade steht.
 */
async function ankunftSatz(
  zeile: {
    status: string;
    fahrer_id: number | null;
    von_breite: number;
    von_laenge: number;
    beendet_um: string | null;
    abgeholt_um: string | null;
  },
  env: Umgebung,
): Promise<string | null> {
  if (zeile.status !== 'angenommen' || zeile.beendet_um || !zeile.fahrer_id) return null;
  // Wer im Auto sitzt, braucht keine Ankunftszeit mehr - sie rechnet zur
  // Abholadresse und waere ab jetzt schlicht falsch.
  if (zeile.abgeholt_um) return null;
  if (!zeile.von_breite || !zeile.von_laenge) return null;

  const standort = await standortLesen(env.DB, zeile.fahrer_id);
  return ankunftstext(
    standort,
    { breite: zeile.von_breite, laenge: zeile.von_laenge },
    new Date(),
  );
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

  // --- Fahrer teilt seinen Live-Standort ----------------------------------
  // Telegram schickt den ersten Punkt als Nachricht und jede Aktualisierung
  // als bearbeitete Nachricht. Beides faengt standortmeldung() ab; alles
  // Weitere laeuft unveraendert.
  if (await standortmeldung(update, env)) return new Response('ok');

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
      'SELECT id, name FROM fahrer WHERE anmeldecode = ? AND ausgeschieden = 0',
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

  // --- Fahrer schreibt dem Fahrgast ---------------------------------------
  // Alles, was kein Befehl ist, geht an den Fahrgast der laufenden Fahrt.
  // Kein Knopf, kein Umweg: Er tippt einfach in den Chat.
  if (text && update.message?.chat?.id) {
    return await antwortAnnehmen(String(update.message.chat.id), text, env);
  }

  // --- Fahrer tippt auf Annehmen oder Ablehnen -----------------------------
  const knopf = update.callback_query;
  if (knopf?.data) {
    // "fertig" traegt einen vierten Teil: wie bezahlt wurde. Er steht nur an
    // Fahrten, zu denen eine Rechnung gewuenscht ist.
    const [aktion, auftragId, fahrerIdText, zahlungsart] = String(knopf.data).split(':');
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

    // "fertig" und "weg" stehen an zugewiesenen Fahrten: Der Fahrer meldet
    // sich nach der Fahrt frei oder gibt sie zurueck.
    const pfad =
      aktion === 'fertig'
        ? '/erledigt'
        : aktion === 'weg'
          ? '/abgeben'
          : aktion === 'abgeholt'
            ? '/abgeholt'
            : '/antwort';

    const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(auftragId));
    const ergebnis = (await (
      await objekt.fetch(`https://vermittlung${pfad}`, {
        method: 'POST',
        body: JSON.stringify({ fahrerId, annahme: aktion === 'ja', zahlungsart }),
      })
    ).json()) as { ergebnis: string };

    const hinweise: Record<string, string> = {
      angenommen: 'Die Fahrt gehört dir.',
      vergeben: 'Schon vergeben.',
      abgelehnt: 'Abgelehnt.',
      erledigt: 'Danke, du bekommst wieder Aufträge.',
      abgeholt: 'Notiert – gute Fahrt!',
      abgegeben: 'Die Fahrt wird neu ausgeschrieben.',
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
  grenze = BESTELLUNGEN_PRO_STUNDE,
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

  return (zeile?.anzahl ?? 0) >= grenze;
}


/* ========================================================================== */
/*  Festpreis                                                                 */
/* ========================================================================== */

/**
 * Ermittelt den Festpreis fuer eine Strecke.
 *
 * Kann eine Adresse nicht sicher zugeordnet werden, liefern wir bewusst
 * keinen Preis. Ein falscher Festpreis waere bindend - "auf Anfrage" ist
 * dann das ehrlichere Ergebnis.
 */
async function preisAnfragen(anfrage: Request, env: Umgebung): Promise<Response> {
  const roh = (await anfrage.json().catch(() => null)) as {
    von?: string;
    nach?: string;
    vonPunkt?: Punkt;
    nachPunkt?: Punkt;
  } | null;

  if (!roh || (!roh.von && !roh.vonPunkt) || (!roh.nach && !roh.nachPunkt)) {
    return antwort({ aufAnfrage: true, grund: 'unvollstaendig' }, 200, env, anfrage);
  }

  if (!env.ORS_SCHLUESSEL) {
    return antwort({ aufAnfrage: true, grund: 'nicht-eingerichtet' }, 200, env, anfrage);
  }

  // Auch diese Abfrage kostet Kontingent beim Kartendienst
  const kennung = 'preis-' + (await ipKennung(anfrage, env));
  if (await zuVieleBestellungen(kennung, env, PREISE_PRO_STUNDE)) {
    return antwort({ aufAnfrage: true, grund: 'zu-viele' }, 200, env, anfrage);
  }
  await env.DB.prepare('INSERT INTO drosselung (kennung) VALUES (?)')
    .bind(kennung)
    .run();

  const ergebnis = await festpreisErmitteln(
    kurz(roh.von ?? ''),
    kurz(roh.nach ?? ''),
    env,
    pruefePunkt(roh.vonPunkt),
    pruefePunkt(roh.nachPunkt),
  );

  if (!ergebnis) {
    return antwort(
      { aufAnfrage: true, grund: 'adresse-unklar' },
      200,
      env,
      anfrage,
    );
  }

  return antwort(
    {
      preis: ergebnis.preis,
      streckeKm: ergebnis.km,
      dauerMinuten: ergebnis.minuten,
      // Zurueckgespiegelt, damit ein Tippfehler auffaellt, bevor bestellt wird
      vonErkannt: ergebnis.vonErkannt,
      nachErkannt: ergebnis.nachErkannt,
    },
    200,
    env,
    anfrage,
  );
}


/**
 * Die Fahrer zur Auswahl im Buchungsassistenten.
 *
 * Nach aussen gehen nur Nummer und Vorname - was gefiltert wird und warum,
 * steht in fahrer-liste.ts. Ohne Drosselung: Die Antwort kostet nichts und
 * steht ohnehin auf jeder Seite der Website.
 */
async function fahrerAnfragen(env: Umgebung, anfrage: Request): Promise<Response> {
  const alle = await env.DB.prepare(
    'SELECT * FROM fahrer WHERE ausgeschieden = 0 ORDER BY reihenfolge, id',
  ).all<Fahrer>();

  return antwort({ fahrer: oeffentlicheFahrer(alle.results ?? []) }, 200, env, anfrage);
}

/** Adressvorschlaege fuer die Eingabefelder im Buchungsassistenten. */
async function adressenAnfragen(
  url: URL,
  env: Umgebung,
  anfrage: Request,
): Promise<Response> {
  const gesuch = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (gesuch.length < 3) {
    return antwort({ vorschlaege: [] }, 200, env, anfrage);
  }

  // Erst im eigenen Speicher nachsehen - VOR der Pruefung auf den
  // Kartendienst. Sonst stuende der Speicher genau dann nicht zur Verfuegung,
  // wenn man ihn am noetigsten braucht: wenn der Kartendienst ausfaellt oder
  // sein Kontingent erschoepft ist. Gespart wird dabei auch die Drosselung,
  // weil keine fremde Anfrage ausgeloest wird.
  const gespeichert = await ausSpeicher(env.DB, gesuch);
  if (gespeichert) {
    return antwort({ vorschlaege: gespeichert }, 200, env, anfrage);
  }

  if (!env.ORS_SCHLUESSEL) {
    return antwort({ vorschlaege: [] }, 200, env, anfrage);
  }

  const kennung = 'adr-' + (await ipKennung(anfrage, env));
  if (await zuVieleBestellungen(kennung, env, ADRESSEN_PRO_STUNDE)) {
    return antwort({ vorschlaege: [] }, 200, env, anfrage);
  }
  await env.DB.prepare('INSERT INTO drosselung (kennung) VALUES (?)')
    .bind(kennung)
    .run();

  const treffer = await adressenVorschlagen(
    gesuch,
    env.ORS_SCHLUESSEL,
    HEIMAT.breite,
    HEIMAT.laenge,
  );

  const vorschlaege = treffer.map((ort) => ({
    text: ort.bezeichnung,
    breite: ort.breite,
    laenge: ort.laenge,
  }));

  // Nur echte Treffer merken - siehe adressen-speicher.ts
  await inSpeicher(env.DB, gesuch, vorschlaege);

  return antwort({ vorschlaege }, 200, env, anfrage);
}
