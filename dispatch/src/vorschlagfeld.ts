import { sicher } from './seite';

/**
 * Adressfeld mit eigener Vorschlagsliste.
 *
 * Steht in einer eigenen Datei, weil es inzwischen an zwei Stellen gebraucht
 * wird: bei den Rechnungen und bei der telefonischen Auftragsaufnahme.
 *
 * Kein <datalist>. Die erste Fassung der Rechnungsseite hatte eins, und es
 * zeigte oft gar nichts an: Chrome blendet alles aus, was nicht woertlich zum
 * Getippten passt - aus "Steiermärker Str 3" wird beim Kartendienst
 * "Steiermärker Straße 3-5" -, und auf dem iPhone erscheint die Liste nur
 * klein ueber der Tastatur.
 */

export interface Adressfeld {
  name: string;
  beschriftung: string;
  wert?: string;
  platzhalter?: string;
  pflicht?: boolean;
  /**
   * Merkt sich die Koordinaten des gewaehlten Vorschlags in versteckten
   * Feldern (<name>_breite, <name>_laenge). Nur damit kann der Server einen
   * Festpreis rechnen - aus blossem Text nicht.
   */
  koordinaten?: boolean;
  breite?: string;
  laenge?: string;
}

export function adressfeld(feld: Adressfeld): string {
  const {
    name,
    beschriftung,
    wert = '',
    platzhalter = '',
    pflicht = false,
    koordinaten = false,
    breite = '',
    laenge = '',
  } = feld;

  const versteckt = koordinaten
    ? `<input type="hidden" name="${name}_breite" value="${sicher(breite)}">
         <input type="hidden" name="${name}_laenge" value="${sicher(laenge)}">`
    : '';

  return `<div class="vorschlagfeld" data-vorschlagfeld${koordinaten ? ' data-koordinaten' : ''}>
        <label for="feld-${name}">${beschriftung}</label>
        <input id="feld-${name}" name="${name}" value="${sicher(wert)}" placeholder="${sicher(platzhalter)}"
               autocomplete="off" enterkeyhint="next"${pflicht ? ' required' : ''}
               role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="vorschlaege-${name}">
        ${versteckt}
        <ul class="vorschlaege" id="vorschlaege-${name}" role="listbox" hidden></ul>
      </div>`;
}

/**
 * Das Skript dazu.
 *
 * Wichtigster Punkt fuer die Auftragsaufnahme: Sobald jemand den Text nach
 * der Auswahl wieder aendert, werden die gemerkten Koordinaten GELOESCHT.
 * Sonst stuende im Feld "Bahnhofstraße 7" und der Preis waere der des vorher
 * gewaehlten Flughafens - ein bindender Betrag fuer die falsche Strecke.
 *
 * Nach jeder Aenderung meldet sich das Feld mit einem eigenen Ereignis
 * ("adresse"), damit die Seite den Preis neu holen kann.
 */
export const VORSCHLAEGE_SKRIPT = `
for (const huelle of document.querySelectorAll('[data-vorschlagfeld]')) {
  const feld = huelle.querySelector('input');
  const liste = huelle.querySelector('.vorschlaege');
  const mitKoordinaten = huelle.hasAttribute('data-koordinaten');
  const breiteFeld = huelle.querySelector('input[name$="_breite"]');
  const laengeFeld = huelle.querySelector('input[name$="_laenge"]');
  let warte;
  let markiert = -1;
  let abfrage = 0;

  const melden = () => huelle.dispatchEvent(new CustomEvent('adresse', { bubbles: true }));

  const koordinatenLoeschen = () => {
    if (!mitKoordinaten || !breiteFeld.value) return;
    breiteFeld.value = '';
    laengeFeld.value = '';
    melden();
  };

  const schliessen = () => {
    liste.hidden = true;
    liste.replaceChildren();
    feld.setAttribute('aria-expanded', 'false');
    markiert = -1;
  };

  const markieren = (richtung) => {
    const eintraege = [...liste.children];
    if (!eintraege.length) return;
    markiert = (markiert + richtung + eintraege.length) % eintraege.length;
    eintraege.forEach((e, i) => e.setAttribute('aria-selected', String(i === markiert)));
    eintraege[markiert].scrollIntoView({ block: 'nearest' });
  };

  const uebernehmen = (vorschlag) => {
    feld.value = vorschlag.text;
    if (mitKoordinaten) {
      breiteFeld.value = vorschlag.breite ?? '';
      laengeFeld.value = vorschlag.laenge ?? '';
    }
    schliessen();
    melden();
  };

  feld.addEventListener('input', () => {
    clearTimeout(warte);
    // Getippter Text gehoert nicht mehr zum gewaehlten Punkt
    koordinatenLoeschen();

    const gesuch = feld.value.trim();
    if (gesuch.length < 3) return schliessen();

    warte = setTimeout(async () => {
      // Nur die Antwort auf die letzte Eingabe zaehlt - eine langsame fruehere
      // Antwort darf die Liste nicht nachtraeglich ueberschreiben
      const nummer = ++abfrage;
      try {
        const antwort = await fetch('/api/adressen?q=' + encodeURIComponent(gesuch));
        const { vorschlaege = [] } = await antwort.json();
        if (nummer !== abfrage || feld.value.trim() !== gesuch) return;

        // Der Kartendienst liefert "Steiermärker Straße 3-5, Stuttgart, BW, Germany" -
        // Bundesland und "Germany" braucht hier niemand
        const gesehen = new Set();
        const sauber = [];
        for (const v of vorschlaege) {
          const text = v.text.replace(/, [A-Z]{2}, Germany$/, '');
          if (gesehen.has(text)) continue;
          gesehen.add(text);
          sauber.push({ text, breite: v.breite, laenge: v.laenge });
        }
        if (!sauber.length) return schliessen();

        liste.replaceChildren(...sauber.map((vorschlag) => {
          const zeile = document.createElement('li');
          zeile.textContent = vorschlag.text;
          zeile.setAttribute('role', 'option');
          zeile.setAttribute('aria-selected', 'false');
          // mousedown statt click: Sonst schliesst der Fokusverlust die Liste,
          // bevor der Klick ankommt. Auf dem Handy folgt mousedown dem Antippen.
          zeile.addEventListener('mousedown', (ereignis) => {
            ereignis.preventDefault();
            uebernehmen(vorschlag);
          });
          return zeile;
        }));
        liste.hidden = false;
        feld.setAttribute('aria-expanded', 'true');
        markiert = -1;
      } catch {
        schliessen();
      }
    }, 300);
  });

  feld.addEventListener('keydown', (ereignis) => {
    if (liste.hidden) return;
    if (ereignis.key === 'ArrowDown') { ereignis.preventDefault(); markieren(1); }
    else if (ereignis.key === 'ArrowUp') { ereignis.preventDefault(); markieren(-1); }
    else if (ereignis.key === 'Escape') { schliessen(); }
    else if (ereignis.key === 'Enter') {
      // Bei offener Liste nie das Formular abschicken - erst auswaehlen
      ereignis.preventDefault();
      const eintrag = liste.children[markiert];
      if (eintrag) eintrag.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
      else schliessen();
    }
  });

  feld.addEventListener('blur', () => setTimeout(schliessen, 150));
}`;

/** Das Aussehen der Liste - gehoert zum Feld, nicht zur einzelnen Seite. */
export const VORSCHLAG_STIL = `
  .vorschlagfeld { position:relative; display:grid; gap:.3rem }
  .vorschlagfeld label { font-size:.9rem; color:#b3bfcd }
  .vorschlaege { position:absolute; z-index:20; top:100%; left:0; right:0; margin:.25rem 0 0; padding:.25rem;
       list-style:none; max-height:16rem; overflow-y:auto; border:1px solid rgba(34,184,240,.4);
       border-radius:.75rem; background:#0a0e14; box-shadow:0 16px 40px -12px rgba(0,0,0,.8) }
  .vorschlaege li { display:flex; align-items:center; box-sizing:border-box; min-height:2.75rem; padding:.55rem .75rem;
       border-radius:.5rem; color:#e8edf3; cursor:pointer }
  .vorschlaege li:hover, .vorschlaege li[aria-selected="true"] { background:rgba(34,184,240,.16); color:#fff }
`;
