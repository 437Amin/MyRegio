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

- [ ] **Impressum und Datenschutzerklärung anwaltlich prüfen lassen**
- [ ] **Danach den gelben Warnkasten auf beiden Seiten entfernen**
      → in `src/pages/impressum.astro` und `src/pages/datenschutz.astro`
      jeweils der Block mit `border-amber-400/30`.
      ⚠️ Solange er drinsteht, liest jeder Besucher „Dies ist ein Entwurf" –
      das wirkt unseriös. Er darf aber erst weg, **wenn** die Prüfung erfolgt ist.
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

- [ ] **Öffnungszeiten prüfen** – aktuell wird „Täglich 24 Stunden erreichbar"
      beworben. Stimmt das? Falls nein: im Redaktionsbereich den Haken bei
      „Rund um die Uhr erreichbar" entfernen und die Zeiten eintragen
- [ ] **Entscheiden: mit oder ohne `www`?**
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

- [ ] Preis pro Tag und pro Woche
- [ ] Anzahl der Stellplätze
- [ ] Überdacht? Umzäunt oder videoüberwacht? Schlüsselabgabe nötig?
- [ ] Aufpreis für den Shuttle (oder inklusive?)
- [ ] **Versicherungsfrage klären:** Wer haftet, wenn dem abgestellten Fahrzeug
      auf dem Gelände etwas passiert? Gehört in die Geschäftsbedingungen –
      bitte mit der Versicherung besprechen

### Bilder

- [ ] **Original-Logo** als SVG oder PNG mit transparentem Hintergrund
      (aktuell nach dem Flyer nachgebaut)
- [ ] **Fotos vom Fahrzeug und vom Gelände** – besonders die Einfahrt, der
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
- [ ] **Preise veröffentlichen?** Aktuell absichtlich ausgeblendet. Die Tabelle
      ist fertig und lässt sich im Redaktionsbereich mit einem Haken einschalten
