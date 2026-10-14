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
import { rechnungVerschicken } from './rechnung-versand';
import { plausibleEmail } from './auftrag-erfassen';
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

  const korrektur = pfad.match(/^\/fahrer\/rechnungen\/(\d+)\/korrigieren$/);
  if (korrektur && post) {
    return korrigieren(Number(korrektur[1]), env);
  }

  const senden = pfad.match(/^\/fahrer\/rechnungen\/(\d+)\/senden$/);
  if (senden && post) {
    return erneutSenden(Number(senden[1]), anfrage, env);
  }

  const pdf = pfad.match(/^\/fahrer\/rechnungen\/(\d+)\/[\w-]+\.pdf$/);
  if (pdf) {
    return pdfAusliefern(Number(pdf[1]), env);
  }

  const einzeln = pfad.match(/^\/fahrer\/rechnungen\/(\d+)$/);
  if (einzeln) {
    const r = await rechnungLaden(env.DB, Number(einzeln[1]));
    if (!r) return html(seite('<h1>Rechnung nicht gefunden</h1><p><a href="/fahrer/rechnungen">Zu den Rechnungen</a></p>', { titel: 'Rechnungen' }), 404);
    return html(
      await einzelSeite(
        r,
        env,
        url.searchParams.has('neu'),
        url.searchParams.get('versand') ?? '',
      ),
      200,
    );
  }

  // Nach dem Korrigieren: Formular mit den Werten der alten Rechnung oeffnen
  const korrigiert = Number(url.searchParams.get('korrigiert') ?? '');
  const vorlage = Number.isFinite(korrigiert) && korrigiert > 0
    ? await rechnungLaden(env.DB, korrigiert)
    : null;

  return html(
    await uebersicht(env, {
      gespeichert: url.searchParams.has('gespeichert'),
      eingabe: vorlage
        ? {
            von: vorlage.von,
            nach: vorlage.nach,
            betrag: betragFuerEingabe(vorlage.brutto_cent),
            fahrtdatum: vorlage.fahrtdatum,
            kundeName: vorlage.kunde_name,
            kundeAnschrift: vorlage.kunde_anschrift,
            zahlungsart: vorlage.zahlungsart,
          }
        : undefined,
      sendenAn: url.searchParams.get('an') ?? '',
      korrigiert: Boolean(vorlage),
    }),
    200,
  );
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

  // Stammt die Rechnung aus einer Korrektur, geht sie gleich an dieselbe
  // Adresse wie die alte. Ein Fehlschlag haelt nichts auf - die Rechnung ist
  // angelegt, und auf ihrer Seite steht der Knopf zum Nachschicken.
  const sendenAn = String(f.get('senden_an') ?? '').trim().slice(0, 254);
  if (plausibleEmail(sendenAn)) {
    const neue = await rechnungLaden(env.DB, id);
    if (neue) {
      const ergebnisVersand = await rechnungVerschicken(
        env.DB,
        env,
        neue,
        sendenAn,
        absender,
        await einstellung(env, 'bewertung_link'),
      );
      return weiter(
        `/fahrer/rechnungen/${id}?neu&versand=${ergebnisVersand.ok ? 'ok' : 'fehler'}`,
      );
    }
  }

  return weiter(`/fahrer/rechnungen/${id}?neu`);
}

async function stornieren(id: number, env: Umgebung): Promise<Response> {
  const heute = heuteInDeutschland(new Date());
  const stornoId = await rechnungStornieren(env.DB, id, await ladeAbsender(env), heute);
  // Null: gibt es nicht oder ist selbst eine Stornorechnung
  return weiter(stornoId ? `/fahrer/rechnungen/${stornoId}?neu` : `/fahrer/rechnungen/${id}`);
}

/**
 * Rechnung korrigieren - in einem Schritt.
 *
 * Eine Rechnung zu aendern ist nicht erlaubt (GoBD, § 14 UStG): Sie wird
 * storniert, und es entsteht eine neue. Fuer Oender soll das trotzdem ein
 * Knopf sein. Also: stornieren, die Stornorechnung an den Fahrgast schicken
 * und das Formular mit allen Werten der alten Rechnung oeffnen.
 */
async function korrigieren(id: number, env: Umgebung): Promise<Response> {
  const alt = await rechnungLaden(env.DB, id);
  if (!alt || alt.storno_von !== null) return weiter(`/fahrer/rechnungen/${id}`);

  const absender = await ladeAbsender(env);
  const stornoId = await rechnungStornieren(
    env.DB,
    id,
    absender,
    heuteInDeutschland(new Date()),
  );

  // Der Fahrgast hat die alte Rechnung bekommen - dann gehoert ihm auch die
  // Stornorechnung. Scheitert der Versand, geht es trotzdem weiter: Die
  // Korrektur ist wichtiger als die Benachrichtigung darueber.
  const adresse = await empfaengerZu(env, alt);
  if (stornoId && adresse) {
    const storno = await rechnungLaden(env.DB, stornoId);
    if (storno) {
      await rechnungVerschicken(env.DB, env, storno, adresse, absender, '', alt);
    }
  }

  const ziel = new URLSearchParams({ korrigiert: String(id) });
  if (adresse) ziel.set('an', adresse);
  return weiter(`/fahrer/rechnungen?${ziel}`);
}

/** Eine bereits angelegte Rechnung (erneut) verschicken. */
async function erneutSenden(
  id: number,
  anfrage: Request,
  env: Umgebung,
): Promise<Response> {
  const r = await rechnungLaden(env.DB, id);
  if (!r) return weiter('/fahrer/rechnungen');

  const f = await anfrage.formData();
  const adresse = String(f.get('an') ?? '').trim().slice(0, 254);
  if (!plausibleEmail(adresse)) {
    return weiter(`/fahrer/rechnungen/${id}?versand=adresse`);
  }

  const original = r.storno_von ? await rechnungLaden(env.DB, r.storno_von) : null;
  const ergebnis = await rechnungVerschicken(
    env.DB,
    env,
    r,
    adresse,
    await ladeAbsender(env),
    await einstellung(env, 'bewertung_link'),
    original,
  );

  return weiter(`/fahrer/rechnungen/${id}?versand=${ergebnis.ok ? 'ok' : 'fehler'}`);
}

/** An welche Adresse ging oder geht diese Rechnung? */
async function empfaengerZu(env: Umgebung, r: Rechnung): Promise<string> {
  if (r.versand_an) return r.versand_an;

  const zeile = await env.DB.prepare(
    `SELECT a.kunde_email FROM rechnungen r
       JOIN auftraege a ON a.id = r.auftrag_id
      WHERE r.id = ?`,
  )
    .bind(r.id)
    .first<{ kunde_email: string }>();

  return zeile?.kunde_email ?? '';
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

  // Der Bewertungslink gehoert nicht zum Absender und steht deshalb unter
  // einem eigenen Schluessel. Nur http(s) wird uebernommen - ein "javascript:"
  // in einer E-Mail waere eine offene Tuer.
  const link = String(f.get('bewertung_link') ?? '').trim().slice(0, 300);
  await env.DB.prepare(
    'INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert',
  )
    .bind('bewertung_link', /^https?:\/\//i.test(link) ? link : '')
    .run();

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
    sendenAn = '',
    korrigiert = false,
  }: {
    eingabe?: RechnungsEingabe;
    fehler?: string[];
    absenderEingabe?: Record<string, string>;
    absenderFehler?: string;
    gespeichert?: boolean;
    /** Adresse, an die die neue Rechnung automatisch gehen soll */
    sendenAn?: string;
    korrigiert?: boolean;
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
  const bewertungLink = await einstellung(env, 'bewertung_link');
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

    <h2>${korrigiert ? 'Berichtigte Rechnung' : 'Neue Rechnung'}</h2>
    ${
      korrigiert
        ? `<p class="meldung" role="status">
             ✓ Die alte Rechnung ist storniert${sendenAn ? ', die Stornorechnung ist beim Fahrgast' : ''}.
             Unten stehen alle Angaben von dort – korrigieren Sie, was falsch war, und stellen Sie die Rechnung neu aus.
             ${sendenAn ? `Sie geht anschließend automatisch an ${sicher(sendenAn)}.` : ''}
           </p>`
        : ''
    }
    ${fehler.length ? `<div class="fehlerkasten" role="alert">${fehler.map((t) => `<p>${sicher(t)}</p>`).join('')}</div>` : ''}

    <form method="post" action="/fahrer/rechnungen/neu" class="formular">
      ${sendenAn ? `<input type="hidden" name="senden_an" value="${sicher(sendenAn)}">` : ''}
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
        <label>Link zur Bewertungsseite <span class="klein">– optional</span>
          <input name="bewertung_link" type="url" inputmode="url"
                 value="${sicher(bewertungLink)}"
                 placeholder="https://g.page/r/...">
        </label>
        <button>Firmendaten speichern</button>
        <p class="hinweis">
          Gilt für neue Rechnungen. Bereits ausgestellte bleiben, wie sie sind.
          Der Bewertungslink steht unter jeder Rechnung, die per E-Mail
          rausgeht – solange er leer ist, bleibt die Zeile weg.
        </p>
      </form>
    </details>

    <script>${VORSCHLAEGE_SKRIPT}</script>
  `,
    { titel: 'Rechnungen', stil: STIL },
  );
}

async function einzelSeite(
  r: RechnungMitStorno,
  env: Umgebung,
  neu: boolean,
  versand = '',
): Promise<string> {
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

  const adresse = await empfaengerZu(env, r);

  const versandstand = r.versendet_um
    ? `<p class="meldung">✓ Per E-Mail verschickt am ${datumDeutsch(r.versendet_um.slice(0, 10))} an ${sicher(r.versand_an ?? '')}.</p>`
    : '<p class="hinweis">Diese Rechnung wurde noch nicht per E-Mail verschickt.</p>';

  const versandmeldung =
    versand === 'ok'
      ? '<p class="meldung" role="status">✓ Rechnung verschickt.</p>'
      : versand === 'fehler'
        ? '<p class="fehler" role="alert">Der Versand hat nicht geklappt. Bitte Adresse prüfen und noch einmal versuchen.</p>'
        : versand === 'adresse'
          ? '<p class="fehler" role="alert">Die E-Mail-Adresse sieht nicht richtig aus.</p>'
          : '';

  const versandFeld = `<h2>Per E-Mail verschicken</h2>
    ${versandstand}
    ${versandmeldung}
    <form method="post" action="/fahrer/rechnungen/${r.id}/senden" class="formular">
      <label>E-Mail-Adresse des Fahrgasts
        <input name="an" type="email" inputmode="email" value="${sicher(adresse)}"
               placeholder="name@beispiel.de" required>
      </label>
      <button class="cyan">${r.versendet_um ? 'Noch einmal verschicken' : 'Rechnung verschicken'}</button>
    </form>`;

  // Korrigieren statt Stornieren als Hauptweg: Es ist das, was Oender
  // tatsaechlich will. Der Knopf macht beides - stornieren UND das Formular
  // mit den alten Werten oeffnen.
  const stornoKnopf =
    !istStorno && !stornoRechnung
      ? `<h2>Fehler in der Rechnung?</h2>
    <p class="hinweis">
      Eine ausgestellte Rechnung darf nicht geändert oder gelöscht werden –
      das verlangt das Steuerrecht. „Korrigieren" erledigt beides auf einmal:
      Es storniert diese Rechnung, schickt dem Fahrgast die Stornorechnung und
      öffnet eine neue Rechnung mit allen Angaben von hier.
    </p>
    <form method="post" action="/fahrer/rechnungen/${r.id}/korrigieren"
          onsubmit="return confirm('Rechnung ${nummer} korrigieren?\\n\\nSie wird storniert, und Sie können sie gleich neu ausstellen.')">
      <button class="cyan">Rechnung korrigieren</button>
    </form>
    <details>
      <summary>Nur stornieren, ohne neue Rechnung</summary>
      <form method="post" action="/fahrer/rechnungen/${r.id}/stornieren"
            onsubmit="return confirm('Rechnung ${nummer} stornieren?\\n\\nDas lässt sich nicht rückgängig machen.')">
        <button class="rot">Rechnung stornieren</button>
      </form>
    </details>`
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

    ${versandFeld}

    ${stornoKnopf}

    <script>${TEILEN_SKRIPT}</script>
  `,
    { titel: `${titel} ${nummer}`, stil: STIL },
  );
}

/* ================================================================ Hilfen */

/** Einen einzelnen Wert aus den Einstellungen holen. Fehlt er, bleibt er leer. */
async function einstellung(env: Umgebung, schluessel: string): Promise<string> {
  const zeile = await env.DB.prepare(
    'SELECT wert FROM einstellungen WHERE schluessel = ?',
  )
    .bind(schluessel)
    .first<{ wert: string }>();
  return zeile?.wert ?? '';
}

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
