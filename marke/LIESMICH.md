# Markenbilder

Erzeugt mit `node scripts/logo-bauen.mjs` aus `public/favicon.svg` – dieselbe
Marke wie auf der Website, nur groß gerechnet. Wer das Zeichen ändert, ändert
die SVG-Datei und lässt das Skript erneut laufen.

| Datei | Größe | Wofür |
|---|---|---|
| `logo-720.png` | 720×720 | Google-Unternehmensprofil, Verzeichnisse, überall auf dunklem Grund |
| `logo-720-hell.png` | 720×720 | dasselbe Zeichen auf weißem Grund |
| `logo-512.png` | 512×512 | kleinere Einbindungen |
| `logo-250.png` | 250×250 | Googles Mindestmaß |
| `logo-720.svg` | beliebig | für Druck und alles Größere |

Als **Titelbild** bei Google eignet sich `public/og-bild.jpg` (1200×630) – es
erfüllt Googles Seitenverhältnis von 16:9 und ist bereits das Bild, das beim
Teilen der Website erscheint.

Die Dateien liegen bewusst **nicht** unter `public/`: Sie gehören nicht auf
die Website, sondern zu den Stellen, an denen das Unternehmen eingetragen ist.
