# Offene Punkte bis zum Livegang

Stand: 13.09.2026 · Website: **Cloudflare** (Worker `myregio`) · Domain und
E-Mail: **IONOS**, DNS zieht zu Cloudflare um · Repository:
**github.com/437Amin/MyRegio** (öffentlich)

## Wo es gerade steht

| | |
|---|---|
| Website | ✅ online unter https://myregio.assad-amin.workers.dev |
| Festpreise, Adressvorschläge | ✅ live geprüft |
| Auftragsvermittlung | ✅ läuft – aber nur mit dem Testeintrag „Amin" |
| **Bis echte Kunden bestellen** | 🔴 Fahrerliste und Telegram-ID von Önder |
| **Bis `www.myregiocar.com`** | 🔴 Nameserver bei IONOS – braucht Önders IONOS-Zugang |

---

## 🔴 Bevor echte Kunden bestellen

- [ ] **Echte Fahrer eintragen** – Namen, Handynummern, Tag/Nacht von Önder.
      Fahrerbereich → „Neuen Fahrer anlegen", dann jedem seinen Telegram-Link
      schicken. Erst bei „✓ angemeldet" bekommt er Aufträge
- [ ] **Testeintrag „Amin" entfernen** – sonst gehen Aufträge an Amins Telegram.
      „Löschen" im Fahrerbereich trägt ihn aus: Er hat 5 Aufträge, sein Name
      bleibt deshalb in der Auftragsliste, Telefon und Telegram werden entfernt
- [ ] **Önders Chat-ID eintragen** – bisher bekommt Amin „Kein Fahrer gefunden".
      Önder schreibt in Telegram @userinfobot an und schickt die Zahl, dann:
      ```
      cd dispatch
      npx wrangler secret put CHEF_CHAT_ID
      ```
- [ ] **Einmal echt durchspielen** – auf der Live-Seite bestellen, ein echter
      Fahrer nimmt an

---

## 🌐 Umzug auf www.myregiocar.com

Die Domain ist seit **11.03.2012 bei IONOS** registriert, die Postfächer
`bestellungen@` und `contact@` laufen dort und **bleiben dort**. Zu Cloudflare
zieht nur das DNS – nötig, weil sich ein Cloudflare-Worker nur mit einer Domain
verbinden lässt, deren DNS bei Cloudflare liegt.

- [x] **Worker `myregio` mit GitHub verbunden** – baut bei jedem Push auf `main`
      | Feld | Wert |
      |---|---|
      | Build-Befehl | `npm run build` |
      | Bereitstellungsbefehl | `npx wrangler deploy` |
      | Pfad | `/` |
      | Build-Variablen | **keine** |

- [x] **Domain `myregiocar.com` bei Cloudflare angelegt** (Tarif Free)

- [x] **DNS-Einträge geprüft** – bei Cloudflares Nameservern abgefragt und
      Zeichen für Zeichen mit IONOS verglichen: identisch.
      ```
      A      ftp              217.160.122.220   Nur DNS
      A      myregiocar.com   217.160.0.34      Mit Proxy
      AAAA   ftp              2001:8d8:1001:…   Nur DNS
      AAAA   myregiocar.com   2001:8d8:100f:…   Mit Proxy
      MX     myregiocar.com   mx00.ionos.de 10  Nur DNS
      MX     myregiocar.com   mx01.ionos.de 10  Nur DNS
      TXT    myregiocar.com   "v=spf1 include:_spf-eu.ionos.com include:spf.protection.outlook.com ~all"
      TXT    myregiocar.com   "MS=ms25832862"
      ```
      Bewusst **kein** `www` – das legt Cloudflare beim Verbinden selbst an.

- [ ] **Nameserver bei IONOS ändern** – braucht **Önders IONOS-Zugang**
      (früher 1&1; Rechnung kommt jedes Jahr im März). Anmeldung:
      https://login.ionos.de → *Domains & SSL* → `myregiocar.com` → Nameserver:
      ```
      craig.ns.cloudflare.com
      mary.ns.cloudflare.com
      ```
      Die vier `ns1052.ui-dns.*` entfernen. **Sonst nichts ändern, nichts
      kündigen.** DNSSEC ist aus, das ist keine Falle.
      > Dauert das Wochen, kann Cloudflare den Entwurf entfernen. Dann die
      > Domain neu anlegen – die Einträge stehen oben.

- [ ] **Bei Cloudflare „Ich habe meine Nameserver aktualisiert"** – erst
      **nach** dem Speichern bei IONOS

- [ ] **Website verbinden** – *Workers und Pages* → `myregio` → *Domänen* →
      `www.myregiocar.com`

- [ ] **Weiterleitung `myregiocar.com` → `www`** – bei Cloudflare unter
      *Regeln → Weiterleitungsregeln*: Hostname gleich `myregiocar.com` →
      `https://www.myregiocar.com` + ursprünglicher Pfad, Status **301**,
      Abfrage beibehalten

- [ ] **Prüfen**
      - `https://www.myregiocar.com` zeigt die Seite, Schloss im Browser
      - `http://myregiocar.com/kontakt` landet auf `https://www.myregiocar.com/kontakt`
      - Test-E-Mail an `contact@myregiocar.com` kommt an
      - Buchungsassistent einmal ganz durch

- [ ] **Aufräumen**
      - In `dispatch/wrangler.toml` bei `ERLAUBTE_HERKUNFT` nur
        `https://www.myregiocar.com` stehen lassen, dann
        `cd dispatch && npm run deploy`
      - Die `workers.dev`-Adresse der Website abschalten (*Worker `myregio` →
        Einstellungen → Domains & Routes*), damit Google nur eine Adresse kennt
      - Alte Vorschauseite `myregiocar.netlify.app` löschen

> **Schlägt ein Build fehl**, wird nichts veröffentlicht – die bisherige
> Fassung bleibt online. Cloudflare schickt eine E-Mail, der Grund steht unter
> *Bereitstellungen*. Meist ein Tippfehler in einer Inhaltsdatei; die Meldung
> nennt Datei und Feld auf Deutsch.

---

## 📋 Von Önder

- [ ] Fahrerliste und Telegram-ID (siehe oben)
- [ ] IONOS-Zugang (siehe oben)
- [ ] **Konzessionsnummer** nach PBefG fürs Impressum
- [ ] **Genehmigungsbehörde prüfen** – eingetragen ist „Landeshauptstadt
      Stuttgart, Amt für öffentliche Ordnung". Mit der Konzessionsurkunde
      abgleichen
- [ ] **Anzahl der Park-&-Fly-Stellplätze**
- [ ] **Flughafen-Ziel entscheiden** – Die Suche „Flughafen Stuttgart" bietet
      einen Eintrag bei Neuhausen an, der 53,50 € statt 46,50 € kostet (Ostseite
      des Geländes statt Terminal). Soll „Flughafen Stuttgart" immer zum
      Terminal führen? Dann feste Zielpunkte in `dispatch/src/strecke.ts`,
      etwa eine halbe Stunde

---

## ⚖️ Zur Information für den Anwalt

Seit der Freigabe vom 31.08.2026 neu oder geändert:

1. **Datenschutzerklärung → Hosting** – Cloudflare statt Hostinger
2. **Datenschutzerklärung → Fahrtbestellung über die Website** – Übermittlung
   der Bestellung über Telegram an die Fahrer
3. **Park & Fly** – Hinweis, dass die Haftung beim Fahrzeughalter liegt
   (Park-&-Fly-Seite und FAQ)

Außerdem: **Auftragsverarbeitungsvertrag mit Cloudflare** im Cloudflare-Konto
annehmen (*Konto verwalten → Konfigurationen → Rechtliches*, „Data Processing
Addendum").

---

## ✅ Erledigt

- [x] Telefon +49 173 3480810, WhatsApp 491733480810 – überall eingetragen
- [x] E-Mail: `bestellungen@`, `contact@`, `bewerbung@`
- [x] Umsatzsteuer-ID DE285112009 im Impressum
- [x] Öffnungszeiten bestätigt
- [x] Schreibweise **mit www** festgelegt (`astro.config.mjs`, `robots.txt`)
- [x] Park & Fly: 7 € pro Tag, überdacht, videoüberwacht, Shuttle gegen Aufpreis
      per WhatsApp, Haftung beim Fahrzeughalter
- [x] Festpreise rund 13 % unter dem Stuttgarter Taxitarif, im Fahrerbereich
      änderbar. Die Preistabelle aus `content/preise.yaml` zeigt nur Park & Fly –
      ihre Streckenpreise stehen auf 0 und werden ausgeblendet
- [x] Repository auf GitHub, Website auf Cloudflare (13.09.2026)

---

## 🚕 Auftragsvermittlung – wie sie eingerichtet wurde

Für den Fall, dass sie neu aufgesetzt werden muss.

- [x] **Telegram-Bot** @MyRegioBot über @BotFather, Name in
      `dispatch/wrangler.toml` bei `TELEGRAM_BOT_NAME` (ohne @)
- [x] **Datenbank** `vermittlung` in Region WEUR
      ```
      cd dispatch
      npx wrangler d1 create vermittlung     # ID in wrangler.toml eintragen
      npm run db:anlegen
      ```
      Bestehende Datenbank von vor dem 13.09.2026? Nachtrag im Kopf von
      `dispatch/schema.sql` beachten – ist bei der jetzigen erledigt.
- [x] **Geheimnisse** (verschlüsselt bei Cloudflare, nie im Repository)
      ```
      npx wrangler secret put TELEGRAM_TOKEN
      npx wrangler secret put TELEGRAM_WEBHOOK_GEHEIMNIS
      npx wrangler secret put CHEF_CHAT_ID
      npx wrangler secret put ADMIN_PASSWORT
      npx wrangler secret put ORS_SCHLUESSEL
      ```
- [x] **Veröffentlicht** – https://myregiocar-vermittlung.assad-amin.workers.dev,
      Webhook bei Telegram registriert
      ```
      curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER-ADRESSE>/telegram/webhook&secret_token=<GEHEIMNIS>"
      ```
- [x] **Auf der Website eingeschaltet** – `content/einstellungen.yaml` →
      `vermittlung`
- [x] **Echt durchgespielt** – 06.09.2026, Auftrag in 18 Sekunden angenommen

---

## 🔧 Redaktionsbereich – bewusst zurückgestellt

Entscheidung vom 13.09.2026: Website-Änderungen laufen über Amin. Alles ist
vorbereitet und liegt in `redaktionsbereich/`, außerhalb von `public/`.

Einschalten, etwa 20 Minuten:

- [ ] `git mv redaktionsbereich public/admin`
- [ ] In `scripts/cms-pruefen.mjs` den Pfad zurück auf `public/admin/config.yml`
- [ ] In `public/robots.txt` wieder `Disallow: /admin` aufnehmen
- [ ] **GitHub-Schlüssel** unter https://github.com/settings/personal-access-tokens/new:
      nur Repository `437Amin/MyRegio`, nur *Contents: Read and write*,
      längste Laufzeit – **Ablaufdatum notieren**, danach kann niemand mehr
      speichern
- [ ] **DecapBridge** (decapbridge.com, kostenlos): Site anlegen mit GitHub,
      `437Amin/MyRegio`, dem Schlüssel, Login-URL
      `https://www.myregiocar.com/admin` (**ohne** `/index.html` – das leitet
      um), Auth type **Classic**
- [ ] `identity_url` in `public/admin/config.yml` eintragen (`repo` steht schon)
- [ ] Önder über DecapBridge einladen, `ANLEITUNG.md` um den Editor ergänzen

> Die Seite `/admin` lädt den Editor von unpkg – die einzige Ausnahme von der
> Regel „nichts von fremden Servern". Sie betrifft nur diese Seite.

---

## 🟡 Sollte bald ergänzt werden

### Bilder

- [ ] **Original-Logo** als SVG oder PNG mit transparentem Hintergrund
      (aktuell nach dem Flyer nachgebaut)
- [ ] **Fotos vom Fahrzeug und vom Gelände** – besonders Einfahrt,
      Stellplatzbereich und Fußweg zur Haltestelle. Die Seite kommt ohne aus,
      gewinnt mit ihnen aber deutlich
      ⚠️ **Ohne Fremdlogos.** Der Flyer zeigt das Uber-Logo an der Fahrzeugtür –
      das gehört nicht auf diese Website
- [ ] Danach `node scripts/bilder-erzeugen.mjs`, damit auch das
      WhatsApp-Vorschaubild das echte Logo zeigt

### Kundenstimmen

- [ ] Echte Rückmeldungen sammeln, in `content/kundenstimmen/` eintragen
      ⚠️ Erfundene Bewertungen sind wettbewerbswidrig. Vorher um Erlaubnis
      fragen – Vorname und Stadtteil genügen

---

## 🟢 Danach

- [ ] **Google Unternehmensprofil** anlegen bzw. beanspruchen. Bringt einem
      lokalen Fahrdienst erfahrungsgemäß mehr Anfragen als die Website allein.
      Adresse, Öffnungszeiten und Telefonnummer müssen dort **exakt** so
      stehen wie auf der Website
- [ ] **Sitemap in der Google Search Console einreichen** – erst nach dem
      Umzug auf `www`: `https://www.myregiocar.com/sitemap-index.xml`
