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
| `node scripts/cms-pruefen.mjs` | Prüft, ob der (vorbereitete) Redaktionsbereich alle Inhaltsfelder kennt – läuft bei jedem Build mit |
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

### Redaktionsbereich – vorbereitet, aber bewusst nicht aktiv

**Stand 13.09.2026:** Änderungen an der Website laufen über Amin. Önder pflegt
selbst nur, was im Fahrerbereich des Vermittlungsdienstes liegt – Fahrer,
Schichten, Festpreise, Rechnungen.

Der Redaktionsbereich (Decap CMS mit **DecapBridge** als Anmeldedienst, Login
per E-Mail und Passwort ohne GitHub-Konto) ist fertig vorbereitet und liegt in
`redaktionsbereich/` – **außerhalb von `public/`**, damit er nicht
veröffentlicht wird. `repo` ist bereits eingetragen, es fehlt nur
`identity_url` von DecapBridge.

Einschalten in etwa 20 Minuten, Schritte im Kopf von
`redaktionsbereich/config.yml` und in [`TODO-KUNDE.md`](TODO-KUNDE.md).

Zwei Dinge, die man dabei wissen muss:

**Fehlende Felder werden gelöscht.** Decap schreibt eine Inhaltsdatei beim
Speichern komplett aus den Feldern in `config.yml` neu. Ein Feld, das dort
fehlt, verschwindet aus der Datei. Deshalb gibt es:

```bash
node scripts/cms-pruefen.mjs
```

Das Skript vergleicht `config.yml` mit allen Dateien in `content/` und meldet
Lücken. Es läuft bei jedem Build mit – **auch solange der Redaktionsbereich
aus ist**. Das ist Absicht: So bleibt die vorbereitete Konfiguration aktuell,
und das Einschalten wird keine Fehlersuche. Wer ein neues Inhaltsfeld anlegt,
trägt es dort mit ein.

**Kommentare überleben das Speichern nicht.** Die erklärenden Kommentarköpfe in
den YAML-Dateien sind weg, sobald Önder eine Datei über den Editor speichert.
Die Erklärungen stehen deshalb zusätzlich als `hint:` an den Feldern in
`config.yml` – dort sieht er sie direkt beim Bearbeiten.

Beim Einschalten zu beachten: Die Seite `/admin` lädt den Editor von unpkg.
Das wäre die einzige Ausnahme von der Drittanbieter-Regel und beträfe nur
diese Redaktionsseite. Solange der Redaktionsbereich aus ist, lädt die
gesamte veröffentlichte Website nichts von fremden Servern. Beim Einschalten
`Disallow: /admin` wieder in `public/robots.txt` aufnehmen.

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
- **Zwei E-Mail-Häkchen in Schritt 4**: „Rechnung per E-Mail" und „kurze
  Nachricht nach der Fahrt". Getrennt, weil es zwei verschiedene Dinge sind –
  eine Rechnung schuldet man dem Fahrgast, eine Bitte um eine Bewertung ist
  Werbung und braucht seine Zustimmung. Das gemeinsame Adressfeld erscheint,
  sobald eines angekreuzt ist, und ist dann Pflicht. Ohne Haken wird die
  Adresse **nicht gespeichert**, auch wenn im Feld noch etwas steht. Eine
  unbrauchbare Adresse wird abgewiesen statt verworfen – sonst bestellt jemand
  mit Rechnungswunsch und bekommt kommentarlos keine.
- **Wunschfahrer.** In Schritt 4 steht eine Auswahlliste der Fahrer, geladen
  von `GET /api/fahrer`. Sie erscheint, sobald **mindestens ein** Fahrer
  angemeldet ist; ohne jeden Fahrer bleibt sie verborgen, weil eine leere
  Liste schlechter wäre als gar kein Feld. Nach draußen gehen nur Nummer
  und Vorname (`dispatch/src/fahrer-liste.ts`), nicht Handynummer, Anmeldecode
  oder Schicht. Dass jemand gerade frei ist, steht **absichtlich nicht** dabei:
  sonst könnte jeder Fremde von außen mitlesen, wer wann unterwegs ist.

---

## Auftragsvermittlung (`dispatch/`)

Ein eigener Dienst auf Cloudflare Workers, getrennt von der Website. Er nimmt
Bestellungen entgegen und fragt die eingeteilten Fahrer nacheinander über
Telegram, bis jemand zusagt.

```
Kunde bestellt auf der Website
  → Auftrag wird angelegt und der Eingang protokolliert (§ 49 PBefG)
  → Fahrer 1 bekommt Telegram-Nachricht mit [Annehmen] [Ablehnen]
     (ein Wunschfahrer wird vorgezogen, sofern er überhaupt in Frage kommt)
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
- Ein **Wunschfahrer** wird nur **vorgezogen**, nicht bevorzugt behandelt:
  `wunschZuerst()` in `schichten.ts` sortiert ihn an die Spitze der Liste, die
  Schicht- und Belegungsprüfung läuft vorher und unverändert. Wer gerade
  unterwegs ist, fällt also auch als Wunsch heraus. Sagt er ab oder antwortet
  nicht, geht es normal weiter – **eine Fahrt bleibt nie liegen, nur weil ein
  bestimmter Fahrer nicht kann.** Der Fahrgast erfährt über den Status
  (`wunschVerfehlt`), dass es ein anderer geworden ist.
- Die gewünschte Nummer wird **vor dem Eintrag nachgeschlagen**
  (`gueltigerWunschfahrer()`). Eine unbekannte Nummer – etwa von einer lange
  offenen Seite, deren Fahrer inzwischen ausgetragen wurde – würde sonst am
  Fremdschlüssel scheitern und **die ganze Bestellung** abbrechen. Genau das
  ist beim Durchspielen passiert; dagegen stehen jetzt Tests.

**Fahrerdaten** liegen in der Cloudflare-Datenbank und bewusst **nicht** im
Repository. Verwaltet werden sie unter `<worker>/fahrer` hinter einem Passwort.

### Rechnung nach der Fahrt

```
Fahrgast kreuzt "Rechnung per E-Mail" an (Website oder Telefonaufnahme)
  → Fahrer bekommt beim Abmelden ZWEI Knöpfe: "Erledigt · bar" / "· Karte"
  → Rechnung entsteht aus den Auftragsdaten, verknüpft über rechnungen.auftrag_id
  → PDF per Brevo an den Fahrgast, mit Bewertungshinweis (falls Link hinterlegt)
```

Die Regeln stehen in `rechnung-automatik.ts`, getrennt von Datenbank und Netz:

- **Über 250 € keine Automatik.** § 33 UStDV verlangt darüber Name *und*
  Anschrift des Fahrgasts. Die Anschrift wird bei der Bestellung bewusst nicht
  abgefragt – für eine Fahrt wäre das eine Hürde, die kaum jemand nimmt. In
  diesen Fällen bekommt der Chef eine Telegram-Meldung mit allen Angaben.
- **Ohne Festpreis keine Rechnung.** Steht kein Betrag fest (Adresse nur als
  Freitext), wird nicht geraten, sondern gemeldet.
- **Zweimal „Erledigt" ergibt keine zweite Rechnung.** Geprüft wird über
  `rechnungen.auftrag_id`; Stornorechnungen zählen nicht mit.
- **Die Zahlungsart wird gefragt, nicht geraten.** Deshalb die zwei Knöpfe –
  „Bar bezahlt" auf einer Kartenzahlung wäre schlicht falsch. Der Fahrer tippt
  genauso oft wie vorher, und die zwei Knöpfe erscheinen nur dort, wo eine
  Rechnung gewünscht ist.
- **Ein Fehler beim Rechnungsschreiben reißt die Fahrt nicht mit.** Der Fahrer
  ist vorher freigemeldet; scheitert etwas, meldet es der Chef-Chat, und die
  Rechnung lässt sich im Fahrerbereich nachschicken.

**Versand** über `brevo.ts` – bewusst **reiner Text**: Brevo schreibt Links in
HTML-Mails um, um Klicks zu zählen, und eine fremde Zähladresse auf einer
Rechnung kostet eher Vertrauen, als sie nützt. Festgehalten wird, *wann* und
*wohin* verschickt wurde (`versendet_um`, `versand_an`) – ohne das ließe sich
„nie verschickt" nicht von „Versand gescheitert" unterscheiden.

### Nachricht nach der Fahrt (`danke-mail.ts`)

Wer nur das zweite Häkchen setzt, bekommt nach der Fahrt eine kurze Mail mit
Dank und der Bitte um eine Bewertung. Drei Regeln:

- **Nie zwei Mails nach einer Fahrt.** Ging die Rechnung raus, steht die Bitte
  dort schon drin – dann unterbleibt die zweite Nachricht.
- **Ohne Bewertungslink wird sie nicht sinnlos**, sondern zu einem Dank mit der
  Einladung, auf die Mail zu antworten. Besser als ein toter Link.
- **Der Hinweis auf den Widerspruch steht in jeder Nachricht**, nicht nur in
  der ersten.

Ein Fehlschlag wird bewusst **nicht** an den Chef gemeldet: Eine Dankesmail,
die nicht ankommt, ist ein Schönheitsfehler und würde zwischen den wichtigen
Meldungen nur stören.

**Korrigieren** ist ein Knopf, aber zwei Vorgänge: Eine ausgestellte Rechnung
darf nicht geändert werden (GoBD, § 14 UStG). „Rechnung korrigieren" storniert
sie, schickt dem Fahrgast die Stornorechnung und öffnet das Formular mit allen
alten Angaben; die berichtigte Rechnung geht danach automatisch an dieselbe
Adresse.

### Telefonische Aufträge (`<worker>/fahrer/auftrag`)

Der größte Teil der Aufträge kommt per Anruf. Ohne diese Seite stünden sie nur
auf Papier: kein Datensatz, kein Nachweis des Auftragseingangs, kein
serverseitig gerechneter Preis – und ein telefonisch vergebener Fahrer könnte
parallel einen Auftrag aus Telegram annehmen.

Ein hier aufgenommener Auftrag läuft deshalb durch **denselben Datensatz und
dasselbe Durable Object** wie eine Bestellung von der Website. Zwei Wege:

| | |
|---|---|
| **Ausschreiben** | wie eine Website-Bestellung: Schichtlogik, Reihenfolge, 40 Sekunden |
| **Fest zuweisen** | Önder weiß schon, wer fährt. Der Fahrer bekommt die Fahrt sofort in Telegram und kann sie mit „Kann ich nicht“ zurückgeben – dann wird sie normal ausgeschrieben |

| Datei | Aufgabe |
|---|---|
| `src/auftrag-erfassen.ts` | Prüft die Eingaben (rein, getestet) |
| `src/zeit.ts` | Formularzeit ↔ Zeitpunkt in Europe/Berlin (rein, getestet) |
| `src/belegung.ts` | Wer ist gerade unterwegs (rein, getestet) |
| `src/auftrag-ablage.ts` | Schreiben und Lesen (gegen echtes SQLite getestet) |
| `src/auftraege.ts` | Die Seite selbst |
| `src/vorschlagfeld.ts` | Adressfeld mit Vorschlagsliste – auch von den Rechnungen genutzt |

Regeln, die man nicht aufweichen sollte:

- **Der Preis kommt immer vom Server.** Bei ausgewählten Adressen aus der
  gemessenen Strecke, sonst der von Hand vereinbarte Betrag (`preis_quelle`).
  Die Anzeige im Formular ist nur eine Vorschau und wird nie übernommen.
- **Ohne Auswahl aus der Vorschlagsliste kein berechneter Preis.** Freitext ist
  erlaubt, dann ist das Preisfeld Pflicht – geraten wird nicht.
- **Der Eingangskanal ist Pflicht** und die Eingangszeit nachtragbar: § 49 PBefG
  meint den Zeitpunkt des Anrufs, nicht den des Eintippens.
- **Ein Fahrer ist belegt, solange eine Fahrt läuft.** Geprüft wird die
  Überschneidung mit der Zeit der neuen Fahrt – eine Vorbestellung für morgen
  sperrt also nicht. Frei wird er über „Fahrt erledigt“ (Telegram oder
  Fahrerbereich), spätestens nach der geschätzten Fahrtzeit
  (60 Min + 2 Min/km, höchstens 4 Stunden). **Diese Obergrenze ist wichtig:**
  ohne sie würde ein vergessener Auftrag den Fahrer dauerhaft sperren.
- **Nichts wird gelöscht.** Eine Absage setzt den Status auf `storniert`.

Die Preisvorschau läuft über `/fahrer/preis` hinter dem Passwort und nicht über
das öffentliche `/api/preis`: Das ist auf 200 Abfragen je Stunde und IP
gedrosselt, und ein Büro mit vielen Anrufen hängt an einer einzigen IP.

### Rechnungen (`<worker>/fahrer/rechnungen`)

Start, Ziel und Endpreis eintragen, heraus kommt ein PDF für den Fahrgast.
Hinter demselben Passwort, weil Namen und Anschriften der Fahrgäste darin
stehen. Lässt sich über `app.webmanifest` zum Startbildschirm hinzufügen.

| Datei | Aufgabe |
|---|---|
| `src/rechnung.ts` | Betrag lesen, Steuer herausrechnen, Pflichtangaben, IBAN (rein, getestet) |
| `src/rechnung-ablage.ts` | Fortlaufende Nummer, Storno (gegen echtes SQLite getestet) |
| `src/rechnung-pdf.ts` | PDF mit `pdf-lib` und eingebauter Helvetica |
| `src/rechnungen.ts` | Seiten, Manifest, App-Symbole |

Regeln, die man nicht aufweichen sollte:

- **Rechnungen werden nie geändert oder gelöscht.** Fehler hebt eine
  Stornorechnung mit eigener Nummer auf (`storno_von`). Ein eindeutiger Index
  verhindert doppelte Nummern und doppelte Stornos.
- **Gerechnet wird in Cent**, die Steuer aus dem Endpreis herausgerechnet.
  Netto + Steuer ergibt immer genau den Endpreis.
- **Nummer und Datum in deutscher Ortszeit** – sonst bekäme eine Rechnung in
  der Silvesternacht die Nummer des Vorjahres.
- **19 % Umsatzsteuer** (`STEUERSATZ`): Der ermäßigte Satz gilt nach dem
  Gesetzestext für Taxen, nicht für Mietwagen.
- **Über 250 € sind Name und Anschrift Pflicht**, darunter genügt eine
  Kleinbetragsrechnung.
- **Firmendaten werden je Rechnung als JSON festgehalten.** Ändert Önder seine
  Anschrift, bleiben alte Rechnungen, wie sie verschickt wurden.
- **Die eingebaute PDF-Schrift kennt nicht jeden Buchstaben.** „Ş“ und „ı“
  werden zu „S“ und „i“, statt das PDF abbrechen zu lassen. Eine eigene Schrift
  würde den Dienst um mehrere hundert Kilobyte vergrößern.

### Befehle

```bash
cd dispatch
npm run dev          # lokal, mit eigener Datenbank
npx vitest run       # Modultests: Schichten, Preise, Fahrer, Rechnungen
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

Zehn Abschnitte: Annahme, Ablehnung, Zeitablauf, Eskalation an den Chef, der
Wunschfahrer (vorgezogen / unterwegs / unbekannt), die Rechnung nach der Fahrt,
die Nachricht nach der Fahrt und die Absicherungen (fehlende Angaben, unsinnige
Rufnummer, Telegram-Aufruf ohne Geheimnis).

Dazu `node test/versand.mjs` – es prüft im echten Workers-Lauf, was vitest
nicht kann: Anmeldung, PDF-Erzeugung in der Worker-Umgebung, Versand,
Korrektur und erneutes Verschicken. Die Telegram-Attrappe steht dabei auch für
Brevo; dafür `--var BREVO_API_KEY:lokal-test --var
BREVO_BASIS:http://127.0.0.1:8799` an `wrangler dev` mitgeben.

Ohne Kartendienst-Schlüssel steht lokal **kein Festpreis** fest. Abschnitt 8
prüft deshalb den Fall „ohne Preis keine Rechnung, dafür eine Meldung an den
Chef" – die vollständige Kette bis zum PDF deckt `test/rechnung-fahrt.test.ts`
gegen eine echte SQLite-Datenbank ab.

Zwei Dinge, über die die Probe schon gestolpert ist und die beim Erweitern
wichtig sind:

- **Jede angenommene Fahrt muss abgemeldet werden** (`erledige(...)`), sonst
  gilt der Fahrer als unterwegs und die folgenden Abschnitte prüfen in
  Wahrheit nur noch die Belegung.
- **Jeder Abschnitt hat seine eigene Absender-IP.** Der Dienst nimmt fünf
  Bestellungen je Stunde und Absender an; ohne das scheitern die späteren
  Abschnitte an der Drosselung statt an der Sache.

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

### Cloudflare (produktiv)

Die Website läuft als Cloudflare-Worker mit statischen Dateien, Projekt
`myregio`, seit dem 20.09.2026 unter **`https://www.myregiocar.com`**. Cloudflare
baut die Seite selbst. Es gibt deshalb **keinen Deploy-Workflow und keine
FTP-Zugangsdaten** – Cloudflare holt sich den Code bei jedem Push direkt aus
dem Repository.

```
Push auf main
   → Cloudflare baut die Seite neu und veröffentlicht sie
```

Wird der Redaktionsbereich eingeschaltet, geht Önders Speichern denselben Weg:
DecapBridge schreibt einen Commit, der Rest passiert von selbst.

> **Nicht Cloudflare Pages.** Neue Projekte legt Cloudflare als Worker an. Das
> hat Folgen, die uns erwischt haben: `_redirects` erlaubt keine vollständigen
> Adressen, und eine eigene Domain lässt sich nur verbinden, wenn ihr DNS bei
> Cloudflare liegt.

**Die eigene Domain** steht als `routes` in `wrangler.toml`; Cloudflare legt den
DNS-Eintrag beim Veröffentlichen selbst an. Zwei Dinge liegen dagegen im
Dashboard und nicht im Projekt:

- **Weiterleitung `myregiocar.com` → `www`** (Regeln → Weiterleitungsregeln,
  Platzhaltermuster `https://myregiocar.com/*` → `https://www.myregiocar.com/${1}`,
  301). Ohne sie zeigt die nackte Domain die alte Platzhalterseite des
  Domainanbieters.
- **„Immer HTTPS verwenden"** (SSL/TLS → Edge-Zertifikate). Sonst wird
  `http://` unverschlüsselt ausgeliefert.

Sobald ein Worker eine eigene Domain hat, **schaltet Cloudflare seine
`workers.dev`-Adresse ab** – sie antwortet danach mit 404. Das ist hier
erwünscht (Google soll nur eine Adresse kennen), überrascht aber, wenn man den
alten Link noch irgendwo verschickt hat.

Einstellungen bei Cloudflare: Build-Befehl `npm run build`,
Bereitstellungsbefehl `npx wrangler deploy`. Was dabei veröffentlicht wird,
steht in `wrangler.toml` im Hauptverzeichnis – nicht zu verwechseln mit
`dispatch/wrangler.toml`, die zum Vermittlungsdienst gehört.

Schlägt `npm run build` fehl, wird **nichts** veröffentlicht – die bisherige
Website bleibt unverändert online. Deshalb ruft das `build`-Skript in
`package.json` zuerst `scripts/cms-pruefen.mjs` auf: Die Prüfung des
Redaktionsbereichs muss dort stehen, wo tatsächlich gebaut wird, sonst fällt
sie bei einem Hosterwechsel lautlos weg.

`public/_headers` liefert die Servereinstellungen mit: Sicherheits-Kopfzeilen
und Cache-Regeln. HTTPS, Komprimierung und die eigene 404-Seite erledigt
Cloudflare von sich aus.

**Die Weiterleitung von `myregiocar.com` auf `www` liegt bei IONOS**, nicht
im Projekt. Ein `public/_redirects` mit vollständiger Adresse
(`https://myregiocar.com/* …`) lehnt Cloudflare bei Workern ab – dort sind nur
relative Pfade erlaubt, der Deploy scheitert dann mit `code: 100324`.

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
   dafür ist die Weiterleitung der nackten Domain beim Domainanbieter (IONOS)
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
- Wunschfahrer: 154 Einzeltests, End-zu-Ende-Probe in acht Abschnitten grün;
  die Auswahl im Browser gegen den lokalen Dienst durchgespielt. Dass die Tests
  greifen, ist mit zwei absichtlichen Fehlern belegt (Prüfung ausgehebelt /
  ausgetragene Fahrer wieder zugelassen) – beide fielen sofort auf.

## Bewusst nicht enthalten

Englische Sprachversion, Online-Zahlung. Der Redaktionsbereich ist vorbereitet, aber nicht aktiv –
siehe Abschnitt „Redaktionsbereich" oben.
