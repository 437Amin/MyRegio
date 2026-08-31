/**
 * Prueft, ob der Redaktionsbereich alle Felder der Inhaltsdateien kennt.
 *
 * Aufruf:  node scripts/cms-pruefen.mjs
 *
 * Hintergrund: Decap CMS schreibt eine Inhaltsdatei beim Speichern komplett
 * neu - und zwar ausschliesslich aus den Feldern, die in config.yml stehen.
 * Ein Feld, das dort FEHLT, verschwindet dadurch aus der Datei. Beim naechsten
 * Build fehlt es, und die Website laesst sich nicht mehr veroeffentlichen.
 *
 * Dieses Skript vergleicht beide Seiten und meldet Abweichungen.
 * Nach jeder Aenderung an content/*.yaml oder an config.yml ausfuehren.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const config = yaml.load(
  fs.readFileSync(path.resolve('public/admin/config.yml'), 'utf8'),
);

/** Sammelt alle Feldpfade aus einer Decap-Feldliste. */
function pfadeAusConfig(felder, praefix = '') {
  const pfade = new Set();
  for (const feld of felder ?? []) {
    const pfad = praefix ? `${praefix}.${feld.name}` : feld.name;

    if (feld.widget === 'object') {
      // Der Container selbst zaehlt als abgedeckt, dazu seine Unterfelder
      pfade.add(pfad);
      for (const p of pfadeAusConfig(feld.fields, pfad)) pfade.add(p);
    } else if (feld.widget === 'list' && feld.fields) {
      pfade.add(pfad);
      for (const p of pfadeAusConfig(feld.fields, `${pfad}[]`)) pfade.add(p);
    } else {
      pfade.add(pfad);
    }
  }
  return pfade;
}

/** Sammelt alle Feldpfade aus einer eingelesenen YAML-Datei. */
function pfadeAusInhalt(wert, praefix = '') {
  const pfade = new Set();
  if (wert === null || typeof wert !== 'object') return pfade;

  if (Array.isArray(wert)) {
    // Alle Eintraege ansehen - ein optionales Feld kann in nur einem stehen
    for (const eintrag of wert) {
      for (const p of pfadeAusInhalt(eintrag, `${praefix}[]`)) pfade.add(p);
    }
    return pfade;
  }

  for (const [schluessel, inhalt] of Object.entries(wert)) {
    const pfad = praefix ? `${praefix}.${schluessel}` : schluessel;
    pfade.add(pfad);
    if (inhalt && typeof inhalt === 'object' && !Array.isArray(inhalt)) {
      for (const p of pfadeAusInhalt(inhalt, pfad)) pfade.add(p);
    } else if (Array.isArray(inhalt)) {
      for (const p of pfadeAusInhalt(inhalt, pfad)) pfade.add(p);
    }
  }
  return pfade;
}

let fehler = 0;
let geprueft = 0;

console.log('Vergleiche Redaktionsbereich mit den Inhaltsdateien ...');
console.log('');

for (const sammlung of config.collections) {
  // --- Dateien, die als Ganzes bearbeitet werden ---------------------------
  for (const datei of sammlung.files ?? []) {
    const pfad = path.resolve(datei.file);
    if (!fs.existsSync(pfad)) {
      console.log(`  FEHLT: ${datei.file} (in config.yml genannt, aber nicht vorhanden)`);
      fehler++;
      continue;
    }

    const inhalt = yaml.load(fs.readFileSync(pfad, 'utf8'));
    const imEditor = pfadeAusConfig(datei.fields);
    const inDatei = pfadeAusInhalt(inhalt);

    const fehlend = [...inDatei].filter((p) => !imEditor.has(p));
    geprueft++;

    if (fehlend.length > 0) {
      console.log(`  ${datei.file}`);
      fehlend.forEach((p) =>
        console.log(`    ! "${p}" fehlt im Editor - wuerde beim Speichern geloescht`),
      );
      fehler += fehlend.length;
    } else {
      console.log(`  OK  ${datei.file}  (${inDatei.size} Felder abgedeckt)`);
    }
  }

  // --- Ordner mit je einer Datei pro Eintrag -------------------------------
  if (sammlung.folder) {
    const ordner = path.resolve(sammlung.folder);
    if (!fs.existsSync(ordner)) continue;

    const imEditor = pfadeAusConfig(
      sammlung.fields.filter((f) => f.name !== 'body'),
    );

    for (const name of fs.readdirSync(ordner)) {
      const pfad = path.join(ordner, name);
      const roh = fs.readFileSync(pfad, 'utf8');

      // Bei Markdown nur den Kopfbereich zwischen den --- Linien auswerten
      const kopf = name.endsWith('.md')
        ? (roh.match(/^---\r?\n([\s\S]*?)\r?\n---/) ?? [, ''])[1]
        : roh;

      const inhalt = yaml.load(kopf) ?? {};
      const inDatei = pfadeAusInhalt(inhalt);
      const fehlend = [...inDatei].filter((p) => !imEditor.has(p));
      geprueft++;

      if (fehlend.length > 0) {
        console.log(`  ${sammlung.folder}/${name}`);
        fehlend.forEach((p) =>
          console.log(`    ! "${p}" fehlt im Editor - wuerde beim Speichern geloescht`),
        );
        fehler += fehlend.length;
      } else {
        console.log(`  OK  ${sammlung.folder}/${name}  (${inDatei.size} Felder)`);
      }
    }
  }
}

console.log('');
if (fehler > 0) {
  console.error(`FEHLGESCHLAGEN: ${fehler} Feld(er) fehlen in public/admin/config.yml.`);
  console.error('Bitte dort ergaenzen, sonst gehen beim Speichern Daten verloren.');
  process.exit(1);
}

console.log(`Alles in Ordnung: ${geprueft} Dateien geprueft, keine Luecken.`);
