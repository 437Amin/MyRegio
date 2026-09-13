# MyRegioCar – Website

Akquise-Website für **Önder Sarak Mietwagenunternehmen**, Stuttgart-Feuerbach.

Ziel des Projekts: eigene Aufträge gewinnen, statt von Uber abhängig zu bleiben.
Buchungen laufen über einen geführten Assistenten, der am Ende eine fertige
WhatsApp-Nachricht erzeugt – ohne Server, ohne Vermittler, ohne Provision.

- 📘 **Inhalte pflegen (für den Betreiber):** [`ANLEITUNG.md`](ANLEITUNG.md)
- ✅ **Offene Punkte:** [`TODO-KUNDE.md`](TODO-KUNDE.md)

---

## Schnellstart

```bash
npm install
npm run dev
```

Die Seite läuft dann auf <http://localhost:4321>.

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver mit sofortiger Aktualisierung |
| `npm run build` | Baut die fertige Website nach `dist/` |
| `npm run preview` | Zeigt das Ergebnis von `build` lokal an |
| `node scripts/cms-pruefen.mjs` | Prüft, ob der Redaktionsbereich alle Inhaltsfelder kennt |
| `node scripts/bilder-erzeugen.mjs` | Erzeugt Favicons und das Social-Vorschaubild neu |
| `node scripts/vorschau-bauen.mjs` | Baut ein Vorschau-Paket zum Verschicken (mit `noindex`) |

---

## Technik

- **Astro 5** mit `output: 'static'` – es entsteht reines HTML
- **Tailwind CSS 4** über das Vite-Plugin
- **Zod** zur Prüfung aller Inhaltsdateien beim Build
- **Kein JavaScript-Framework.** Das einzige Skript ist der Buchungsassistent
  (~6,6 kB, 2,7 kB gzip)

### Bewusste Entscheidungen

**Keine externen Ressourcen.** Schriften kommen über `@fontsource-variable` aus
`node_modules` und werden mit ausgeliefert. Es gibt kein Google-Fonts-CDN, keine
Karten-Einbettung, kein Analytics. Folge: keine Cookies, **kein
Cookie-Banner nötig** – und keine Abmahnrisiken durch Drittanbieter-Aufrufe.

Diese Eigenschaft ist prüfbar:

```bash
npm run build
grep -rhoE '<(script|link|img|iframe)[^>]*(src|href)="https?://[^"]+' dist --include=*.html
```

Die Ausgabe muss leer sein. Alle `https://`-Adressen im HTML sind reine
Textlinks zum Anklicken (WhatsApp, OpenStreetMap, Behörden).

**Sprachregelung.** Das Angebot wird durchgängig als „Mietwagen mit Fahrer"
bzw. „Fahrdienst" bezeichnet, **nie** als „Taxi". Als Mietwagenunternehmen nach
§ 49 PBefG wäre das eine unzulässige Verwechslung und abmahnbar. „Taxi" darf nur
in Abgrenzungen vorkommen.

---

## Aufbau

```
content/                 ← Vom Betreiber pflegbar (siehe ANLEITUNG.md)
  einstellungen.yaml       Kontakt, Öffnungszeiten, Anfahrt, Impressumsdaten
  preise.yaml              Preise + Schalter zum Ein-/Ausblenden
  faq.yaml                 Häufige Fragen
  leistungen/*.md          Je eine Datei pro Leistung
  jobs/*.md                Stellenanzeigen
  kundenstimmen/*.yaml     Bewertungen (nur mit freigegeben: true sichtbar)

src/
  config/site.ts           Lädt + prüft die YAML-Dateien, exportiert typisiert
  config/navigation.ts     Menüpunkte
  lib/yaml-laden.ts        YAML-Leser mit deutschen Fehlermeldungen
  content.config.ts        Schemas für die Markdown-Sammlungen
  components/              Bausteine (Buchungsassistent, Header, Footer, …)
  scripts/                 Der Buchungsassistent (Vanilla TypeScript)
  layouts/BaseLayout.astro
  pages/                   Die Seiten
  styles/global.css        Design-Tokens und wiederkehrende Bausteine

scripts/bilder-erzeugen.mjs   Erzeugt Favicons und og-bild.jpg aus dem Logo
```

### Redaktionsbereich unter `/admin`

Decap CMS mit **DecapBridge** als Anmeldedienst: Önder meldet sich mit E-Mail
und Passwort an und braucht **kein GitHub-Konto**. Seine Änderungen landen als
Commit im Repository, Netlify baut daraufhin neu.

Einrichtung siehe [`TODO-KUNDE.md`](TODO-KUNDE.md), Abschnitt „Redaktionsbereich
einrichten". In `public/admin/config.yml` sind `repo` und `identity_url` als
Platzhalter markiert.

Zwei Dinge, die man dabei wissen muss:

**Fehlende Felder werden gelöscht.** Decap schreibt eine Inhaltsdatei beim
Speichern komplett aus den Feldern in `config.yml` neu. Ein Feld, das dort
fehlt, verschwindet aus der Datei. Deshalb gibt es:

```bash
node scripts/cms-pruefen.mjs
```

Das Skript vergleicht `config.yml` mit allen Dateien in `content/` und meldet
Lücken. Nach jeder Änderung an der Inhaltsstruktur ausführen.

**Kommentare überleben das Speichern nicht.** Die erklärenden Kommentarköpfe in
den YAML-Dateien sind weg, sobald Önder eine Datei über den Editor speichert.
Die Erklärungen stehen deshalb zusätzlich als `hint:` an den Feldern in
`config.yml` – dort sieht er sie direkt beim Bearbeiten.

Ausnahme von der Drittanbieter-Regel: Die Seite `/admin` lädt den Editor von
unpkg. Das betrifft ausschließlich diese Redaktionsseite – die öffentliche
Website lädt weiterhin nichts von fremden Servern. `/admin` ist in
`robots.txt` gesperrt und trägt `noindex`.

### Inhalte sind gegen Tippfehler abgesichert

Jede Datei in `content/` wird beim Build gegen ein Zod-Schema geprüft. Schlägt
das fehl, bricht der Build **mit einer verständlichen deutschen Meldung** ab:

```
----------------------------------------------------------------------
  FEHLER IN DER DATEI:  content/einstellungen.yaml
----------------------------------------------------------------------

  Folgende Angaben stimmen nicht:

  * kontakt -> whatsapp: Die WhatsApp-Nummer darf NUR Ziffern enthalten -
    ohne +, ohne Leerzeichen, ohne die 0 am Anfang.

  Die Website wurde NICHT veroeffentlicht.
  Die bisherige Fassung bleibt unveraendert online - es ist nichts kaputt.
----------------------------------------------------------------------
```

Der Betreiber kann sich also nicht selbst aussperren: Ein fehlerhafter Stand
geht gar nicht erst online.

---

## Der Buchungsassistent

`src/components/Buchungsassistent.astro` + `src/scripts/buchungsassistent.ts`

Fünf Schritte: Anlass → Strecke → Termin → Details → Absenden. Am Ende entsteht
ein `https://wa.me/<nummer>?text=<…>`-Link mit einer fertig formulierten
Nachricht.

Eigenschaften:

- **Keine Datenübertragung vor dem Tippen.** Alles bleibt im Browser; der
  Zwischenstand liegt in `sessionStorage` (in `try/catch`, weil der private
  Modus werfen kann) und wird nach dem Absenden gelöscht.
- **Bei „Park & Fly" andere Felder** – Kennzeichen, Zeitraum, Shuttle statt
  Abhol- und Zieladresse. Gesteuert über `data-nur-art` / `data-ohne-art`.
- **Ohne JavaScript kein totes Formular.** Der Assistent erscheint nur bei
  `html.js`; sonst stehen an derselben Stelle WhatsApp- und Telefon-Knopf.
- Der Sende-Knopf ist ein echtes `<a>`, dessen `href` laufend aktualisiert
  wird – so gibt es keine Probleme mit Popup-Blockern.
- Vorauswahl möglich: `<Buchungsassistent vorauswahl="Park & Fly" />`

---

## Auftragsvermittlung (`dispatch/`)

Ein eigener Dienst auf Cloudflare Workers, getrennt von der Website. Er nimmt
Bestellungen entgegen und fragt die eingeteilten Fahrer nacheinander über
Telegram, bis jemand zusagt.

```
Kunde bestellt auf der Website
  → Auftrag wird angelegt und der Eingang protokolliert (§ 49 PBefG)
  → Fahrer 1 bekommt Telegram-Nachricht mit [Annehmen] [Ablehnen]
  → keine Antwort binnen 40 Sekunden oder Ablehnung → Fahrer 2, 3, …
  → Annahme: Name und Rufnummer des Fahrgasts werden nachgereicht
  → niemand nimmt an → Meldung an den Chef
```

**Warum Durable Objects.** Je Auftrag existiert genau ein Objekt, dessen
Aufrufe Cloudflare nacheinander ausführt – dadurch können zwei Fahrer nicht
gleichzeitig denselben Auftrag annehmen, ohne dass wir sperren müssen. Der
40-Sekunden-Wecker läuft in der Cloudflare-Infrastruktur und nicht in einem
Prozess, den nachts jemand neu starten müsste.

**Zwei Feinheiten, die leicht zu übersehen sind:**

- Die Schichtauswahl richtet sich nach der Zeit der **Fahrt**, nicht der
  Bestellung. Wer nachts für den nächsten Morgen bestellt, erreicht die
  Tagfahrer.
- Gerechnet wird in **deutscher Ortszeit**. Cloudflare läuft in UTC; ohne
  Umrechnung wäre 23 Uhr im Sommer intern 21 Uhr und damit fälschlich
  Tagschicht. Dafür gibt es eigene Tests.

**Fahrerdaten** liegen in der Cloudflare-Datenbank und bewusst **nicht** im
Repository. Verwaltet werden sie unter `<worker>/fahrer` hinter einem Passwort.

### Befehle

```bash
cd dispatch
npm run dev          # lokal, mit eigener Datenbank
npx vitest run       # Modultests der Schichtauswahl
npm run deploy       # veröffentlichen
```

### End-zu-Ende-Probe

Ohne echte Telegram-Nachrichten zu verschicken – eine Attrappe zeichnet auf,
wer was bekommen hätte:

```bash
node test/telegram-attrappe.mjs      # Fenster 1
npx wrangler dev --port 8788         # Fenster 2
npx wrangler d1 execute vermittlung --local --file=test/testdaten.sql
node test/ablauf.mjs                 # Fenster 3
```

Prüft Annahme, Ablehnung, Zeitablauf, Eskalation an den Chef und die
Absicherungen (fehlende Angaben, unsinnige Rufnummer, Telegram-Aufruf ohne
Geheimnis).

### Anschluss an die Website

Der Buchungsassistent zeigt „Jetzt Fahrer anfordern" nur, wenn in
`content/einstellungen.yaml` unter `vermittlung` sowohl `aktiv: true` steht
**als auch** eine Adresse hinterlegt ist. Andernfalls läuft alles wie zuvor
über WhatsApp. An denselben Schalter hängt auch der zusätzliche Abschnitt in
der Datenschutzerklärung – der Text beschreibt also immer den tatsächlichen
Stand.

Für Park & Fly bleibt es bewusst bei WhatsApp: Einen Stellplatz kann man
keinem Fahrer zuteilen.

## Veröffentlichen

### Cloudflare Pages (produktiv)

Cloudflare Pages baut die Seite selbst. Es gibt deshalb **keinen
Deploy-Workflow und keine FTP-Zugangsdaten** – Cloudflare holt sich den Code
bei jedem Push direkt aus dem Repository.

Damit funktioniert auch der Redaktionsbereich – die Kette ist:

```
Önder speichert unter /admin
   → DecapBridge schreibt einen Commit ins Repository
   → Cloudflare Pages baut die Seite neu und veröffentlicht sie
```

Einstellungen bei Cloudflare: Build-Befehl `npm run build`,
Bereitstellungsbefehl `npx wrangler deploy`. Was dabei veröffentlicht wird,
steht in `wrangler.toml` im Hauptverzeichnis – nicht zu verwechseln mit
`dispatch/wrangler.toml`, die zum Vermittlungsdienst gehört.

Schlägt `npm run build` fehl, wird **nichts** veröffentlicht – die bisherige
Website bleibt unverändert online. Deshalb ruft das `build`-Skript in
`package.json` zuerst `scripts/cms-pruefen.mjs` auf: Die Prüfung des
Redaktionsbereichs muss dort stehen, wo tatsächlich gebaut wird, sonst fällt
sie bei einem Hosterwechsel lautlos weg.

`public/_headers` und `public/_redirects` liefern die Servereinstellungen mit:
Sicherheits-Kopfzeilen, Cache-Regeln und die Festlegung auf `www`.
HTTPS, Komprimierung und die eigene 404-Seite erledigt Cloudflare von sich aus.

### Netlify (Vorschau)

`netlify.toml` liegt weiterhin im Projekt. Für Kundenvorschauen eignet sich:

```bash
node scripts/vorschau-bauen.mjs
```

Das erzeugt ein Paket mit `noindex` und Vorschau-Hinweis, das sich bei
app.netlify.com/drop ablegen lässt. **Nicht** für den Livegang verwenden –
dafür `npm run build`.

### Nach dem Domainwechsel

1. In `astro.config.mjs` die echte Domain bei `SEITEN_URL` eintragen
2. Dieselbe Domain in `public/robots.txt` bei `Sitemap:` eintragen
3. Auf **eine** Schreibweise festlegen (mit oder ohne `www`) – die Weiche
   dafür steht in `public/_redirects`, die Weiterleitung der nackten Domain
   zusätzlich beim Domainanbieter (IONOS)
4. `sitemap-index.xml` in der Google Search Console einreichen

---

## Geprüft

- Alle 14 Seiten bauen fehlerfrei
- Kein seitliches Scrollen bei 320 px, 375 px und Desktop
- Buchungsassistent vollständig durchgespielt, beide Varianten (Standard und
  Park & Fly), Validierung je Schritt, korrekt kodierte `wa.me`-URL
- Keine Konsolenfehler, keine Drittanbieter-Anfragen
- Redaktionstests: Nummernwechsel schlägt auf allen Seiten inkl. JSON-LD durch;
  neue Stellenanzeige erscheint automatisch; Preisschalter wirkt; fehlerhafte
  Inhalte brechen den Build mit deutscher Meldung ab
- JSON-LD: `LocalBusiness` + `FAQPage`; Sitemap mit 11 Seiten
  (Impressum/Datenschutz bewusst ausgenommen)

## Bewusst nicht enthalten

Sichtbare Preistabelle (gebaut, aber ausgeschaltet), `/admin`-Editor,
englische Sprachversion, Buchungssystem mit Datenbank, Online-Zahlung.

Die Inhalte liegen bereits in Astro-Collections. Ein `/admin`-Editor
(z. B. Sveltia CMS) ließe sich daher später mit einer einzigen
Konfigurationsdatei nachrüsten, ohne etwas umzubauen.
