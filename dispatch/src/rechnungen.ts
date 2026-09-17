import type { Umgebung } from './typen';
import { APP_SYMBOLE } from './app-symbole';
import {
  PFLICHT_ABSENDER,
  ZAHLUNGSARTEN,
  absenderAusEinstellungen,
  betragFuerEingabe,
  datumDeutsch,
  euro,
  heuteInDeutschland,
  ibanPruefen,
  rechnungPruefen,
  rechnungsnummer,
  type Absender,
  type Rechnung,
  type RechnungsEingabe,
} from './rechnung';
import {
  letzteRechnungen,
  rechnungAnlegen,
  rechnungLaden,
  rechnungStornieren,
  type RechnungMitStorno,
} from './rechnung-ablage';
import { rechnungAlsPdf } from './rechnung-pdf';
import { html, seite, sicher } from './seite';
import { VORSCHLAEGE_SKRIPT, VORSCHLAG_STIL, adressfeld } from './vorschlagfeld';

/**
 * Rechnungen fuer Fahrten - im Fahrerbereich hinter dem Passwort.
 *
 * Start, Ziel und Preis eintragen, fertig ist das PDF fuer den Fahrgast.
 * Laesst sich auf dem Handy zum Startbildschirm hinzufuegen und oeffnet dann
 * wie eine App. Die Anmeldung prueft admin.ts, bevor es hier ankommt.
 */

export async function rechnungenRoute(anfrage: Request, env: Umgebung): Promise<Response> {
  const url = new URL(anfrage.url);
  const pfad = url.pathname;
  const post = anfrage.method === 'POST';

  if (pfad === '/fahrer/rechnungen/neu' && post) {
    return rechnungErstellen(anfrage, env);
  }
  if (pfad === '/fahrer/rechnungen/absender' && post) {
    return absenderSpeichern(anfrage, env);
  }

  const storno = pfad.match(/^\/fahrer\/rechnungen\/(\d+)\/stornieren$/);
  if (storno && post) {
    return stornieren(Number(storno[1]), env);
  }

  const pdf = pfad.match(/^\/fahrer\/rechnungen\/(\d+)\/[\w-]+\.pdf$/);
  if (pdf) {
    return pdfAusliefern(Number(pdf[1]), env);
  }

  const einzeln = pfad.match(/^\/fahrer\/rechnungen\/(\d+)$/);
  if (einzeln) {
    const r = await rechnungLaden(env.DB, Number(einzeln[1]));
    if (!r) return html(seite('<h1>Rechnung nicht gefunden</h1><p><a href="/fahrer/rechnungen">Zu den Rechnungen</a></p>', { titel: 'Rechnungen' }), 404);
    return html(await einzelSeite(r, env, url.searchParams.has('neu')), 200);
  }

  return html(await uebersicht(env, { gespeichert: url.searchParams.has('gespeichert') }), 200);
}

/* =============================================================== Aktionen */

async function rechnungErstellen(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  const eingabe: RechnungsEingabe = {
    von: String(f.get('von') ?? ''),
    nach: String(f.get('nach') ?? ''),
    betrag: String(f.get('betrag') ?? ''),
    fahrtdatum: String(f.get('fahrtdatum') ?? ''),
    kundeName: String(f.get('kunde_name') ?? ''),
    kundeAnschrift: String(f.get('kunde_anschrift') ?? ''),
    zahlungsart: String(f.get('zahlungsart') ?? ''),
  };

  const heute = heuteInDeutschland(new Date());
  const absender = await ladeAbsender(env);
  const ergebnis = rechnungPruefen(eingabe, heute);

  const fehler = 'fehler' in ergebnis ? [...ergebnis.fehler] : [];
  if (eingabe.zahlungsart === 'ueberweisung' && !absender.iban) {
    fehler.push('Für „Per Überweisung“ fehlt noch die Bankverbindung – bitte unten unter „Firmendaten“ eintragen.');
  }
  if ('fehler' in ergebnis || fehler.length > 0) {
    return html(await uebersicht(env, { eingabe, fehler }), 422);
  }

  const id = await rechnungAnlegen(env.DB, ergebnis.rechnung, absender, heute);
  return weiter(`/fahrer/rechnungen/${id}?neu`);
}

async function stornieren(id: number, env: Umgebung): Promise<Response> {
  const heute = heuteInDeutschland(new Date());
  const stornoId = await rechnungStornieren(env.DB, id, await ladeAbsender(env), heute);
  // Null: gibt es nicht oder ist selbst eine Stornorechnung
  return weiter(stornoId ? `/fahrer/rechnungen/${stornoId}?neu` : `/fahrer/rechnungen/${id}`);
}

async function pdfAusliefern(id: number, env: Umgebung): Promise<Response> {
  const r = await rechnungLaden(env.DB, id);
  if (!r) return new Response('Rechnung nicht gefunden', { status: 404 });

  const original = r.storno_von ? await rechnungLaden(env.DB, r.storno_von) : null;
  const pdf = await rechnungAlsPdf(r, original);

  return new Response(pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${dateiname(r)}"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

async function absenderSpeichern(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  const werte: Record<string, string> = {};
  for (const [feld] of ABSENDER_FELDER) {
    werte[feld] = String(f.get(feld) ?? '').trim().slice(0, 120);
  }

  const iban = ibanPruefen(werte.iban ?? '');
  if (iban === null) {
    return html(
      await uebersicht(env, {
        absenderEingabe: werte,
        absenderFehler: 'Die IBAN stimmt nicht – bitte auf Zahlendreher prüfen. Es wurde nichts gespeichert.',
      }),
      422,
    );
  }
  werte.iban = iban;

  for (const [feld, wert] of Object.entries(werte)) {
    await env.DB.prepare(
      'INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert',
    )
      .bind(`rechnung_${feld}`, wert)
      .run();
  }
  return weiter('/fahrer/rechnungen?gespeichert#firmendaten');
}

/* ================================================================ Ansicht */

const ABSENDER_FELDER: [keyof Absender, string][] = [
  ['firma', 'Firmenname'],
  ['strasse', 'Straße und Hausnummer'],
  ['ort', 'PLZ und Ort'],
  ['telefon', 'Telefon'],
  ['email', 'E-Mail'],
  ['steuernummer', 'USt-IdNr. oder Steuernummer'],
  ['iban', 'IBAN (für Überweisungen)'],
  ['bank', 'Name der Bank'],
];

async function uebersicht(
  env: Umgebung,
  {
    eingabe,
    fehler = [],
    absenderEingabe,
    absenderFehler,
    gespeichert = false,
  }: {
    eingabe?: RechnungsEingabe;
    fehler?: string[];
    absenderEingabe?: Record<string, string>;
    absenderFehler?: string;
    gespeichert?: boolean;
  },
): Promise<string> {
  const heute = heuteInDeutschland(new Date());
  const e: RechnungsEingabe = eingabe ?? {
    von: '',
    nach: '',
    betrag: '',
    fahrtdatum: heute,
    kundeName: '',
    kundeAnschrift: '',
    zahlungsart: 'bar',
  };
  const absender: Record<string, string> = absenderEingabe ?? { ...(await ladeAbsender(env)) };
  const rechnungen = await letzteRechnungen(env.DB);

  const fahrgastOffen = Boolean(e.kundeName || e.kundeAnschrift || fehler.some((t) => t.includes('Anschrift')));

  const liste = rechnungen
    .map((r) => {
      const nummer = rechnungsnummer(r.jahr, r.laufnummer);
      const zustand = r.storno_von
        ? '<span class="marke warte">Storno</span>'
        : r.storniert_durch
          ? '<span class="marke nein">storniert</span>'
          : '';
      return `<li><a href="/fahrer/rechnungen/${r.id}">
        <span><strong>${nummer}</strong>${zustand}</span>
        <span class="betrag">${euro(r.brutto_cent)}</span>
        <span class="strecke">${datumDeutsch(r.fahrtdatum)} · ${sicher(r.von)} → ${sicher(r.nach)}${r.kunde_name ? ` · ${sicher(r.kunde_name)}` : ''}</span>
      </a></li>`;
    })
    .join('');

  return seite(
    `
    <div class="kopf">
      <h1>Rechnungen</h1>
      <span><a href="/fahrer">Fahrer &amp; Aufträge</a> · <a class="klein" href="/fahrer/abmelden">Abmelden</a></span>
    </div>

    <h2>Neue Rechnung</h2>
    ${fehler.length ? `<div class="fehlerkasten" role="alert">${fehler.map((t) => `<p>${sicher(t)}</p>`).join('')}</div>` : ''}

    <form method="post" action="/fahrer/rechnungen/neu" class="formular">
      ${adressfeld({ name: 'von', beschriftung: 'Start-Adresse', wert: e.von, platzhalter: 'Straße, Hausnummer, Ort', pflicht: true })}
      ${adressfeld({ name: 'nach', beschriftung: 'Ziel-Adresse', wert: e.nach, platzhalter: 'z. B. Flughafen Stuttgart', pflicht: true })}
      <p class="hinweis">Beim Tippen erscheinen Vorschläge. Passt keiner, die Adresse einfach vollständig eintragen.</p>

      <div class="zwei">
        <label>Preis in €
          <input name="betrag" value="${sicher(e.betrag)}" inputmode="decimal" placeholder="z. B. 46,50" autocomplete="off" required>
        </label>
        <label>Datum der Fahrt
          <input type="date" name="fahrtdatum" value="${sicher(e.fahrtdatum)}" max="${Number(heute.slice(0, 4)) + 1}-12-31" required>
        </label>
      </div>

      <label>Zahlung
        <select name="zahlungsart">
          ${Object.entries(ZAHLUNGSARTEN)
            .map(([wert, text]) => `<option value="${wert}" ${e.zahlungsart === wert ? 'selected' : ''}>${text}</option>`)
            .join('')}
        </select>
      </label>

      <details ${fahrgastOffen ? 'open' : ''}>
        <summary>Fahrgast eintragen <span class="klein">– ab 250 € Pflicht</span></summary>
        <div class="formular">
          <label>Name oder Firma
            <input name="kunde_name" value="${sicher(e.kundeName)}" autocomplete="off">
          </label>
          <label>Anschrift
            <textarea name="kunde_anschrift" rows="2" placeholder="Straße Nr.&#10;PLZ Ort">${sicher(e.kundeAnschrift)}</textarea>
          </label>
        </div>
      </details>

      <button class="cyan gross">Rechnung erstellen</button>
      <p class="hinweis">Der Preis ist der Endpreis, den der Fahrgast zahlt. Die 19 % Umsatzsteuer werden herausgerechnet.</p>
    </form>

    <h2>Ausgestellte Rechnungen</h2>
    ${liste ? `<ul class="liste">${liste}</ul>` : '<p class="hinweis">Noch keine Rechnung ausgestellt.</p>'}

    <h2 id="firmendaten">Firmendaten</h2>
    ${gespeichert ? '<p class="meldung" role="status">✓ Firmendaten gespeichert. Sie gelten ab der nächsten Rechnung.</p>' : ''}
    <details ${absenderFehler ? 'open' : ''}>
      <summary>Was oben auf jeder Rechnung steht</summary>
      ${absenderFehler ? `<p class="fehler" role="alert">${sicher(absenderFehler)}</p>` : ''}
      <form method="post" action="/fahrer/rechnungen/absender" class="formular">
        ${ABSENDER_FELDER.map(
          ([feld, text]) => `<label>${text}
            <input name="${feld}" value="${sicher(absender[feld])}" ${PFLICHT_ABSENDER.includes(feld) ? 'required' : ''}>
          </label>`,
        ).join('')}
        <button>Firmendaten speichern</button>
        <p class="hinweis">Gilt für neue Rechnungen. Bereits ausgestellte bleiben, wie sie sind.</p>
      </form>
    </details>

    <script>${VORSCHLAEGE_SKRIPT}</script>
  `,
    { titel: 'Rechnungen', stil: STIL },
  );
}

async function einzelSeite(r: RechnungMitStorno, env: Umgebung, neu: boolean): Promise<string> {
  const nummer = rechnungsnummer(r.jahr, r.laufnummer);
  const istStorno = r.storno_von !== null;
  const titel = istStorno ? 'Stornorechnung' : 'Rechnung';
  const pdfAdresse = `/fahrer/rechnungen/${r.id}/${dateiname(r)}`;

  const bezug = istStorno ? await rechnungLaden(env.DB, r.storno_von!) : null;
  const stornoRechnung = r.storniert_durch ? await rechnungLaden(env.DB, r.storniert_durch) : null;

  const angaben: [string, string][] = [
    ['Datum der Fahrt', datumDeutsch(r.fahrtdatum)],
    ['Von', sicher(r.von)],
    ['Nach', sicher(r.nach)],
    ...(r.kunde_name || r.kunde_anschrift
      ? ([['Fahrgast', sicher([r.kunde_name, r.kunde_anschrift].filter(Boolean).join('\n'))]] as [string, string][])
      : []),
    ...(istStorno ? [] : ([['Zahlung', ZAHLUNGSARTEN[r.zahlungsart] ?? sicher(r.zahlungsart)]] as [string, string][])),
    ['Gesamtbetrag', `<strong>${euro(r.brutto_cent)}</strong>`],
    [`darin ${r.steuersatz} % USt`, euro(r.steuer_cent)],
    ['Ausgestellt am', datumDeutsch(r.rechnungsdatum)],
  ];

  let zustand = '';
  if (bezug) {
    zustand = `<p class="hinweis">Hebt die Rechnung <a href="/fahrer/rechnungen/${bezug.id}">${rechnungsnummer(bezug.jahr, bezug.laufnummer)}</a> auf.</p>`;
  } else if (stornoRechnung) {
    zustand = `<p class="fehler">Storniert durch <a href="/fahrer/rechnungen/${stornoRechnung.id}">Stornorechnung ${rechnungsnummer(stornoRechnung.jahr, stornoRechnung.laufnummer)}</a>.</p>`;
  }

  const stornoKnopf =
    !istStorno && !stornoRechnung
      ? `<h2>Fehler in der Rechnung?</h2>
    <p class="hinweis">
      Eine ausgestellte Rechnung darf nicht geändert oder gelöscht werden.
      Stattdessen wird sie storniert: Es entsteht eine Stornorechnung mit
      eigener Nummer, danach einfach eine neue Rechnung erstellen.
    </p>
    <form method="post" action="/fahrer/rechnungen/${r.id}/stornieren"
          onsubmit="return confirm('Rechnung ${nummer} stornieren?\\n\\nDas lässt sich nicht rückgängig machen.')">
      <button class="rot">Rechnung stornieren</button>
    </form>`
      : '';

  return seite(
    `
    <p><a href="/fahrer/rechnungen">← Alle Rechnungen</a></p>
    ${neu ? `<p class="meldung" role="status">✓ ${titel} ${nummer} ist erstellt.</p>` : ''}
    <h1>${titel} ${nummer}</h1>
    ${zustand}

    <dl class="angaben">
      ${angaben.map(([name, wert]) => `<dt>${name}</dt><dd>${wert}</dd>`).join('')}
    </dl>

    <div class="knoepfe">
      <button id="teilen" class="cyan gross" data-pdf="${pdfAdresse}" data-name="${dateiname(r)}" hidden>PDF teilen</button>
      <a class="knopf gross" href="${pdfAdresse}" download="${dateiname(r)}">PDF herunterladen</a>
      <a class="knopf gross" href="/fahrer/rechnungen">Neue Rechnung</a>
    </div>

    ${stornoKnopf}

    <script>${TEILEN_SKRIPT}</script>
  `,
    { titel: `${titel} ${nummer}`, stil: STIL },
  );
}

/* ================================================================ Hilfen */

async function ladeAbsender(env: Umgebung): Promise<Absender> {
  const zeilen = await env.DB.prepare(
    "SELECT schluessel, wert FROM einstellungen WHERE schluessel LIKE 'rechnung_%'",
  ).all<{ schluessel: string; wert: string }>();
  const werte: Record<string, string> = {};
  for (const z of zeilen.results ?? []) werte[z.schluessel] = z.wert;
  return absenderAusEinstellungen(werte);
}

function dateiname(r: Rechnung): string {
  return `${r.storno_von ? 'Stornorechnung' : 'Rechnung'}-${rechnungsnummer(r.jahr, r.laufnummer)}.pdf`;
}

function weiter(ziel: string): Response {
  // 303: Nach dem Absenden wird die Zielseite neu geladen, nicht das Formular
  // erneut geschickt - sonst entstuende beim Neuladen eine zweite Rechnung
  return new Response(null, { status: 303, headers: { location: ziel } });
}

/**
 * Manifest und Symbole fuer "Zum Startbildschirm hinzufuegen".
 * Werden ohne Anmeldung ausgeliefert: Das Handy holt sie ohne Keks ab.
 */
export function appDatei(pfad: string): Response | null {
  if (pfad === '/fahrer/app.webmanifest') {
    return new Response(
      JSON.stringify({
        name: 'MyRegioCar Rechnungen',
        short_name: 'Rechnungen',
        id: '/fahrer/rechnungen',
        start_url: '/fahrer/rechnungen',
        scope: '/fahrer',
        display: 'standalone',
        lang: 'de',
        background_color: '#05070a',
        theme_color: '#05070a',
        icons: [
          { src: '/fahrer/app-symbol-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/fahrer/app-symbol-512.png', sizes: '512x512', type: 'image/png' },
        ],
      }),
      { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=86400' } },
    );
  }

  const symbol = pfad.match(/^\/fahrer\/app-symbol-(\d+)\.png$/);
  const daten = symbol ? APP_SYMBOLE[symbol[1]!] : undefined;
  if (daten) {
    return new Response(Uint8Array.from(atob(daten), (z) => z.charCodeAt(0)), {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' },
    });
  }
  return null;
}

/* ============================================================ Im Browser */

/**
 * "PDF teilen" oeffnet auf dem Handy direkt WhatsApp, Mail und Co.
 *
 * Das PDF wird schon beim Laden geholt: Safari erlaubt das Teilen nur
 * unmittelbar nach dem Tippen, ein Download dazwischen waere zu langsam.
 */
const TEILEN_SKRIPT = `
const knopf = document.getElementById('teilen');
const name = knopf.dataset.name;
if (navigator.canShare && navigator.canShare({ files: [new File([''], name, { type: 'application/pdf' })] })) {
  let datei;
  fetch(knopf.dataset.pdf)
    .then((antwort) => antwort.blob())
    .then((blob) => {
      datei = new File([blob], name, { type: 'application/pdf' });
      knopf.hidden = false;
    });
  knopf.addEventListener('click', () => {
    navigator.share({ files: [datei], title: name }).catch((fehler) => {
      if (fehler.name !== 'AbortError') alert('Teilen hat nicht geklappt. Bitte „PDF herunterladen“ nutzen.');
    });
  });
}`;

const STIL = `
  .formular { display:grid; gap:.9rem; max-width:40rem }
  .formular label { display:grid; gap:.3rem; font-size:.9rem; color:#b3bfcd }
  .formular input, .formular select, .formular textarea { width:100% }
  .formular p { margin:0 }
  ${VORSCHLAG_STIL}
  .zwei { display:grid; grid-template-columns:1fr 1fr; gap:.9rem }
  @media (max-width:30rem) { .zwei { grid-template-columns:1fr } }
  .gross { min-height:3.25rem; font-size:1.05rem; width:100% }
  details { border:1px solid rgba(255,255,255,.1); border-radius:.6rem; padding:.7rem .9rem; max-width:40rem; box-sizing:border-box }
  summary { cursor:pointer; font-weight:600 }
  details[open] > summary { margin-bottom:.9rem }
  .fehlerkasten { max-width:40rem; box-sizing:border-box; margin-bottom:1rem; padding:.2rem .9rem;
       border-radius:.6rem; background:rgba(248,113,113,.1); border:1px solid rgba(248,113,113,.35); color:#fecaca }
  .meldung { max-width:40rem; box-sizing:border-box; padding:.7rem .9rem; border-radius:.6rem;
       background:rgba(74,222,128,.1); border:1px solid rgba(74,222,128,.3); color:#bbf7d0 }
  .liste { list-style:none; padding:0; margin:.5rem 0 0; max-width:40rem }
  .liste a { display:grid; grid-template-columns:1fr auto; gap:.1rem 1rem; padding:.75rem .25rem;
       border-top:1px solid rgba(255,255,255,.08); color:inherit; text-decoration:none }
  .liste a:hover { background:rgba(255,255,255,.03) }
  .liste .betrag { font-weight:700; text-align:right; white-space:nowrap }
  .liste .strecke { grid-column:1 / -1; color:#8d9aab; font-size:.85rem; overflow-wrap:anywhere }
  .marke { font-size:.72rem; padding:.05rem .45rem; border-radius:99px; border:1px solid currentColor; margin-left:.5rem }
  dl.angaben { display:grid; grid-template-columns:max-content 1fr; gap:.5rem 1.25rem; max-width:40rem; margin:1.25rem 0 0 }
  dl.angaben dt { color:#8d9aab }
  dl.angaben dd { margin:0; white-space:pre-line; overflow-wrap:anywhere }
  .knoepfe { display:grid; gap:.6rem; max-width:40rem; margin-top:1.75rem }
`;
