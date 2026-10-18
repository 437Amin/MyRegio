/**
 * Gestaltete Bilder fuer Verzeichnisse - Google-Unternehmensprofil und
 * aehnliche Stellen.
 *
 * Aufruf:  node scripts/profilbilder.mjs
 *
 * Gleiche Bildsprache wie das Vorschaubild in scripts/bilder-erzeugen.mjs:
 * dunkler Grund, ein cyanfarbener Schein oben links, Logo, zwei Zeilen
 * Aussage, eine Trennlinie, darunter die Einordnung.
 *
 * Jedes Motiv entsteht ZWEIMAL:
 *
 *   marke/profil-<name>.jpg          1200x675  - breit, fuers Titelbild
 *                                               und fuer Links in Messengern
 *   marke/profil-<name>-quadrat.jpg  1200x1200 - fuer die Fotogalerie
 *
 * Der Grund fuer das Quadrat: Google beschneidet Fotos in der Galerie
 * quadratisch. Vom breiten Bild fallen links und rechts je gut 260 Pixel
 * weg - und genau dort steht der Text. Aus "MyRegioCar" wird dann
 * "RegioCar". Nur das Titelbild (Hintergrundbild) bleibt breit, das zeigt
 * Google ungeschnitten.
 *
 * WICHTIG: Das ersetzt keine Fotos. Google zeigt Eintraege mit echten
 * Aufnahmen vom Betrieb deutlich haeufiger, und ein Fahrgast will das
 * Fahrzeug sehen. Diese Bilder fuellen die Luecke, bis es Fotos gibt - und
 * taugen danach weiter fuer die Aussagen, die sich nicht fotografieren
 * lassen ("Festpreis vorab").
 *
 * Die Zeilen sind bewusst kurz gehalten: Bei 1200 Pixeln Breite passen in
 * der grossen Schrift etwa 26 Zeichen. Laengere Zeilen laufen aus dem Bild,
 * ohne dass es jemand merkt - deshalb prueft das Skript die Laenge.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SCHRIFT = 'Segoe UI, DejaVu Sans, Arial, sans-serif';
const HOECHSTZEICHEN = 26;
// Die Unterzeile laeuft in kleinerer, nicht fetter Schrift - da passt mehr,
// aber auch nicht beliebig viel.
const HOECHSTZEICHEN_UNTEN = 56;

const ANSCHRIFT = 'Steiermärker Str. 3-5  ·  70469 Stuttgart-Feuerbach';

/** & und < wuerden die SVG zerreissen. */
const sicher = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function laengePruefen({ zeile1, zeile2, unterzeile }) {
  for (const zeile of [zeile1, zeile2]) {
    if (zeile.length > HOECHSTZEICHEN) {
      throw new Error(`Zu lang (${zeile.length} Zeichen, erlaubt ${HOECHSTZEICHEN}): "${zeile}"`);
    }
  }
  if (unterzeile.length > HOECHSTZEICHEN_UNTEN) {
    throw new Error(
      `Unterzeile zu lang (${unterzeile.length} Zeichen, erlaubt ${HOECHSTZEICHEN_UNTEN}): "${unterzeile}"`,
    );
  }
}

/** Grund und Schein - in beiden Formaten gleich. */
const untergrund = (breite, hoehe) => `
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

  <rect width="${breite}" height="${hoehe}" fill="#05070A"/>
  <rect width="${breite}" height="${hoehe}" fill="url(#schein)"/>`;

/** Das Zeichen aus public/favicon.svg, auf Groesse gebracht. */
const zeichen = (x, y, mass) => `
  <g transform="translate(${x}, ${y}) scale(${mass})">
    <path d="M24 8.5c-6.6 0-12 5.3-12 11.8 0 7.8 10.2 17.8 11.3 18.8a1 1 0 0 0 1.4 0c1.1-1 11.3-11 11.3-18.8 0-6.5-5.4-11.8-12-11.8Z"
          fill="none" stroke="#22b8f0" stroke-width="2.8"/>
    <path d="M18.6 18.9a8 8 0 0 1 10.8 0" fill="none" stroke="#22b8f0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M21.2 22a4.2 4.2 0 0 1 5.6 0" fill="none" stroke="#22b8f0" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="24" cy="26" r="1.9" fill="#22b8f0"/>
  </g>`;

/** Breit - fuers Titelbild und fuer Vorschauen in Messengern. */
function bild({ zeile1, zeile2, unterzeile }) {
  laengePruefen({ zeile1, zeile2, unterzeile });

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  ${untergrund(1200, 675)}
  ${zeichen(88, 72, 1.45)}

  <text x="178" y="122" font-family="${SCHRIFT}" font-size="48" font-weight="700"
        fill="#ffffff">MyRegio<tspan fill="#22b8f0">Car</tspan></text>

  <text x="88" y="310" font-family="${SCHRIFT}" font-size="68" font-weight="700"
        fill="#ffffff">${sicher(zeile1)}</text>
  <text x="88" y="396" font-family="${SCHRIFT}" font-size="68" font-weight="700"
        fill="#22b8f0">${sicher(zeile2)}</text>

  <rect x="88" y="452" width="420" height="3" fill="url(#linie)"/>

  <text x="88" y="516" font-family="${SCHRIFT}" font-size="30"
        fill="#b3bfcd">${sicher(unterzeile)}</text>
  <text x="88" y="578" font-family="${SCHRIFT}" font-size="26"
        fill="#6b7887">${ANSCHRIFT}</text>
</svg>`;
}

/**
 * Quadratisch - fuer die Fotogalerie bei Google.
 *
 * Derselbe Aufbau, nur gestreckt: Logo oben, Aussage in der unteren
 * Haelfte, Anschrift am Fuss. Der Text bleibt an derselben linken Kante,
 * damit beide Formate nebeneinander wie eine Familie wirken.
 */
function bildQuadrat({ zeile1, zeile2, unterzeile }) {
  laengePruefen({ zeile1, zeile2, unterzeile });

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  ${untergrund(1200, 1200)}
  ${zeichen(88, 110, 1.6)}

  <text x="187" y="165" font-family="${SCHRIFT}" font-size="52" font-weight="700"
        fill="#ffffff">MyRegio<tspan fill="#22b8f0">Car</tspan></text>

  <text x="88" y="550" font-family="${SCHRIFT}" font-size="68" font-weight="700"
        fill="#ffffff">${sicher(zeile1)}</text>
  <text x="88" y="642" font-family="${SCHRIFT}" font-size="68" font-weight="700"
        fill="#22b8f0">${sicher(zeile2)}</text>

  <rect x="88" y="702" width="420" height="3" fill="url(#linie)"/>

  <text x="88" y="766" font-family="${SCHRIFT}" font-size="30"
        fill="#b3bfcd">${sicher(unterzeile)}</text>
  <text x="88" y="1100" font-family="${SCHRIFT}" font-size="26"
        fill="#6b7887">${ANSCHRIFT}</text>
</svg>`;
}

const MOTIVE = [
  {
    // Das Titelbild. Steht fuer den ganzen Betrieb, nicht fuer eine
    // einzelne Leistung - es ist das erste, was jemand sieht.
    datei: 'profil-titelbild',
    zeile1: 'Ihr Fahrer in Stuttgart.',
    zeile2: 'Direkt gebucht.',
    unterzeile: 'Flughafen  ·  Termine  ·  Alltag  ·  Park & Fly',
  },
  {
    datei: 'profil-festpreis',
    zeile1: 'Der Preis steht,',
    zeile2: 'bevor Sie einsteigen.',
    unterzeile: 'Kein Zähler  ·  kein Aufschlag im Stau',
  },
  {
    datei: 'profil-flughafen',
    zeile1: 'Zum Flughafen.',
    zeile2: 'Pünktlich und fest.',
    unterzeile: 'Flughafen- und Messetransfer rund um Stuttgart',
  },
  {
    datei: 'profil-parkandfly',
    zeile1: 'Parken in Feuerbach,',
    zeile2: 'einsteigen, weg.',
    unterzeile: 'Park & Fly  ·  2 Gehminuten zur U6',
  },
  {
    datei: 'profil-24-7',
    zeile1: 'Rund um die Uhr.',
    zeile2: 'Auch um vier.',
    unterzeile: 'Frühe Flüge, späte Rückfahrten, Wochenende',
  },
  {
    datei: 'profil-krankenfahrten',
    zeile1: 'Zum Arzt.',
    zeile2: 'Und wieder zurück.',
    unterzeile: 'Krankenfahrten  ·  wir warten, wenn Sie möchten',
  },
  {
    datei: 'profil-direkt',
    zeile1: 'Direkt beim',
    zeile2: 'Unternehmen.',
    unterzeile: 'Keine App, kein Vermittler, keine Provision',
  },
];

await mkdir('marke', { recursive: true });

for (const motiv of MOTIVE) {
  for (const [zusatz, bauen] of [['', bild], ['-quadrat', bildQuadrat]]) {
    const ziel = `marke/${motiv.datei}${zusatz}.jpg`;
    await sharp(Buffer.from(bauen(motiv)))
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(ziel);
    console.log(`${ziel} · „${motiv.zeile1} ${motiv.zeile2}"`);
  }
}
