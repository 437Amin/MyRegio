# Offene Punkte

Stand: 20.09.2026 · Website: **www.myregiocar.com**, läuft bei Cloudflare
(Worker `myregio`) · Domain registriert und E-Mail bei **IONOS**, DNS bei
**Cloudflare** · Repository: **github.com/437Amin/MyRegio** (öffentlich)

## Wo es gerade steht

| | |
|---|---|
| Website | ✅ online unter **https://www.myregiocar.com** |
| Festpreise, Adressvorschläge | ✅ live geprüft |
| Auftragsvermittlung | ✅ läuft – aber nur mit dem Testeintrag „Amin" |
| **Bis echte Kunden bestellen** | 🔴 Fahrerliste und Telegram-ID von Önder |
| **`www.myregiocar.com`** | ✅ live seit 20.09.2026 |

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

- [x] **Nameserver bei IONOS geändert** – 20.09.2026, 15:32 Uhr. Bei der
      `.com`-Registry stehen `craig` und `mary.ns.cloudflare.com`.

- [x] **Zone bei Cloudflare aktiv**

- [x] **Website verbunden** – `www.myregiocar.com` steht als `routes` in
      `wrangler.toml`, Cloudflare legt den DNS-Eintrag beim Veröffentlichen an

- [x] **Weiterleitung `myregiocar.com` → `www`** – Umleitungsregel mit
      Platzhaltermuster, 301, Pfad und Abfrage bleiben erhalten

- [x] **„Immer HTTPS verwenden"** unter *SSL/TLS → Edge-Zertifikate*

- [x] **Geprüft**
      - Alle Seiten unter `www` mit gültigem Zertifikat, eigene 404-Seite
      - `http://myregiocar.com/kontakt` → 2 Weiterleitungen →
        `https://www.myregiocar.com/kontakt`
      - MX, SPF und Microsoft-Bestätigung auf allen sechs Cloudflare-Servern
        unverändert
      - Der Vermittlungsdienst nimmt Anfragen von `www` an, Festpreis 46,50 €

- [x] **Aufgeräumt** – `ERLAUBTE_HERKUNFT` enthält nur noch
      `https://www.myregiocar.com`, deployt

- [ ] **Test-E-Mail an `contact@myregiocar.com`** schicken und prüfen, ob sie
      ankommt
- [ ] **Buchungsassistent** auf `www.myregiocar.com` einmal ganz durchklicken
- [ ] Alte Vorschauseite `myregiocar.netlify.app` löschen

> Die `workers.dev`-Adresse der Website schaltet Cloudflare selbst ab, sobald
> ein Worker eine eigene Domain hat – sie antwortet jetzt mit 404. Wer den
> alten Link verschickt hat, braucht den neuen.

> **Schlägt ein Build fehl**, wird nichts veröffentlicht – die bisherige
> Fassung bleibt online. Cloudflare schickt eine E-Mail, der Grund steht unter
> *Bereitstellungen*. Meist ein Tippfehler in einer Inhaltsdatei; die Meldung
> nennt Datei und Feld auf Deutsch.

---

## 📧 Rechnung per E-Mail – Brevo einrichten

Für die automatische Rechnung nach der Fahrt verschickt der Dienst E-Mails über
**Brevo**. Das Konto ist angelegt (13.10.2026). Die Schritte bauen aufeinander
auf – in dieser Reihenfolge abarbeiten.

### ✅ Schritte 1–4: Domain authentifiziert (13.10.2026)

Erledigt. Vier Einträge stehen in Cloudflare, von außen bei Cloudflare **und**
Google geprüft, Brevo meldet **authentifiziert**:

| Typ | Name | Inhalt | Proxy |
|---|---|---|---|
| TXT | `@` | `brevo-code:4d0def44555333c4394af983827700dc` | — |
| CNAME | `brevo1._domainkey` | `b1.myregiocar-com.dkim.brevo.com` | DNS only |
| CNAME | `brevo2._domainkey` | `b2.myregiocar-com.dkim.brevo.com` | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` | — |

Der Absender `MyRegioCar <contact@myregiocar.com>` ist verifiziert.

**Was dabei wichtig war** – falls es je wiederholt werden muss:

- Bei *Name* in Cloudflare nur den vorderen Teil eintragen (`brevo1._domainkey`,
  nicht den vollen Hostnamen). Cloudflare hängt die Domain selbst an, sonst
  entsteht `brevo1._domainkey.myregiocar.com.myregiocar.com`
- Bei den CNAMEs die Wolke auf **grau** (DNS only). Orange beantwortet
  Cloudflare mit eigenen Adressen, und die DKIM-Prüfung schlägt fehl
- **Manuell** statt *Automatisch* gewählt: Automatisch hätte Brevo
  Schreibrechte auf die ganze DNS-Zone gegeben, inklusive des SPF-Eintrags mit
  IONOS und Outlook
- Der SPF-Eintrag blieb unberührt und kommt weiterhin genau **einmal** vor.
  Brevo hat keinen verlangt
- DMARC steht auf `p=none` – reiner Beobachtungsmodus, weist nichts ab. Die
  Berichte gehen an Brevo, nicht ins Postfach: Es sind XML-Dateien, die täglich
  kommen

### ✅ Schritt 5: API-Schlüssel – erledigt (13.10.2026)

`BREVO_API_KEY` liegt als **Geheimnis** beim Worker `myregiocar-vermittlung`.
Geprüft: Es hat die Veröffentlichung am 14.10.2026 überstanden.

> **Wichtig, falls er je neu gesetzt werden muss:** Beim Anlegen in der
> Cloudflare-Oberfläche muss **„Geheimnis"** angehakt sein. Als normale
> Variable steht der Schlüssel im Klartext **und** wird beim nächsten
> `npm run deploy` gelöscht – dann fällt der Rechnungsversand aus, ohne dass
> irgendwo ein Fehler erscheint.

### 🟡 Schritt 6: Einmal echt ausprobieren

Alles ist seit dem 14.10.2026 live. Was noch fehlt, ist ein Durchlauf mit
einer echten E-Mail:

- [ ] **Testrechnung an die eigene Adresse.** Fahrerbereich → **Rechnungen** →
      eine Rechnung schreiben (Start, Ziel, Betrag) → auf ihrer Seite unten
      bei **„Per E-Mail verschicken"** die eigene Adresse eintragen und
      abschicken. Prüfen: Kommt sie an? Liegt sie im Posteingang und nicht im
      Spam? Lässt sich das PDF öffnen?
- [ ] **Danach einmal „Rechnung korrigieren"** antippen und sehen, wie der
      Ablauf sich anfühlt: Storno raus, Formular vorbelegt, neue Rechnung geht
      automatisch an dieselbe Adresse.
- [ ] **Eine echte Fahrt mit Rechnungswunsch**, sobald echte Fahrer eingetragen
      sind: auf der Website „Ich möchte eine Rechnung per E-Mail" ankreuzen,
      Fahrt annehmen, mit **„Erledigt · bar"** abmelden. Die Rechnung sollte
      ohne weiteres Zutun beim Fahrgast landen.

### 🟡 Schritt 7: Bewertungslink

- [ ] Sobald das Google-Unternehmensprofil steht: Fahrerbereich →
      **Rechnungen** → **Firmendaten** → **Link zur Bewertungsseite**.
      Er erscheint dann unter jeder Rechnung, die per E-Mail rausgeht.
      Solange er leer ist, bleibt die Zeile weg – es wird nie ein toter Link
      verschickt.

### 🟡 Schritt 8: Datenschutz

- [ ] **Auftragsverarbeitungsvertrag mit Brevo** abschließen – liegt im
      Brevo-Konto bereit.
- [ ] **Datenschutzerklärung ergänzen**: Brevo als Auftragsverarbeiter für den
      Rechnungsversand, und dass die E-Mail-Adresse nur erhoben wird, wenn der
      Fahrgast eine Rechnung wünscht.

---

## 📋 Von Önder

- [ ] Fahrerliste und Telegram-ID (siehe oben)
- [ ] IONOS-Zugang (siehe oben)
- [ ] **Konzessionsnummer** nach PBefG fürs Impressum
- [ ] **Genehmigungsbehörde prüfen** – eingetragen ist „Landeshauptstadt
      Stuttgart, Amt für öffentliche Ordnung". Mit der Konzessionsurkunde
      abgleichen
- [ ] **Anzahl der Park-&-Fly-Stellplätze**

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
- [x] **„Flughafen Stuttgart" führt immer zum Terminal** – vorher bot die Suche
      zusätzlich einen Punkt am Ostende der Startbahn an (53,50 statt 46,50 €
      ab Feuerbach, aus Esslingen gar kein Preis). Feste Ziele in
      `dispatch/src/strecke.ts`; die Flughafenstraße bleibt eine normale Adresse

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
- [x] **Veröffentlicht** – https://vermittlung.myregiocar.com,
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
