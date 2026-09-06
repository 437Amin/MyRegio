# Offene Punkte bis zum Livegang

Stand: 31.08.2026 · Hosting: **Hostinger** · Domain: **myregiocar.com**

---

## ✅ Erledigt

- [x] **Telefonnummer** +49 173 3480810 – eingetragen, erscheint auf allen
      Seiten inkl. Google-Daten
- [x] **WhatsApp-Nummer** – Buchungsassistent schickt jetzt an 491733480810
- [x] **E-Mail-Adressen** – `bestellungen@` für Buchungen, `contact@` für
      allgemeine Anfragen, `bewerbung@` für Stellen
- [x] **Umsatzsteuer-ID** DE285112009 – im Impressum
- [x] **Hosting-Angaben** in der Datenschutzerklärung (Hostinger)

---

## 🔴 Muss vor dem Livegang erledigt sein

### Rechtliches

- [x] **Impressum und Datenschutzerklärung anwaltlich prüfen lassen**
- [x] **Gelber Warnkasten entfernt** – Anwalt hat freigegeben (31.08.2026)
- [ ] **Genehmigungsbehörde prüfen** – eingetragen ist „Landeshauptstadt
      Stuttgart, Amt für öffentliche Ordnung". Bitte mit der
      Konzessionsurkunde abgleichen
- [ ] **Konzessionsnummer** nach PBefG eintragen, falls vorhanden
- [ ] **Auftragsverarbeitungsvertrag mit Hostinger abschließen**
      → Hostinger-Konto → *Legal* → AVV online unterzeichnen
- [ ] **Serverstandort auf Deutschland bzw. EU stellen**
      → sonst muss die Datenschutzerklärung um die Drittlandübermittlung
      ergänzt werden

### Inhaltlich

- [x] **Öffnungszeiten prüfen** – aktuell wird „Täglich 24 Stunden erreichbar"
      beworben. Stimmt das? Falls nein: im Redaktionsbereich den Haken bei
      „Rund um die Uhr erreichbar" entfernen und die Zeiten eintragen
- [x] **Entscheiden: mit oder ohne `www`?**
      Beide Schreibweisen müssen auf dieselbe zeigen, sonst wertet Google die
      Seite doppelt. Aktuell eingestellt ist **mit www**:
      - `astro.config.mjs` → `SEITEN_URL`
      - `public/robots.txt` → `Sitemap:`
      - Für *ohne* www zusätzlich in `public/.htaccess` die zwei markierten
        Zeilen entkommentieren

---

## 🚀 Livegang bei Hostinger

Der Ablauf ist so eingerichtet, dass Sie nach dem Einrichten **nie wieder
Dateien hochladen müssen**. Jede Änderung – auch die von Önder im
Redaktionsbereich – baut und veröffentlicht sich selbst.

- [ ] **1. Repository auf GitHub anlegen** (privat, z. B. `myregiocar`)
      Lokal ist alles eingecheckt, es fehlt nur:
      ```
      git remote add origin https://github.com/DEINNAME/myregiocar.git
      git push -u origin main
      ```

- [ ] **2. FTP-Zugang bei Hostinger holen**
      hPanel → *Dateien → FTP-Konten*. Notieren: Server, Benutzername, Passwort

- [ ] **3. Zugangsdaten bei GitHub hinterlegen**
      Repository → *Settings → Secrets and variables → Actions → New secret*:
      | Name | Wert |
      |---|---|
      | `FTP_SERVER` | z. B. `ftp.myregiocar.com` |
      | `FTP_BENUTZER` | FTP-Benutzername |
      | `FTP_PASSWORT` | FTP-Passwort |

      Danach läuft `.github/workflows/deploy.yml` bei jedem Push automatisch:
      bauen → prüfen → per FTP nach `public_html` hochladen.
      Schlägt der Build fehl, wird **nichts** hochgeladen – die alte Seite
      bleibt online.

- [ ] **4. Domain und SSL bei Hostinger einrichten**
      Domain auf das Hosting zeigen lassen, kostenloses SSL-Zertifikat
      aktivieren

- [ ] **5. Ersten Durchlauf prüfen**
      GitHub → Reiter *Actions* → läuft der Ablauf grün durch?
      Danach die Seite im Browser aufrufen und die Unterseiten durchklicken

> **Falls der Upload mit einem Verbindungsfehler abbricht:** In
> `.github/workflows/deploy.yml` `protocol: ftps` auf `protocol: ftp` ändern.
> Manche Hostinger-Pakete erlauben kein FTPS.

---

## 🚕 Auftragsvermittlung einrichten (machen wir gemeinsam)

Der Dienst unter `dispatch/` ist fertig und geprüft. Zum Scharfschalten fehlen
diese Schritte – jeder braucht ein Konto, deshalb gemeinsam:

- [x] **1. Telegram-Bot anlegen** – @MyRegioBot
      In Telegram **@BotFather** anschreiben → `/newbot` → Name und Benutzername
      vergeben. Du bekommst ein Token. Den Benutzernamen in `dispatch/wrangler.toml`
      bei `TELEGRAM_BOT_NAME` eintragen (ohne @).

- [ ] **2. Chat-ID von Önder eintragen** (er ist im Urlaub)
      Aktuell steht dort die ID von Amin, damit die Eskalation getestet werden
      konnte. Sobald Önder zurück ist:
      ```
      cd dispatch
      npx wrangler secret put CHEF_CHAT_ID
      ```
      Seine ID bekommt er von @userinfobot in Telegram.


- [x] **3. Cloudflare einrichten** – Datenbank `vermittlung` in Region WEUR
      ```
      cd dispatch
      npx wrangler login
      npx wrangler d1 create vermittlung
      ```
      Die ausgegebene ID in `wrangler.toml` bei `database_id` eintragen, dann:
      ```
      npm run db:anlegen
      ```

- [x] **4. Geheimnisse setzen** (liegen verschlüsselt bei Cloudflare, nie im Repo)
      ```
      npx wrangler secret put TELEGRAM_TOKEN
      npx wrangler secret put TELEGRAM_WEBHOOK_GEHEIMNIS
      npx wrangler secret put CHEF_CHAT_ID
      npx wrangler secret put ADMIN_PASSWORT
      ```
      Beim Webhook-Geheimnis eine lange zufällige Zeichenfolge wählen.

- [x] **5. Veröffentlicht** – https://myregiocar-vermittlung.assad-amin.workers.dev
      ```
      npm run deploy
      ```
      Danach den Webhook bei Telegram registrieren (einmalig, Adresse und
      Geheimnis aus den Schritten davor):
      ```
      curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER-ADRESSE>/telegram/webhook&secret_token=<GEHEIMNIS>"
      ```

- [ ] **6. Echte Fahrer eintragen** (bisher nur der Testeintrag „Amin")
      ⚠️ Den Testfahrer löschen, sobald echte Fahrer angelegt sind – sonst
      gehen Aufträge an die falsche Telegram-Nummer.
      `<WORKER-ADRESSE>/fahrer` aufrufen, mit dem Admin-Passwort anmelden,
      Fahrer anlegen (Name, Telefon, Tag/Nacht/beide, Reihenfolge). Jeder
      bekommt einen Anmeldelink für Telegram – erst wenn er ihn geöffnet hat,
      steht dort „angemeldet".

- [x] **7. Auf der Website eingeschaltet**
      Im Redaktionsbereich unter *Kontakt & Öffnungszeiten →
      Direkte Vermittlung*: Adresse des Dienstes eintragen und den Haken
      setzen. Erst dann erscheint „Jetzt Fahrer anfordern" auf der Seite.

- [x] **8. Echt durchgespielt** – 06.09.2026, Auftrag in 18 Sekunden angenommen
      Bestellung aufgeben, prüfen ob die Nachricht ankommt, annehmen,
      Statusanzeige auf der Website beobachten.

- [ ] **9. Datenschutzerklärung erneut prüfen lassen**
      ⚠️ Sobald der Haken gesetzt ist, erscheint automatisch ein neuer
      Abschnitt „Fahrtbestellung über die Website". Er beschreibt die
      Verarbeitung, die Weitergabe an die Fahrer und die Übermittlung über
      Telegram. **Dieser Text war nicht Teil der bisherigen Anwaltsprüfung.**

- [ ] **10. In `dispatch/wrangler.toml` `http://localhost:4321` aus
      `ERLAUBTE_HERKUNFT` entfernen**, wenn nicht mehr entwickelt wird.

---

## 🔧 Redaktionsbereich für Önder freischalten

Damit Önder unter `myregiocar.com/admin` selbst Inhalte pflegen kann –
**ohne GitHub-Konto**:

- [ ] **1. Bei decapbridge.com registrieren** (kostenlos für bis zu 3 Websites),
      eine „Site" anlegen und das GitHub-Repository verbinden
- [ ] **2. Die zwei angezeigten Werte eintragen** in `public/admin/config.yml`
      – die Stellen sind mit `↓↓↓` markiert:
      - `repo:` → `DEINNAME/myregiocar`
      - `identity_url:` → `https://auth.decapbridge.com/sites/<site-id>`
- [ ] **3. Önder per E-Mail einladen.** Er vergibt ein Passwort und meldet sich
      danach direkt unter `/admin` an
- [ ] **4. Gemeinsam einmal durchgehen** – die bebilderte Anleitung dafür ist
      [`ANLEITUNG.md`](ANLEITUNG.md)

> **Für Entwickler:** Wer in `content/*.yaml` ein Feld ergänzt, muss es auch in
> `public/admin/config.yml` eintragen – sonst löscht der Editor es beim
> nächsten Speichern. `node scripts/cms-pruefen.mjs` findet solche Lücken und
> läuft bei jedem Deploy automatisch mit.

---

## 🟡 Sollte bald ergänzt werden

### Park & Fly → im Redaktionsbereich unter „Preise"

Ohne diese Angaben kann die Website nicht sagen, was Park & Fly kostet:

- [x] Preis pro Tag und pro Woche
- [ ] Anzahl der Stellplätze
- [x] Überdacht? Umzäunt oder videoüberwacht? Schlüsselabgabe nötig?
- [x] Aufpreis für den Shuttle (oder inklusive?)
- [x] **Versicherungsfrage geklärt:** Haftung liegt beim Fahrzeughalter.
      Steht als Hinweis sichtbar auf der Park-&-Fly-Seite und im FAQ.
      ⚠️ Diese Formulierung war nicht Teil der Anwaltsprüfung – bei Gelegenheit
      mitprüfen lassen und in Beförderungsbedingungen aufnehmen

### Bilder

- [ ] **Original-Logo** als SVG oder PNG mit transparentem Hintergrund
      (aktuell nach dem Flyer nachgebaut)
- [ ] **Fotos vom Fahrzeug und vom Gelände** (liegen derzeit nicht vor –
      die Seite kommt ohne aus, gewinnt mit ihnen aber deutlich) – besonders die Einfahrt, der
      Stellplatzbereich und der Fußweg zur Haltestelle. Das schafft Vertrauen
      ⚠️ **Ohne Fremdlogos.** Der vorhandene Flyer zeigt das Uber-Logo an der
      Fahrzeugtür – das gehört nicht auf diese Website
- [ ] Danach `node scripts/bilder-erzeugen.mjs` ausführen, damit auch das
      WhatsApp-Vorschaubild das echte Logo zeigt

### Kundenstimmen → im Redaktionsbereich

- [ ] Echte Rückmeldungen sammeln und eintragen
      ⚠️ Erfundene Bewertungen sind wettbewerbswidrig. Vorher um Erlaubnis
      fragen – Vorname und Stadtteil genügen

---

## 🟢 Danach

- [ ] **Google Unternehmensprofil** anlegen bzw. beanspruchen
      Bringt einem lokalen Fahrdienst erfahrungsgemäß mehr Anfragen als die
      Website allein. Adresse, Öffnungszeiten und Telefonnummer müssen dort
      **exakt** so stehen wie auf der Website
- [ ] **Sitemap in der Google Search Console einreichen**
      (`https://www.myregiocar.com/sitemap-index.xml`)
- [x] **Preise veröffentlicht** – Park & Fly mit 7 € pro Tag. Fahrpreise
      bleiben Verhandlungssache und erscheinen nicht (stehen auf 0)
