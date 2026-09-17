import type { Fahrer, Umgebung } from './typen';
import {
  ANLAESSE,
  KANAELE,
  erfassungPruefen,
  type ErfassungsEingabe,
} from './auftrag-erfassen';
import { auftragEintragen, laufendeFahrten } from './auftrag-ablage';
import { belegteFahrerIds, type LaufenderAuftrag } from './belegung';
import { festpreisErmitteln, pruefePunkt } from './festpreis';
import { html, seite, sicher } from './seite';
import { VORSCHLAEGE_SKRIPT, VORSCHLAG_STIL, adressfeld } from './vorschlagfeld';
import { alsDatenbankzeit, jetztAlsFormular, zeitpunktDeutsch } from './zeit';

/**
 * Telefonische Auftragsaufnahme im Fahrerbereich.
 *
 * Der groesste Teil der Auftraege kommt per Anruf. Bisher standen die nur auf
 * Papier: kein Eintrag in der Datenbank, kein Nachweis des Auftragseingangs
 * nach § 49 PBefG, kein serverseitig gerechneter Preis - und vor allem keine
 * Absicherung dagegen, dass ein telefonisch vergebener Fahrer parallel einen
 * Auftrag aus Telegram annimmt.
 *
 * Deshalb laeuft ein hier aufgenommener Auftrag durch denselben Datensatz und
 * dasselbe Vermittlungsobjekt wie eine Bestellung von der Website.
 *
 * Die Anmeldung prueft admin.ts, bevor es hier ankommt.
 */

export async function auftraegeRoute(anfrage: Request, env: Umgebung): Promise<Response> {
  const url = new URL(anfrage.url);
  const pfad = url.pathname;
  const post = anfrage.method === 'POST';

  // Preisabfrage fuer das Formular. Bewusst eine eigene Route hinter dem
  // Passwort: /api/preis ist oeffentlich und auf 200 Abfragen je Stunde
  // gedrosselt - ein Buero mit vielen Anrufen haengt an einer IP.
  if (pfad === '/fahrer/preis' && post) return preisAnfragen(anfrage, env);

  if (pfad === '/fahrer/auftrag/neu' && post) return auftragAnlegen(anfrage, env);

  const erledigt = pfad.match(/^\/fahrer\/auftrag\/([\w-]+)\/erledigt$/);
  if (erledigt && post) return auftragErledigt(erledigt[1]!, env);

  const storno = pfad.match(/^\/fahrer\/auftrag\/([\w-]+)\/stornieren$/);
  if (storno && post) return auftragStornieren(storno[1]!, env);

  return html(await uebersicht(env, { angelegt: url.searchParams.get('angelegt') ?? '' }), 200);
}

/* =============================================================== Aktionen */

async function auftragAnlegen(anfrage: Request, env: Umgebung): Promise<Response> {
  const f = await anfrage.formData();
  const text = (feld: string) => String(f.get(feld) ?? '');

  const vonPunkt = punktAusFormular(f, 'abholung');
  const nachPunkt = punktAusFormular(f, 'ziel');

  const eingabe: ErfassungsEingabe = {
    kanal: text('kanal'),
    art: text('art'),
    abholung: text('abholung'),
    ziel: text('ziel'),
    vonGewaehlt: Boolean(vonPunkt),
    nachGewaehlt: Boolean(nachPunkt),
    wann: text('wann'),
    datum: text('datum'),
    zeit: text('zeit'),
    name: text('name'),
    telefon: text('telefon'),
    personen: text('personen'),
    anmerkung: text('anmerkung'),
    preis: text('preis'),
    preisAbweichend: Boolean(f.get('preis_abweichend')),
    eingangDatum: text('eingang_datum'),
    eingangZeit: text('eingang_zeit'),
  };

  const geprueft = erfassungPruefen(eingabe, new Date());
  if ('fehler' in geprueft) {
    return html(await uebersicht(env, { eingabe, fehler: geprueft.fehler }), 422);
  }
  const auftrag = geprueft.auftrag;

  // Der Preis wird hier gerechnet und NICHT aus dem Browser uebernommen -
  // die Anzeige im Formular ist nur eine Vorschau.
  let preis = (auftrag.preisCent ?? 0) / 100;
  let streckeKm = 0;
  let quelle: 'berechnet' | 'manuell' = 'manuell';

  if (auftrag.preisBerechnen) {
    const festpreis = await festpreisErmitteln(
      auftrag.abholung,
      auftrag.ziel,
      env,
      vonPunkt,
      nachPunkt,
    );
    if (!festpreis) {
      return html(
        await uebersicht(env, {
          eingabe,
          fehler: [
            'Der Festpreis ließ sich für diese Strecke nicht berechnen. Bitte den vereinbarten Preis von Hand eintragen und „Preis abweichend vereinbart“ ankreuzen.',
          ],
        }),
        422,
      );
    }
    preis = festpreis.preis;
    streckeKm = festpreis.km;
    quelle = 'berechnet';
  }

  const id = crypto.randomUUID();
  await auftragEintragen(env.DB, {
    id,
    eingang: alsDatenbankzeit(auftrag.eingangIso),
    kanal: auftrag.kanal,
    art: auftrag.art,
    abholung: auftrag.abholung,
    ziel: auftrag.ziel,
    wunschzeit: auftrag.wunschzeit,
    wunschIso: auftrag.wunschIso,
    sofort: auftrag.sofort,
    personen: auftrag.personen,
    anmerkung: auftrag.anmerkung,
    preis,
    streckeKm,
    preisQuelle: quelle,
    kundeName: auftrag.kundeName,
    kundeTelefon: auftrag.kundeTelefon,
  });

  const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(id));
  const fahrerId = Number(f.get('fahrer_id'));

  if (String(f.get('aktion')) === 'zuweisen' && Number.isFinite(fahrerId) && fahrerId > 0) {
    const ergebnis = (await (
      await objekt.fetch('https://vermittlung/zuweisen', {
        method: 'POST',
        body: JSON.stringify({ auftragId: id, fahrerId }),
      })
    ).json()) as { ergebnis: string };

    if (ergebnis.ergebnis !== 'zugewiesen') {
      // Der Auftrag steht bereits in der Datenbank - er wird nicht geloescht,
      // sondern storniert. Gleiche Haltung wie bei Rechnungen und Fahrern.
      await objekt.fetch('https://vermittlung/abbrechen', { method: 'POST' });
      const grund =
        ergebnis.ergebnis === 'belegt'
          ? 'Dieser Fahrer ist zu der Zeit schon unterwegs. Bitte jemand anderen wählen oder die Fahrt ausschreiben.'
          : 'Der Fahrer ließ sich nicht einteilen. Bitte prüfen, ob er aktiv und in Telegram angemeldet ist.';
      return html(await uebersicht(env, { eingabe, fehler: [grund] }), 422);
    }
  } else {
    await objekt.fetch('https://vermittlung/start', {
      method: 'POST',
      body: JSON.stringify({ auftragId: id }),
    });
  }

  return weiter(`/fahrer/auftrag?angelegt=${id}`);
}

async function auftragErledigt(id: string, env: Umgebung): Promise<Response> {
  const auftrag = await env.DB.prepare(
    'SELECT fahrer_id FROM auftraege WHERE id = ?',
  )
    .bind(id)
    .first<{ fahrer_id: number | null }>();

  if (auftrag?.fahrer_id) {
    const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(id));
    await objekt.fetch('https://vermittlung/erledigt', {
      method: 'POST',
      body: JSON.stringify({ fahrerId: auftrag.fahrer_id }),
    });
  }
  return weiter('/fahrer/auftrag');
}

async function auftragStornieren(id: string, env: Umgebung): Promise<Response> {
  const objekt = env.VERMITTLUNG.get(env.VERMITTLUNG.idFromName(id));
  await objekt.fetch('https://vermittlung/abbrechen', { method: 'POST' });
  return weiter('/fahrer/auftrag');
}

/** Preisvorschau fuer das Formular - dieselbe Rechnung wie beim Anlegen. */
async function preisAnfragen(anfrage: Request, env: Umgebung): Promise<Response> {
  const roh = (await anfrage.json().catch(() => null)) as {
    vonPunkt?: unknown;
    nachPunkt?: unknown;
  } | null;

  const von = pruefePunkt(roh?.vonPunkt);
  const nach = pruefePunkt(roh?.nachPunkt);
  if (!von || !nach) return jsonAntwort({ aufAnfrage: true });

  const festpreis = await festpreisErmitteln('', '', env, von, nach);
  return jsonAntwort(
    festpreis
      ? { preis: festpreis.preis, km: festpreis.km, minuten: festpreis.minuten }
      : { aufAnfrage: true },
  );
}

/* ================================================================ Ansicht */

async function uebersicht(
  env: Umgebung,
  {
    eingabe,
    fehler = [],
    angelegt = '',
  }: { eingabe?: ErfassungsEingabe; fehler?: string[]; angelegt?: string },
): Promise<string> {
  const jetzt = new Date();
  const vorgabe = jetztAlsFormular(jetzt);

  const e: ErfassungsEingabe = eingabe ?? {
    kanal: 'telefon',
    art: ANLAESSE[1]!,
    abholung: '',
    ziel: '',
    vonGewaehlt: false,
    nachGewaehlt: false,
    wann: 'sofort',
    datum: vorgabe.datum,
    zeit: vorgabe.zeit,
    name: '',
    telefon: '',
    personen: '1',
    anmerkung: '',
    preis: '',
    preisAbweichend: false,
    eingangDatum: '',
    eingangZeit: '',
  };

  const fahrer = await env.DB.prepare(
    'SELECT * FROM fahrer WHERE ausgeschieden = 0 AND aktiv = 1 ORDER BY reihenfolge, id',
  ).all<Fahrer>();

  const laufende = await laufendeFahrten(env.DB);
  const belegt = belegteFahrerIds(
    laufende.filter((a) => a.fahrer_id) as LaufenderAuftrag[],
    jetzt,
  );

  const fahrerListe = (fahrer.results ?? [])
    .map((fa) => {
      const hinweis = !fa.telegram_chat_id
        ? ' – nicht in Telegram'
        : belegt.has(fa.id)
          ? ' – unterwegs'
          : '';
      return `<option value="${fa.id}">${sicher(fa.name)}${hinweis}</option>`;
    })
    .join('');

  const offene = laufende
    .map((a: any) => {
      const wann = a.sofort ? 'so bald wie möglich' : sicher(a.wunschzeit || zeitpunktDeutsch(a.wunsch_iso));
      const wer = a.fahrername
        ? `${sicher(a.fahrername)}${a.zuweisungsart === 'fest' ? ' <span class="marke">eingeteilt</span>' : ''}`
        : '<span class="warte">wird vermittelt …</span>';

      return `<li>
        <div class="kopfzeile">
          <strong>${sicher(a.abholung)}</strong>${a.ziel ? ` → ${sicher(a.ziel)}` : ''}
        </div>
        <div class="klein">
          ${sicher(a.art)} · ${wann} · ${sicher(a.kunde_name)} · ${sicher(a.kunde_telefon)}
          ${a.preis > 0 ? ` · <strong>${euro(a.preis)}</strong>` : ''}
          · ${KANAELE[a.kanal] ?? 'Website'}
        </div>
        <div class="klein">${wer}</div>
        <div class="zeile">
          ${
            a.fahrer_id
              ? `<form method="post" action="/fahrer/auftrag/${a.id}/erledigt">
                   <button>Fahrt erledigt</button>
                 </form>`
              : ''
          }
          <form method="post" action="/fahrer/auftrag/${a.id}/stornieren"
                onsubmit="return confirm('Diese Fahrt absagen?')">
            <button class="rot">Absagen</button>
          </form>
        </div>
      </li>`;
    })
    .join('');

  return seite(
    `
    <div class="kopf">
      <h1>Auftrag aufnehmen</h1>
      <span><a href="/fahrer">Fahrer &amp; Aufträge</a> · <a href="/fahrer/rechnungen">Rechnungen</a>
        · <a class="klein" href="/fahrer/abmelden">Abmelden</a></span>
    </div>

    ${angelegt ? '<p class="meldung" role="status">✓ Der Auftrag ist aufgenommen.</p>' : ''}
    ${fehler.length ? `<div class="fehlerkasten" role="alert">${fehler.map((t) => `<p>${sicher(t)}</p>`).join('')}</div>` : ''}

    <form method="post" action="/fahrer/auftrag/neu" class="formular" id="formular">
      <div class="zwei">
        <label>Eingang über
          <select name="kanal" required>
            ${Object.entries(KANAELE)
              .map(([wert, text]) => `<option value="${wert}" ${e.kanal === wert ? 'selected' : ''}>${text}</option>`)
              .join('')}
          </select>
        </label>
        <label>Anlass
          <select name="art">
            ${ANLAESSE.map((text) => `<option ${e.art === text ? 'selected' : ''}>${text}</option>`).join('')}
          </select>
        </label>
      </div>

      ${adressfeld({
        name: 'abholung',
        beschriftung: 'Abholadresse',
        wert: e.abholung,
        platzhalter: 'Straße, Hausnummer, Ort',
        pflicht: true,
        koordinaten: true,
      })}
      ${adressfeld({
        name: 'ziel',
        beschriftung: 'Zieladresse',
        wert: e.ziel,
        platzhalter: 'z. B. Flughafen Stuttgart',
        koordinaten: true,
      })}
      <p class="hinweis">
        Für einen Festpreis müssen <strong>beide</strong> Adressen aus der
        Vorschlagsliste gewählt sein. Frei getippte Adressen sind erlaubt –
        dann wird der Preis von Hand eingetragen.
      </p>

      <div class="preisfeld" id="preisfeld" data-zustand="leer">
        <span class="klein" data-wenn="leer">Preis erscheint, sobald beide Adressen gewählt sind.</span>
        <span class="klein" data-wenn="laedt" hidden>Preis wird berechnet …</span>
        <strong data-wenn="fertig" hidden><span id="preis-betrag"></span> <span class="klein" id="preis-strecke"></span></strong>
        <span class="klein nein" data-wenn="anfrage" hidden>Kein Festpreis möglich – bitte Preis eintragen.</span>
      </div>

      <label class="haken">
        <input type="checkbox" name="preis_abweichend" id="abweichend" ${e.preisAbweichend ? 'checked' : ''}>
        Preis abweichend vereinbart
      </label>
      <label id="preis-eingabe">Vereinbarter Preis in €
        <input name="preis" value="${sicher(e.preis)}" inputmode="decimal" placeholder="z. B. 40,00" autocomplete="off">
      </label>

      <fieldset class="zeile">
        <legend class="klein">Wann?</legend>
        <label class="haken"><input type="radio" name="wann" value="sofort" ${e.wann !== 'spaeter' ? 'checked' : ''}> so bald wie möglich</label>
        <label class="haken"><input type="radio" name="wann" value="spaeter" ${e.wann === 'spaeter' ? 'checked' : ''}> später</label>
      </fieldset>
      <div class="zwei" id="zeitpunkt" ${e.wann === 'spaeter' ? '' : 'hidden'}>
        <label>Datum <input type="date" name="datum" value="${sicher(e.datum)}"></label>
        <label>Uhrzeit <input type="time" name="zeit" value="${sicher(e.zeit)}"></label>
      </div>

      <div class="zwei">
        <label>Name des Fahrgasts
          <input name="name" value="${sicher(e.name)}" autocomplete="off" required>
        </label>
        <label>Telefon
          <input name="telefon" value="${sicher(e.telefon)}" inputmode="tel" autocomplete="off" required>
        </label>
      </div>

      <div class="zwei">
        <label>Personen
          <input type="number" name="personen" min="1" max="8" value="${sicher(e.personen)}">
        </label>
      </div>

      <label>Notiz für den Fahrer
        <textarea name="anmerkung" rows="2" placeholder="z. B. Hauseingang hinten, Rollstuhl">${sicher(e.anmerkung)}</textarea>
      </label>

      <details ${e.eingangDatum || e.eingangZeit ? 'open' : ''}>
        <summary>Anruf war früher <span class="klein">– nur nötig, wenn Sie nachtragen</span></summary>
        <div class="zwei">
          <label>Datum <input type="date" name="eingang_datum" value="${sicher(e.eingangDatum)}"></label>
          <label>Uhrzeit <input type="time" name="eingang_zeit" value="${sicher(e.eingangZeit)}"></label>
        </div>
        <p class="hinweis">
          Ohne Angabe gilt jetzt. Der Eingang des Auftrags muss festgehalten
          werden – das verlangt § 49 PBefG.
        </p>
      </details>

      <button class="cyan gross" name="aktion" value="ausschreiben">An die Fahrer ausschreiben</button>

      <div class="zeile">
        <select name="fahrer_id">
          ${fahrerListe || '<option value="">Kein Fahrer angelegt</option>'}
        </select>
        <button class="gross" name="aktion" value="zuweisen" ${fahrerListe ? '' : 'disabled'}>Fest zuweisen</button>
      </div>
      <p class="hinweis">
        „Ausschreiben“ fragt die Fahrer der Reihe nach, wie bei einer Bestellung
        über die Website. „Fest zuweisen“ trägt die Fahrt sofort auf einen
        Fahrer ein – er bekommt sie in Telegram und kann sie zurückgeben.
      </p>
    </form>

    <h2>Laufende Fahrten</h2>
    ${
      offene
        ? `<ul class="liste auftraege">${offene}</ul>`
        : '<p class="hinweis">Gerade keine offene Fahrt.</p>'
    }

    <script>${VORSCHLAEGE_SKRIPT}</script>
    <script>${PREIS_SKRIPT}</script>
  `,
    { titel: 'Auftrag aufnehmen', stil: STIL },
  );
}

/* ================================================================= Hilfen */

function punktAusFormular(f: FormData, name: string) {
  return pruefePunkt({
    breite: Number(f.get(`${name}_breite`)),
    laenge: Number(f.get(`${name}_laenge`)),
    bezeichnung: String(f.get(name) ?? ''),
  });
}

function euro(betrag: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag);
}

function jsonAntwort(daten: unknown): Response {
  return new Response(JSON.stringify(daten), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

function weiter(ziel: string): Response {
  // 303: Beim Neuladen der Zielseite entsteht kein zweiter Auftrag
  return new Response(null, { status: 303, headers: { location: ziel } });
}

/* ============================================================ Im Browser */

/**
 * Holt den Festpreis, sobald beide Adressen gewaehlt sind - und blendet das
 * Preisfeld ein, sobald von Hand eingetragen werden muss.
 *
 * Die Zahl aus dieser Vorschau wird NICHT abgeschickt. Beim Anlegen rechnet
 * der Server noch einmal.
 */
const PREIS_SKRIPT = `
const formular = document.getElementById('formular');
const feld = document.getElementById('preisfeld');
const abweichend = document.getElementById('abweichend');
const preisEingabe = document.getElementById('preis-eingabe');
const zeitpunkt = document.getElementById('zeitpunkt');

const zeigen = (zustand) => {
  feld.dataset.zustand = zustand;
  for (const teil of feld.querySelectorAll('[data-wenn]')) {
    teil.hidden = teil.dataset.wenn !== zustand;
  }
};

const punkt = (name) => {
  const breite = formular.querySelector('[name="' + name + '_breite"]').value;
  const laenge = formular.querySelector('[name="' + name + '_laenge"]').value;
  return breite && laenge ? { breite: Number(breite), laenge: Number(laenge), bezeichnung: '' } : null;
};

// Das Preisfeld ist nur dann ueberfluessig, wenn ein Festpreis vorliegt und
// niemand etwas anderes vereinbart hat. In jedem anderen Fall MUSS es
// sichtbar sein - sonst fehlt beim Abschicken eine Pflichtangabe, die
// niemand sehen konnte.
const preisfeldZeigen = () => {
  preisEingabe.hidden = feld.dataset.zustand === 'fertig' && !abweichend.checked;
};

let abfrage = 0;
async function preisHolen() {
  const von = punkt('abholung');
  const nach = punkt('ziel');

  if (!von || !nach) {
    zeigen('leer');
    preisfeldZeigen();
    return;
  }

  zeigen('laedt');
  const nummer = ++abfrage;
  try {
    const antwort = await fetch('/fahrer/preis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vonPunkt: von, nachPunkt: nach }),
    });
    const daten = await antwort.json();
    if (nummer !== abfrage) return;

    if (daten.preis) {
      document.getElementById('preis-betrag').textContent =
        new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(daten.preis);
      document.getElementById('preis-strecke').textContent = 'ca. ' + String(daten.km).replace('.', ',') + ' km';
      zeigen('fertig');
    } else {
      zeigen('anfrage');
    }
    preisfeldZeigen();
  } catch {
    if (nummer !== abfrage) return;
    zeigen('anfrage');
    preisfeldZeigen();
  }
}

formular.addEventListener('adresse', preisHolen);
abweichend.addEventListener('change', () => {
  preisfeldZeigen();
  if (abweichend.checked) preisEingabe.querySelector('input').focus();
});

for (const knopf of formular.querySelectorAll('[name="wann"]')) {
  knopf.addEventListener('change', () => {
    zeitpunkt.hidden = formular.querySelector('[name="wann"]:checked').value !== 'spaeter';
  });
}

preisHolen();`;

const STIL = `
  ${VORSCHLAG_STIL}
  .formular { display:grid; gap:.9rem; max-width:40rem }
  .formular label { display:grid; gap:.3rem; font-size:.9rem; color:#b3bfcd }
  .formular input, .formular select, .formular textarea { width:100% }
  .formular p { margin:0 }
  .formular label.haken { display:flex; font-size:.95rem; color:#e8edf3 }
  .formular label.haken input { width:auto }
  fieldset { border:1px solid rgba(255,255,255,.14); border-radius:.6rem; padding:.7rem .9rem; max-width:40rem;
       box-sizing:border-box; margin:0 }
  legend { padding:0 .35rem }
  .zwei { display:grid; grid-template-columns:1fr 1fr; gap:.9rem }
  @media (max-width:30rem) { .zwei { grid-template-columns:1fr } }
  .gross { min-height:3.25rem; font-size:1.05rem; width:100% }
  .preisfeld { padding:.8rem .9rem; border-radius:.6rem; border:1px solid rgba(34,184,240,.35);
       background:rgba(34,184,240,.07); max-width:40rem; box-sizing:border-box }
  .preisfeld strong { font-size:1.3rem }
  details { border:1px solid rgba(255,255,255,.1); border-radius:.6rem; padding:.7rem .9rem; max-width:40rem; box-sizing:border-box }
  summary { cursor:pointer; font-weight:600 }
  details[open] > summary { margin-bottom:.9rem }
  .fehlerkasten { max-width:40rem; box-sizing:border-box; margin-bottom:1rem; padding:.2rem .9rem;
       border-radius:.6rem; background:rgba(248,113,113,.1); border:1px solid rgba(248,113,113,.35); color:#fecaca }
  .meldung { max-width:40rem; box-sizing:border-box; padding:.7rem .9rem; border-radius:.6rem;
       background:rgba(74,222,128,.1); border:1px solid rgba(74,222,128,.3); color:#bbf7d0 }
  .liste { list-style:none; padding:0; margin:.5rem 0 0; max-width:40rem }
  .liste.auftraege li { padding:.8rem .25rem; border-top:1px solid rgba(255,255,255,.08); display:grid; gap:.35rem }
  .liste .kopfzeile { overflow-wrap:anywhere }
  .marke { font-size:.72rem; padding:.05rem .45rem; border-radius:99px; border:1px solid currentColor; margin-left:.3rem }
`;
