/**
 * Erzeugt das Logo in den Groessen, die Google fuer das Unternehmensprofil
 * verlangt (quadratisch, mindestens 250 Pixel, empfohlen 720).
 *
 * Grundlage ist public/favicon.svg - dieselbe Marke wie auf der Website, nur
 * gross gerechnet. Nichts neu gezeichnet, nichts erfunden.
 */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const quelle = await readFile('public/favicon.svg', 'utf8');
await mkdir('marke', { recursive: true });

// Das Zeichen sitzt im Original eng am Rand. Fuer ein Logo, das Google auch
// rund beschneidet, braucht es Luft - deshalb wird der Inhalt verkleinert und
// auf eine groessere Flaeche gesetzt.
const mitRand = quelle.replace(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 60 60">',
).replace(
  '<rect width="48" height="48" rx="10" fill="#05070A"/>',
  '<rect x="-6" y="-6" width="60" height="60" fill="#05070A"/>',
);

for (const groesse of [720, 512, 250]) {
  const datei = `marke/logo-${groesse}.png`;
  await sharp(Buffer.from(mitRand), { density: 600 })
    .resize(groesse, groesse)
    .png()
    .toFile(datei);
  console.log(`${datei} · ${groesse}x${groesse}`);
}

// Dasselbe Zeichen auf Weiss - manche Stellen zeigen Logos auf hellem Grund
const aufWeiss = mitRand.replace('fill="#05070A"', 'fill="#FFFFFF"');
await sharp(Buffer.from(aufWeiss), { density: 600 })
  .resize(720, 720)
  .png()
  .toFile('marke/logo-720-hell.png');
console.log('marke/logo-720-hell.png · 720x720 (heller Grund)');

await writeFile('marke/logo-720.svg', mitRand, 'utf8');
console.log('marke/logo-720.svg · unbegrenzt skalierbar');
