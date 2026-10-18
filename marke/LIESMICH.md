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

Erzeugt mit `node scripts/profilbilder.mjs`, dieselbe Bildsprache wie das
Vorschaubild. Jedes Motiv entsteht **zweimal**:

- `profil-<name>.jpg` – 1200×675 (16:9), fürs Titelbild und für Links in
  Messengern
- `profil-<name>-quadrat.jpg` – 1200×1200, für die Fotogalerie

Der Grund fürs Quadrat: **Google beschneidet Galeriebilder quadratisch.** Vom
breiten Bild fallen links und rechts je gut 260 Pixel weg – und genau dort
steht der Text. Aus „MyRegioCar" wird dann „RegioCar". Geöffnet ist das Bild
zwar vollständig, aber die Kachel ist das, was die meisten überhaupt sehen.
Nur das Titelbild bleibt breit, das zeigt Google ungeschnitten.

| Datei | Aussage |
|---|---|
| `profil-titelbild.jpg` | Ihr Fahrer in Stuttgart, direkt gebucht – **das Titelbild** |
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

Als **Titelbild** gehört `profil-titelbild.jpg` dorthin: Es steht für den
ganzen Betrieb. Ein Motiv zu einer einzelnen Leistung wäre an dieser Stelle
zu eng – es ist das erste, was jemand sieht.

Das Titelbild ist als einziges Motiv **mittig** aufgebaut und bleibt dabei
innerhalb des mittleren Quadrats von 675 Pixeln Breite. Grund: Google zeigt
das Hintergrundbild je nach Stelle breit **oder** quadratisch beschnitten –
linksbündig fiel der Zeilenanfang weg („hr Fahrer in Stuttgart"). Die Schrift
fällt dadurch kleiner aus als bei den übrigen Motiven; das ist der Preis
dafür. Wer den Aufbau ändert, prüft das Ergebnis mit einem Zuschnitt auf 1:1
nach.

**Neue Motive** kommen in die Liste `MOTIVE` im Skript. Die beiden großen
Zeilen dürfen höchstens 26 Zeichen haben; das Skript bricht ab, wenn eine
länger ist. Ohne diese Prüfung liefe der Text aus dem Bild, ohne dass es
jemand merkt.
