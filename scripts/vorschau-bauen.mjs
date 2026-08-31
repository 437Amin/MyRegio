/**
 * Baut eine VORSCHAU-Fassung der Website zum Verschicken.
 *
 * Aufruf:  node scripts/vorschau-bauen.mjs
 *
 * Unterschied zur normalen Fassung:
 *   1. Suchmaschinen wird das Indexieren untersagt (noindex + robots.txt).
 *      Sonst landet die Vorschau mit Platzhalter-Telefonnummer bei Google.
 *   2. Oben auf jeder Seite steht ein Hinweisstreifen, dass es sich um eine
 *      Vorschau handelt und welche Angaben noch Platzhalter sind.
 *
 * Der Quellcode wird dabei NICHT verändert - nur der fertige Ordner dist/.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZIEL = path.resolve('dist');
const PAKET = path.resolve('myregiocar-vorschau.zip');

console.log('Baue die Website ...');
execSync('npm run build', { stdio: 'inherit' });

/* --------------------------------------------------------- Hinweisstreifen */

const streifen = `<div style="background:#22b8f0;color:#05070a;font:600 14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 18px;text-align:center">
Vorschau &ndash; noch nicht ver&ouml;ffentlicht. Telefonnummer, WhatsApp-Nummer und Preise sind bislang Platzhalter.
</div>`;

const noindex = '<meta name="robots" content="noindex, nofollow" />';

/* ------------------------------------------------------- Alle Seiten anpassen */

function htmlDateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((eintrag) => {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) return htmlDateien(voll);
    return eintrag.name.endsWith('.html') ? [voll] : [];
  });
}

const seiten = htmlDateien(ZIEL);

seiten.forEach((datei) => {
  let inhalt = fs.readFileSync(datei, 'utf8');

  // Suchmaschinen aussperren, falls noch kein robots-Eintrag vorhanden ist
  if (!inhalt.includes('name="robots"')) {
    inhalt = inhalt.replace('</head>', `${noindex}</head>`);
  }

  // Hinweisstreifen direkt hinter dem oeffnenden body-Tag einsetzen
  inhalt = inhalt.replace(/(<body[^>]*>)/, `$1${streifen}`);

  fs.writeFileSync(datei, inhalt, 'utf8');
});

/* -------------------------------------------------------------- robots.txt */

// Crawlen wird ABSICHTLICH erlaubt.
// Ein "Disallow" wuerde Suchmaschinen davon abhalten, die Seiten ueberhaupt
// zu lesen - und damit auch den noindex-Hinweis nie zu sehen. Wird die Adresse
// dann irgendwo verlinkt, kann Google sie als nackten Treffer ohne Inhalt
// listen. Richtig herum ist: lesen lassen, aber klar "nicht aufnehmen" sagen.
fs.writeFileSync(
  path.join(ZIEL, 'robots.txt'),
  [
    'User-agent: *',
    'Allow: /',
    '',
    '# Vorschau-Fassung.',
    '# Das Nicht-Indexieren regeln der noindex-Hinweis auf jeder Seite',
    '# und der X-Robots-Tag im HTTP-Kopf (siehe Datei _headers).',
    '# Dafuer muessen Suchmaschinen die Seiten lesen duerfen.',
    '',
  ].join('\n'),
  'utf8',
);

// Netlify liest diese Datei und setzt die Kopfzeilen fuer jede Auslieferung.
// Wirkt auch fuer Bilder und PDFs, nicht nur fuer HTML.
fs.writeFileSync(
  path.join(ZIEL, '_headers'),
  ['/*', '  X-Robots-Tag: noindex, nofollow', ''].join('\n'),
  'utf8',
);

// Die Sitemap wuerde Suchmaschinen erst recht einladen
['sitemap-index.xml', 'sitemap-0.xml'].forEach((name) => {
  const pfad = path.join(ZIEL, name);
  if (fs.existsSync(pfad)) fs.unlinkSync(pfad);
});

/* ============================================================================
   Zip-Paket schnueren

   ACHTUNG, hier steckt eine Falle:
   Das Windows-Bordmittel Compress-Archive schreibt Backslashes als Pfadtrenner
   in die Zip-Datei. Der ZIP-Standard verlangt aber Schraegstriche. Linux-Server
   wie Netlify lesen "_astro\style.css" dann als EINEN Dateinamen im
   Hauptverzeichnis - die Seite laedt danach ohne Stylesheet und ohne Skript.

   Deshalb bauen wir die Datei hier selbst, mit garantiert korrekten Pfaden.
   ========================================================================== */

const crcTabelle = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(puffer) {
  let c = 0xffffffff;
  for (let i = 0; i < puffer.length; i++) {
    c = crcTabelle[(c ^ puffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosStempel(datum) {
  const zeit =
    ((datum.getHours() << 11) |
      (datum.getMinutes() << 5) |
      Math.floor(datum.getSeconds() / 2)) &
    0xffff;
  const tag =
    (((datum.getFullYear() - 1980) << 9) |
      ((datum.getMonth() + 1) << 5) |
      datum.getDate()) &
    0xffff;
  return { zeit, tag };
}

function alleDateien(ordner, wurzel = ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((eintrag) => {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) return alleDateien(voll, wurzel);
    return [
      {
        // Immer Schraegstriche - genau darauf kommt es an
        name: path.relative(wurzel, voll).split(path.sep).join('/'),
        pfad: voll,
      },
    ];
  });
}

const dateien = alleDateien(ZIEL);
const lokaleTeile = [];
const zentraleTeile = [];
let versatz = 0;

for (const datei of dateien) {
  const roh = fs.readFileSync(datei.pfad);
  const gepackt = zlib.deflateRawSync(roh, { level: 9 });
  const pruefsumme = crc32(roh);
  const { zeit, tag } = dosStempel(new Date());
  const name = Buffer.from(datei.name, 'utf8');

  const lokal = Buffer.alloc(30);
  lokal.writeUInt32LE(0x04034b50, 0); // Kennung
  lokal.writeUInt16LE(20, 4); // benoetigte Version
  lokal.writeUInt16LE(0x0800, 6); // Namen sind UTF-8
  lokal.writeUInt16LE(8, 8); // Verfahren: deflate
  lokal.writeUInt16LE(zeit, 10);
  lokal.writeUInt16LE(tag, 12);
  lokal.writeUInt32LE(pruefsumme, 14);
  lokal.writeUInt32LE(gepackt.length, 18);
  lokal.writeUInt32LE(roh.length, 22);
  lokal.writeUInt16LE(name.length, 26);
  lokal.writeUInt16LE(0, 28); // keine Zusatzfelder
  lokaleTeile.push(lokal, name, gepackt);

  const zentral = Buffer.alloc(46);
  zentral.writeUInt32LE(0x02014b50, 0);
  zentral.writeUInt16LE(20, 4); // erzeugt von
  zentral.writeUInt16LE(20, 6); // benoetigte Version
  zentral.writeUInt16LE(0x0800, 8);
  zentral.writeUInt16LE(8, 10);
  zentral.writeUInt16LE(zeit, 12);
  zentral.writeUInt16LE(tag, 14);
  zentral.writeUInt32LE(pruefsumme, 16);
  zentral.writeUInt32LE(gepackt.length, 20);
  zentral.writeUInt32LE(roh.length, 24);
  zentral.writeUInt16LE(name.length, 28);
  zentral.writeUInt32LE(versatz, 42); // Beginn des lokalen Kopfes
  zentraleTeile.push(zentral, name);

  versatz += lokal.length + name.length + gepackt.length;
}

const zentralBlock = Buffer.concat(zentraleTeile);
const abschluss = Buffer.alloc(22);
abschluss.writeUInt32LE(0x06054b50, 0);
abschluss.writeUInt16LE(dateien.length, 8);
abschluss.writeUInt16LE(dateien.length, 10);
abschluss.writeUInt32LE(zentralBlock.length, 12);
abschluss.writeUInt32LE(versatz, 16);

fs.writeFileSync(
  PAKET,
  Buffer.concat([...lokaleTeile, zentralBlock, abschluss]),
);

/* -------------------------------------------------------------- Kontrolle */

const falsch = dateien.filter((d) => d.name.includes('\\'));
if (falsch.length > 0) {
  throw new Error(
    'Es sind Backslashes in die Pfade geraten - das Paket waere unbrauchbar.',
  );
}

const groesse = (fs.statSync(PAKET).size / 1024).toFixed(0);

console.log('');
console.log('Vorschau fertig:');
console.log(`  ${seiten.length} Seiten mit Hinweisstreifen und noindex versehen`);
console.log('  X-Robots-Tag im HTTP-Kopf gesetzt, Sitemap entfernt');
console.log(`  ${dateien.length} Dateien gepackt, alle Pfade mit Schraegstrich`);
console.log('');
console.log(`Fertiges Paket:  ${path.basename(PAKET)}  (${groesse} KB)`);
console.log('Bei app.netlify.com/drop ablegen.');
console.log('');
console.log('!! ACHTUNG fuer den spaeteren Livegang:');
console.log('   Dieses Paket ist fuer Suchmaschinen gesperrt und traegt den');
console.log('   Vorschau-Hinweis. Fuer die echte Veroeffentlichung NICHT dieses');
console.log('   Skript nehmen, sondern:  npm run build');
