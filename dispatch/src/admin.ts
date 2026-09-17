import type { Fahrer, Umgebung } from './typen';
import { preisBerechnen, taxiVergleich, tarifAusEinstellungen } from './preis';
import { fahrerEntfernen } from './fahrer-entfernen';
import { appDatei, rechnungenRoute } from './rechnungen';
import { auftraegeRoute } from './auftraege';
import { KANAELE } from './auftrag-erfassen';
import { html, seite, sicher } from './seite';

/**
 * Fahrerbereich fuer den Chef.
 *
 * Hier stehen die Handynummern der Beschaeftigten. Deshalb liegt dieser
 * Bereich hinter einem Passwort und bewusst NICHT im Git-Repository, aus dem
 * die oeffentliche Website gebaut wird.
 */

const KEKS = 'mrc_sitzung';
const SITZUNG_STUNDEN = 12;

export async function adminRoute(
  anfrage: Request,
  env: Umgebung,
): Promise<Response> {
  const url = new URL(anfrage.url);
  const pfad = url.pathname;

  if (pfad === '/fahrer/anmelden' && anfrage.method === 'POST') {
    return anmelden(anfrage, env);
  }

  if (pfad === '/fahrer/abmelden') {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/fahrer',
        'set-cookie': `${KEKS}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  // App-Symbol und Manifest holt das Handy ohne Anmeldekeks ab. Beides
  // enthaelt nichts Vertrauliches.
  const datei = appDatei(pfad);
  if (datei) return datei;

  if (!(await angemeldet(anfrage, env))) {
    return html(anmeldeSeite('', anfrage.method === 'GET' ? pfad : '/fahrer'), 200);
  }

  if (pfad === '/fahrer/rechnungen' || pfad.startsWith('/fahrer/rechnungen/')) {
    return rechnungenRoute(anfrage, env);
  }

  if (
    pfad === '/fahrer/auftrag' ||
    pfad.startsWith('/fahrer/auftrag/') ||
    pfad === '/fahrer/preis'
  ) {
    return auftraegeRoute(anfrage, env);
  }

  if (pfad === '/fahrer/neu' && anfrage.method === 'POST') {
    return fahrerAnlegen(anfrage, env);
  }
  if (pfad === '/fahrer/aendern' && anfrage.method === 'POST') {
    return fahrerAendern(anfrage, env);
  }
  if (pfad === '/fahrer/loeschen' && anfrage.method === 'POST') {
    return fahrerLoeschen(anfrage, env);
  }
  if (pfad === '/fahrer/einstellungen' && anfrage.method === 'POST') {
    return einstellungenSpeichern(anfrage, env);
  }

  return html(await uebersicht(env), 200);
}

/* ============================================================== Anmeldung */

async function anmelden(anfrage: Request, env: Umgebung): Promise<Response> {
  const formular = await anfrage.formData();
  const eingabe = String(formular.get('passwort') ?? '');

  const weiter = weiterNach(formular.get('weiter'));

  if (!gleichLang(eingabe, env.ADMIN_PASSWORT)) {
    return html(anmeldeSeite('Passwort stimmt nicht.', weiter), 401);
  }

  const ablauf = Date.now() + SITZUNG_STUNDEN * 3600_000;
  const wert = `${ablauf}.${await unterschreibe(String(ablauf), env)}`;

  return new Response(null, {
    status: 302,
    headers: {
      location: weiter,
      'set-cookie': `${KEKS}=${wert}; Path=/; Max-Age=${SITZUNG_STUNDEN * 3600}; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

async function angemeldet(anfrage: Request, env: Umgebung): Promise<boolean> {
  const keks = anfrage.headers.get('cookie') ?? '';
  const treffer = keks.match(new RegExp(`${KEKS}=([^;]+)`));
  if (!treffer) return false;

  const [ablaufText, unterschrift] = decodeURIComponent(treffer[1]!).split('.');
  if (!ablaufText || !unterschrift) return false;
  if (Number(ablaufText) < Date.now()) return false;

  return gleichLang(unterschrift, await unterschreibe(ablaufText, env));
}

async function unterschreibe(text: string, env: Umgebung): Promise<string> {
  const schluessel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_PASSWORT + env.TELEGRAM_WEBHOOK_GEHEIMNIS),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatur = await crypto.subtle.sign(
    'HMAC',
    schluessel,
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(signatur)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Vergleich ohne Zeitunterschied, damit sich das Passwort nicht erraten laesst. */
function gleichLang(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/* =============================================================== Aktionen */

function code(): string {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I, O, 0, 1
  const werte = crypto.getRandomValues(new Uint8Array(6));
  return [...werte].map((w) => zeichen[w % zeichen.length]).join('');
}

async function fahrerAnlegen(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  await env.DB.prepare(
    `INSERT INTO fahrer (name, telefon, anmeldecode, schicht, reihenfolge)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      String(f.get('name') ?? '').trim().slice(0, 80),
      String(f.get('telefon') ?? '').trim().slice(0, 40),
      code(),
      schichtWert(f.get('schicht')),
      Number(f.get('reihenfolge') ?? 10) || 10,
    )
    .run();
  return zurueck();
}

async function fahrerAendern(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  await env.DB.prepare(
    `UPDATE fahrer SET name = ?, telefon = ?, schicht = ?, reihenfolge = ?, aktiv = ?
      WHERE id = ?`,
  )
    .bind(
      String(f.get('name') ?? '').trim().slice(0, 80),
      String(f.get('telefon') ?? '').trim().slice(0, 40),
      schichtWert(f.get('schicht')),
      Number(f.get('reihenfolge') ?? 10) || 10,
      f.get('aktiv') ? 1 : 0,
      Number(f.get('id')),
    )
    .run();
  return zurueck();
}

async function fahrerLoeschen(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  // Nicht einfach DELETE: Fahrer mit frueheren Auftraegen liessen sich so nie
  // entfernen. Begruendung in fahrer-entfernen.ts
  await fahrerEntfernen(env.DB, Number(f.get('id')), code());
  return zurueck();
}

async function einstellungenSpeichern(
  anfrage: Request,
  env: Umgebung,
): Promise<Response> {
  const f = await anfrage.formData();
  const zahl = (feld: string, standard: number): string => {
    const wert = Number(String(f.get(feld) ?? '').replace(',', '.'));
    return String(Number.isFinite(wert) && wert >= 0 ? wert : standard);
  };

  const werte: [string, string][] = [
    ['nacht_von', String(f.get('nacht_von') ?? '22:00')],
    ['nacht_bis', String(f.get('nacht_bis') ?? '06:00')],
    ['antwortzeit_sekunden', String(Number(f.get('antwortzeit') ?? 40) || 40)],
    ['tarif_grundpreis', zahl('tarif_grundpreis', 3.5)],
    ['tarif_km_grenze', zahl('tarif_km_grenze', 4)],
    ['tarif_preis_nah', zahl('tarif_preis_nah', 2.6)],
    ['tarif_preis_fern', zahl('tarif_preis_fern', 2.2)],
    ['tarif_mindestpreis', zahl('tarif_mindestpreis', 12)],
    ['tarif_rundung', zahl('tarif_rundung', 0.5)],
  ];
  for (const [schluessel, wert] of werte) {
    await env.DB.prepare(
      'INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert',
    )
      .bind(schluessel, wert)
      .run();
  }
  return zurueck();
}

function schichtWert(wert: unknown): string {
  const s = String(wert ?? 'beide');
  return ['tag', 'nacht', 'beide'].includes(s) ? s : 'beide';
}

function zurueck(): Response {
  return new Response(null, { status: 302, headers: { location: '/fahrer' } });
}

/* ================================================================ Ansicht */

async function uebersicht(env: Umgebung): Promise<string> {
  const fahrer = await env.DB.prepare(
    'SELECT * FROM fahrer WHERE ausgeschieden = 0 ORDER BY reihenfolge, id',
  ).all<Fahrer>();

  const einstellungen = await env.DB.prepare(
    'SELECT schluessel, wert FROM einstellungen',
  ).all<{ schluessel: string; wert: string }>();
  const e: Record<string, string> = {};
  for (const z of einstellungen.results ?? []) e[z.schluessel] = z.wert;

  const auftraege = await env.DB.prepare(
    `SELECT a.id, a.eingang, a.status, a.kanal, a.zuweisungsart, a.art, a.abholung,
            a.kunde_name, f.name AS fahrername
       FROM auftraege a LEFT JOIN fahrer f ON f.id = a.fahrer_id
      ORDER BY a.eingang DESC LIMIT 25`,
  ).all<any>();

  const botName = env.TELEGRAM_BOT_NAME || 'DEIN_BOT';

  const tarif = tarifAusEinstellungen(e);
  const euro = (betrag: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag);

  // Zeigt sofort, wie sich eine Tarifaenderung auswirkt.
  //
  // 18,8 km ist die gemessene Strecke Feuerbach - Terminal. Vorher stand hier
  // 22 km: Das war der Doppelgaenger-Punkt am Ostende der Startbahn, der
  // Chef sah also einen Flughafenpreis, den kein Kunde zahlt.
  //
  // 2 km steht drin, damit sichtbar bleibt, dass der Mindestpreis sehr kurze
  // Fahrten teurer macht als das Taxi.
  const beispiele = [2, 3, 5, 10, 18.8, 40]
    .map((km) => {
      const unser = preisBerechnen(km, tarif);
      const taxi = taxiVergleich(km);
      const ersparnis = Math.round((1 - unser / taxi) * 100);
      // Haengt vom eingestellten Tarif ab, nicht von der Kilometerzahl
      const text =
        km === 18.8 ? 'Feuerbach – Flughafen' : unser === tarif.mindestpreis ? 'Mindestpreis' : '';
      const hinweis = text ? ` <span class="klein">(${text})</span>` : '';
      return `<tr>
        <td>${String(km).replace('.', ',')} km${hinweis}</td>
        <td><strong>${euro(unser)}</strong></td>
        <td class="klein">${euro(taxi)}</td>
        <td class="${ersparnis > 0 ? 'ja' : 'nein'}">${ersparnis > 0 ? '−' : '+'}${Math.abs(ersparnis)} %</td>
      </tr>`;
    })
    .join('');

  const zeilen = (fahrer.results ?? [])
    .map((fa) => {
      const angemeldet = fa.telegram_chat_id
        ? '<span class="ja">✓ angemeldet</span>'
        : `<span class="nein">nicht angemeldet</span><br><a class="klein" href="https://t.me/${botName}?start=${fa.anmeldecode}" target="_blank">t.me/${botName}?start=${fa.anmeldecode}</a>`;

      return `
      <tr>
        <td>
          <form method="post" action="/fahrer/aendern" class="zeile">
            <input type="hidden" name="id" value="${fa.id}">
            <input name="name" value="${sicher(fa.name)}" required>
            <input name="telefon" value="${sicher(fa.telefon)}" placeholder="Telefon">
            <select name="schicht">
              <option value="tag" ${fa.schicht === 'tag' ? 'selected' : ''}>Tag</option>
              <option value="nacht" ${fa.schicht === 'nacht' ? 'selected' : ''}>Nacht</option>
              <option value="beide" ${fa.schicht === 'beide' ? 'selected' : ''}>Beide</option>
            </select>
            <input name="reihenfolge" type="number" min="1" value="${fa.reihenfolge}" title="Kleinere Zahl wird zuerst gefragt" style="width:4.5rem">
            <label class="haken"><input type="checkbox" name="aktiv" ${fa.aktiv ? 'checked' : ''}> aktiv</label>
            <button>Speichern</button>
          </form>
        </td>
        <td>${angemeldet}</td>
        <td>
          <form method="post" action="/fahrer/loeschen" onsubmit="return confirm('${sicher(fa.name)} entfernen?\\n\\nFalls er schon Aufträge hatte, bleibt sein Name in der Auftragsliste stehen. Telefonnummer und Telegram-Verbindung werden gelöscht.')">
            <input type="hidden" name="id" value="${fa.id}">
            <button class="rot">Löschen</button>
          </form>
        </td>
      </tr>`;
    })
    .join('');

  const auftragsZeilen = (auftraege.results ?? [])
    .map(
      (a: any) => `
      <tr>
        <td class="klein">${sicher(a.eingang)}</td>
        <td class="klein">${KANAELE[a.kanal] ?? 'Website'}</td>
        <td>${statusPunkt(a.status)}</td>
        <td>${sicher(a.art)}</td>
        <td class="klein">${sicher(a.abholung)}</td>
        <td>${sicher(a.kunde_name)}</td>
        <td>${sicher(a.fahrername ?? '–')}${a.zuweisungsart === 'fest' ? ' <span class="klein">(eingeteilt)</span>' : ''}</td>
      </tr>`,
    )
    .join('');

  return seite(`
    <div class="kopf">
      <h1>Fahrer &amp; Aufträge</h1>
      <span><a href="/fahrer/auftrag">Auftrag aufnehmen</a> · <a href="/fahrer/rechnungen">Rechnungen</a>
        · <a class="klein" href="/fahrer/abmelden">Abmelden</a></span>
    </div>

    <h2>Fahrerinnen und Fahrer</h2>
    <p class="hinweis">
      Ein neuer Fahrer bekommt einen Anmeldelink. Sobald er ihn in Telegram
      öffnet, steht hier „angemeldet“ – erst dann kann er Aufträge empfangen.
      Die Zahl steuert die Reihenfolge: Wer die kleinste Zahl hat, wird zuerst gefragt.
    </p>
    <table>
      <thead><tr><th>Fahrer</th><th>Telegram</th><th></th></tr></thead>
      <tbody>${zeilen || '<tr><td colspan="3" class="hinweis">Noch niemand angelegt.</td></tr>'}</tbody>
    </table>

    <h2>Neuen Fahrer anlegen</h2>
    <form method="post" action="/fahrer/neu" class="zeile">
      <input name="name" placeholder="Name" required>
      <input name="telefon" placeholder="Telefon">
      <select name="schicht">
        <option value="beide">Beide Schichten</option>
        <option value="tag">Nur Tag</option>
        <option value="nacht">Nur Nacht</option>
      </select>
      <input name="reihenfolge" type="number" min="1" value="10" style="width:4.5rem">
      <button class="cyan">Anlegen</button>
    </form>

    <h2>Einstellungen</h2>
    <form method="post" action="/fahrer/einstellungen" class="zeile">
      <label>Nacht von <input name="nacht_von" value="${e.nacht_von ?? '22:00'}" style="width:6rem"></label>
      <label>bis <input name="nacht_bis" value="${e.nacht_bis ?? '06:00'}" style="width:6rem"></label>
      <label>Antwortzeit <input name="antwortzeit" type="number" min="10" max="300" value="${e.antwortzeit_sekunden ?? '40'}" style="width:5rem"> Sek.</label>
      <button>Speichern</button>
    </form>

    <h2>Festpreise</h2>
    <p class="hinweis">
      Diese Werte bestimmen, welchen Preis der Kunde vor der Bestellung
      angezeigt bekommt. <strong>Ein angezeigter Preis ist verbindlich</strong> –
      bitte nur mit Bedacht ändern.
    </p>
    <form method="post" action="/fahrer/einstellungen" class="zeile">
      <input type="hidden" name="nacht_von" value="${e.nacht_von ?? '22:00'}">
      <input type="hidden" name="nacht_bis" value="${e.nacht_bis ?? '06:00'}">
      <input type="hidden" name="antwortzeit" value="${e.antwortzeit_sekunden ?? '40'}">
      <label>Grundpreis <input name="tarif_grundpreis" value="${tarif.grundpreis}" style="width:5rem"> €</label>
      <label>bis <input name="tarif_km_grenze" value="${tarif.kmGrenze}" style="width:4rem"> km je
        <input name="tarif_preis_nah" value="${tarif.preisNah}" style="width:5rem"> €</label>
      <label>danach je <input name="tarif_preis_fern" value="${tarif.preisFern}" style="width:5rem"> €</label>
      <label>Mindestens <input name="tarif_mindestpreis" value="${tarif.mindestpreis}" style="width:5rem"> €</label>
      <label>Aufrunden auf <input name="tarif_rundung" value="${tarif.rundung}" style="width:4.5rem"> €</label>
      <button>Speichern</button>
    </form>

    <table>
      <thead><tr><th>Strecke</th><th>Euer Preis</th><th>Taxi Stuttgart</th><th>Ersparnis</th></tr></thead>
      <tbody>${beispiele}</tbody>
    </table>

    <h2>Letzte Aufträge</h2>
    <p class="hinweis">
      Der Eingang jedes Auftrags wird festgehalten – das verlangt § 49 PBefG
      für Mietwagenunternehmen. Telefonische Aufträge gehören deshalb ebenfalls
      hier herein: <a href="/fahrer/auftrag">Auftrag aufnehmen</a>.
    </p>
    <table>
      <thead><tr><th>Eingang</th><th>Über</th><th>Status</th><th>Anlass</th><th>Abholung</th><th>Fahrgast</th><th>Fahrer</th></tr></thead>
      <tbody>${auftragsZeilen || '<tr><td colspan="7" class="hinweis">Noch keine Aufträge.</td></tr>'}</tbody>
    </table>
  `);
}

function statusPunkt(status: string): string {
  const farben: Record<string, string> = {
    angenommen: 'ja',
    vermittlung: 'warte',
    niemand: 'nein',
    storniert: 'nein',
  };
  const texte: Record<string, string> = {
    angenommen: 'angenommen',
    vermittlung: 'läuft',
    niemand: 'kein Fahrer',
    storniert: 'storniert',
  };
  return `<span class="${farben[status] ?? ''}">${texte[status] ?? status}</span>`;
}

/**
 * Wohin es nach der Anmeldung geht. Die Rechnungs-App auf dem Startbildschirm
 * soll nach dem Anmelden bei den Rechnungen landen, nicht bei den Fahrern.
 * Nur Pfade im Fahrerbereich - sonst liesse sich die Anmeldung als
 * Weiterleitung auf fremde Seiten missbrauchen.
 */
function weiterNach(wert: unknown): string {
  const pfad = String(wert ?? '');
  return /^\/fahrer(\/[\w\-/.]*)?$/.test(pfad) && !pfad.startsWith('/fahrer/anmelden')
    ? pfad
    : '/fahrer';
}

function anmeldeSeite(fehler = '', weiter = '/fahrer'): string {
  return seite(`
    <h1>Fahrerbereich</h1>
    ${fehler ? `<p class="fehler">${fehler}</p>` : ''}
    <form method="post" action="/fahrer/anmelden" class="zeile">
      <input type="hidden" name="weiter" value="${sicher(weiterNach(weiter))}">
      <input type="password" name="passwort" placeholder="Passwort" autofocus required>
      <button class="cyan">Anmelden</button>
    </form>
  `);
}

