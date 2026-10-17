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

---

## Bilder für Verzeichnisse

Erzeugt mit `node scripts/profilbilder.mjs`, 1200×675 (16:9), dieselbe
Bildsprache wie das Vorschaubild.

| Datei | Aussage |
|---|---|
| `profil-festpreis.jpg` | Der Preis steht, bevor Sie einsteigen |
| `profil-flughafen.jpg` | Zum Flughafen, pünktlich und fest |
| `profil-parkandfly.jpg` | Parken in Feuerbach, einsteigen, weg |
| `profil-24-7.jpg` | Rund um die Uhr, auch um vier |
| `profil-krankenfahrten.jpg` | Zum Arzt und wieder zurück |
| `profil-direkt.jpg` | Direkt beim Unternehmen |

**Sie ersetzen keine Fotos.** Google zeigt Einträge mit echten Aufnahmen vom
Betrieb deutlich häufiger, und ein Fahrgast will das Fahrzeug sehen. Diese
Bilder füllen die Lücke, bis es Fotos gibt – und taugen danach weiter für die
Aussagen, die sich nicht fotografieren lassen.

**Neue Motive** kommen in die Liste `MOTIVE` im Skript. Die beiden großen
Zeilen dürfen höchstens 26 Zeichen haben; das Skript bricht ab, wenn eine
länger ist. Ohne diese Prüfung liefe der Text aus dem Bild, ohne dass es
jemand merkt.
