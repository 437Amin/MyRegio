/**
 * Erzeugt die Symbol- und Vorschaubilder aus dem Logo.
 *
 * Aufruf:  node scripts/bilder-erzeugen.mjs
 *
 * Das muss nur einmal laufen bzw. immer dann, wenn sich das Logo aendert.
 * Die erzeugten Dateien liegen anschliessend in public/.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OEFFENTLICH = path.resolve('public');

/* --------------------------------------------------------------- Logo-Zeichen */

const zeichen = (groesse) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${groesse}" height="${groesse}" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#05070A"/>
  <path d="M24 8.5c-6.6 0-12 5.3-12 11.8 0 7.8 10.2 17.8 11.3 18.8a1 1 0 0 0 1.4 0c1.1-1 11.3-11 11.3-18.8 0-6.5-5.4-11.8-12-11.8Z"
        fill="none" stroke="#22b8f0" stroke-width="2.8"/>
  <path d="M18.6 18.9a8 8 0 0 1 10.8 0" fill="none" stroke="#22b8f0" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M21.2 22a4.2 4.2 0 0 1 5.6 0" fill="none" stroke="#22b8f0" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="24" cy="26" r="1.9" fill="#22b8f0"/>
</svg>`;

/* ------------------------------------------------------------- Vorschaubild */
// Wird angezeigt, wenn jemand den Link per WhatsApp weiterschickt.
// Schrift bewusst als Pfade nachgebaut waere zu aufwendig - hier reicht
// eine System-Schrift, weil das Bild spaeter ohnehin durch ein Foto ersetzt
// werden soll (siehe TODO-KUNDE.md).

const vorschau = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="schein" cx="20%" cy="0%" r="85%">
      <stop offset="0%" stop-color="#22b8f0" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#22b8f0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="linie" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22b8f0"/>
      <stop offset="100%" stop-color="#22b8f0" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#05070A"/>
  <rect width="1200" height="630" fill="url(#schein)"/>

  <g transform="translate(88, 74) scale(1.55)">
    <path d="M24 8.5c-6.6 0-12 5.3-12 11.8 0 7.8 10.2 17.8 11.3 18.8a1 1 0 0 0 1.4 0c1.1-1 11.3-11 11.3-18.8 0-6.5-5.4-11.8-12-11.8Z"
          fill="none" stroke="#22b8f0" stroke-width="2.8"/>
    <path d="M18.6 18.9a8 8 0 0 1 10.8 0" fill="none" stroke="#22b8f0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M21.2 22a4.2 4.2 0 0 1 5.6 0" fill="none" stroke="#22b8f0" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="24" cy="26" r="1.9" fill="#22b8f0"/>
  </g>

  <text x="188" y="128" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif"
        font-size="52" font-weight="700" fill="#ffffff">MyRegio<tspan fill="#22b8f0">Car</tspan></text>

  <text x="88" y="286" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif"
        font-size="76" font-weight="700" fill="#ffffff">Ihr Fahrer in Stuttgart.</text>
  <text x="88" y="376" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif"
        font-size="76" font-weight="700" fill="#22b8f0">Direkt gebucht.</text>

  <rect x="88" y="428" width="420" height="3" fill="url(#linie)"/>

  <text x="88" y="490" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif"
        font-size="31" fill="#b3bfcd">Flughafentransfer  ·  Park &amp; Fly  ·  Krankenfahrten</text>
  <text x="88" y="544" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif"
        font-size="27" fill="#6b7887">Steiermärker Str. 3-5  ·  70469 Stuttgart-Feuerbach</text>
</svg>`;

/* ------------------------------------------------------- ICO zusammenbauen */
// Eine .ico-Datei darf ein PNG direkt enthalten. Wir bauen den kleinen
// Dateikopf von Hand, weil sharp das Format nicht schreiben kann.
function alsIco(pngPuffer, kante) {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt16LE(0, 0); // reserviert
  kopf.writeUInt16LE(1, 2); // Typ: Symbol
  kopf.writeUInt16LE(1, 4); // ein Bild enthalten

  const eintrag = Buffer.alloc(16);
  eintrag.writeUInt8(kante >= 256 ? 0 : kante, 0);
  eintrag.writeUInt8(kante >= 256 ? 0 : kante, 1);
  eintrag.writeUInt8(0, 2); // Farbanzahl
  eintrag.writeUInt8(0, 3); // reserviert
  eintrag.writeUInt16LE(1, 4); // Ebenen
  eintrag.writeUInt16LE(32, 6); // Bit pro Bildpunkt
  eintrag.writeUInt32LE(pngPuffer.length, 8);
  eintrag.writeUInt32LE(22, 12); // Beginn der Bilddaten

  return Buffer.concat([kopf, eintrag, pngPuffer]);
}

/* --------------------------------------------------------------------- Lauf */

const erzeugt = [];

// Symbol fuer den Startbildschirm auf iPhone und iPad
await sharp(Buffer.from(zeichen(180)))
  .png()
  .toFile(path.join(OEFFENTLICH, 'apple-touch-icon.png'));
erzeugt.push('apple-touch-icon.png (180x180)');

// Symbol fuer die Lesezeichen-Leiste
await sharp(Buffer.from(zeichen(192)))
  .png()
  .toFile(path.join(OEFFENTLICH, 'favicon-192.png'));
erzeugt.push('favicon-192.png (192x192)');

const ico32 = await sharp(Buffer.from(zeichen(32))).png().toBuffer();
fs.writeFileSync(path.join(OEFFENTLICH, 'favicon.ico'), alsIco(ico32, 32));
erzeugt.push('favicon.ico (32x32)');

// Vorschaubild fuer WhatsApp, Facebook und Co.
await sharp(Buffer.from(vorschau))
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(path.join(OEFFENTLICH, 'og-bild.jpg'));
erzeugt.push('og-bild.jpg (1200x630)');

console.log('Erzeugt in public/:');
erzeugt.forEach((datei) => console.log('  - ' + datei));

// Symbole fuer die Rechnungs-App im Fahrerbereich. Der Vermittlungsdienst
// kann keine Dateien aus public/ ausliefern - deshalb landen sie als Text im
// Quelltext. Android verlangt 192 und 512, das iPhone 180.
const symbole = {};
for (const kante of [180, 192, 512]) {
  const png = await sharp(Buffer.from(zeichen(kante))).png().toBuffer();
  symbole[kante] = png.toString('base64');
}
fs.writeFileSync(
  path.resolve('dispatch/src/app-symbole.ts'),
  `// Erzeugt von scripts/bilder-erzeugen.mjs - nicht von Hand bearbeiten.\n` +
    `export const APP_SYMBOLE: Record<string, string> = {\n` +
    Object.entries(symbole)
      .map(([kante, daten]) => `  '${kante}': '${daten}',`)
      .join('\n') +
    `\n};\n`,
);
console.log('Erzeugt: dispatch/src/app-symbole.ts (180, 192, 512)');
