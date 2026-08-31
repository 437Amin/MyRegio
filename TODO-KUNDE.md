# Was noch von Önder gebraucht wird

Die Website ist fertig und funktioniert. An den unten aufgeführten Stellen
stehen aber noch **Platzhalter**, die vor dem Livegang durch echte Angaben
ersetzt werden müssen.

Abhaken, was erledigt ist.

---

## 🔧 Redaktionsbereich einrichten (macht der Entwickler)

Damit Önder unter `/admin` selbst Inhalte pflegen kann, fehlen noch drei
Schritte. Alle drei brauchen ein Konto und lassen sich nicht vorbereiten.

- [ ] **1. Repository auf GitHub anlegen** (dein Konto, nicht Önders)
  - Neues, **privates** Repository erstellen, z. B. `myregiocar`
  - Lokal ist bereits alles vorbereitet und eingecheckt. Es fehlt nur:
    ```
    git remote add origin https://github.com/DEINNAME/myregiocar.git
    git push -u origin main
    ```

- [ ] **2. Netlify mit dem Repository verbinden**
  - Im Netlify-Projekt: *Site configuration → Build & deploy → Link repository*
  - Build-Befehl `npm run build`, Verzeichnis `dist` (steht schon in
    `netlify.toml`)
  - Ab dann baut Netlify bei jeder Änderung automatisch neu – das Hochladen
    von Zip-Dateien entfällt

- [ ] **3. DecapBridge einrichten** (kostenlos für bis zu 3 Websites)
  - Auf **decapbridge.com** registrieren, eine „Site" anlegen und das
    GitHub-Repository verbinden
  - DecapBridge zeigt danach zwei Werte an. Diese in
    `public/admin/config.yml` eintragen – die Stellen sind dort mit
    `↓↓↓` markiert:
    - `repo:` → `DEINNAME/myregiocar`
    - `identity_url:` → `https://auth.decapbridge.com/sites/<deine-site-id>`
  - Önder per E-Mail einladen. Er bekommt eine Einladung, vergibt ein
    Passwort und meldet sich danach direkt unter `/admin` an – **ohne
    GitHub-Konto**

- [ ] **4. Danach einmal prüfen**
  - Unter `/admin` anmelden, eine Kleinigkeit ändern, veröffentlichen
  - Prüfen, ob Netlify neu baut und die Änderung live erscheint
  - `node scripts/cms-pruefen.mjs` ausführen – meldet, falls im Editor ein
    Feld fehlt, das sonst beim Speichern verloren ginge

> **Hinweis für später:** Wer in `content/*.yaml` ein neues Feld ergänzt, muss
> es auch in `public/admin/config.yml` eintragen. Sonst löscht der Editor es
> beim nächsten Speichern. Das Prüfskript aus Schritt 4 findet solche Lücken.

---

## 🔴 Muss vor dem Livegang erledigt sein

### Kontaktdaten → `content/einstellungen.yaml`

- [ ] **Telefonnummer** (steht aktuell auf `+49 711 000000`)
  - `telefonAnzeige` – so wie sie angezeigt wird, z. B. `"+49 711 123456"`
  - `telefonWaehlen` – dieselbe Nummer, nur Ziffern nach dem `+`
- [ ] **WhatsApp-Nummer** (steht aktuell auf `491700000000`)
  - Nur Ziffern, ohne `+`, ohne Leerzeichen. Aus `0171 2345678` wird `491712345678`
  - ⚠️ **Ohne diese Nummer funktioniert der Buchungsassistent nicht** – er ist
    das Herzstück der Seite
- [ ] **E-Mail-Adresse** (steht aktuell auf `info@myregiocar.com`)
  - Falls diese Adresse noch nicht existiert: einrichten oder ändern
- [ ] **Öffnungszeiten** prüfen
  - Aktuell wird „Täglich 24 Stunden erreichbar" beworben. Stimmt das?
  - Falls nein: `durchgehend: false` setzen und die Zeiten darunter eintragen

### Impressum → `content/einstellungen.yaml`, Abschnitt `rechtliches`

- [ ] **Umsatzsteuer-Identifikationsnummer** (steht auf `DE000000000`)
  - Vom Steuerberater bestätigen lassen
- [ ] **Genehmigungsbehörde** prüfen
  - Eingetragen ist: „Landeshauptstadt Stuttgart, Amt für öffentliche Ordnung"
  - Bitte mit der eigenen Konzessionsurkunde abgleichen
- [ ] **Konzessionsnummer** nach PBefG eintragen, falls vorhanden

### Rechtliche Prüfung

- [ ] **Impressum und Datenschutzerklärung anwaltlich prüfen lassen**
  - Beide Seiten sind sorgfältige Entwürfe und tragen einen sichtbaren
    Warnhinweis, der nach der Prüfung entfernt wird
  - Ein unvollständiges Impressum ist abmahnfähig
- [ ] **Hosting-Anbieter in der Datenschutzerklärung eintragen**
  - In `src/pages/datenschutz.astro`, Abschnitt 4, steht ein Platzhalter
  - Auftragsverarbeitungsvertrag (AVV) mit dem Anbieter abschließen

---

## 🟡 Sollte bald ergänzt werden

### Park & Fly → `content/preise.yaml`

Diese Angaben fehlen noch. Ohne sie kann die Website nicht sagen, was Park & Fly
kostet und wie es abläuft:

- [ ] Preis pro Tag und pro Woche
- [ ] Anzahl der verfügbaren Stellplätze
- [ ] Ist der Platz überdacht?
- [ ] Ist das Gelände umzäunt oder videoüberwacht?
- [ ] Muss der Autoschlüssel abgegeben werden?
- [ ] Aufpreis für den Shuttle bis zum Terminal (oder ist er inklusive?)
- [ ] **Versicherungsfrage klären:** Wer haftet, wenn dem abgestellten Fahrzeug
      auf dem Gelände etwas passiert? Das gehört in Ihre
      Geschäftsbedingungen – bitte mit Ihrer Versicherung besprechen

### Bilder

- [ ] **Original-Logo** als SVG oder PNG mit transparentem Hintergrund
  - Aktuell ist das Logo nach dem Flyer nachgebaut. Das sieht stimmig aus, ist
    aber nicht die Originaldatei
  - Ablegen unter `public/` und Bescheid geben
- [ ] **Fotos vom Fahrzeug und vom Gelände**
  - Besonders wertvoll: die Einfahrt und der Stellplatzbereich für Park & Fly,
    und der Fußweg zur Haltestelle. Das schafft Vertrauen
  - ⚠️ **Ohne Fremdlogos.** Der vorhandene Flyer zeigt das Uber-Logo an der
    Fahrzeugtür. Auf einer Seite, die gerade die Unabhängigkeit von Uber
    herstellen soll, ist das inhaltlich unpassend und markenrechtlich heikel
- [ ] **Foto von Önder** für die Startseite (optional, wirkt aber persönlich)

### Kundenstimmen → `content/kundenstimmen/beispiele.yaml`

- [ ] Echte Rückmeldungen von Kunden sammeln und eintragen
  - Die drei Beispiel-Einträge sind auf `freigegeben: false` gesetzt und
    erscheinen daher **nicht** auf der Website
  - ⚠️ Erfundene Bewertungen sind wettbewerbswidrig. Bitte die Person vorher
    um Erlaubnis fragen – Vorname und Stadtteil genügen

---

## 🟢 Entscheidungen, die noch anstehen

- [ ] **Internetadresse (Domain) festlegen**
  - Eingetragen ist `https://www.myregiocar.com` in `astro.config.mjs` und in
    `public/robots.txt`
  - Falls eine andere Adresse gewünscht ist, an beiden Stellen ändern
- [ ] **Hosting entscheiden:** Netlify oder Cloudflare Pages (beide kostenlos)
  - Siehe `README.md` für die Einrichtung
- [ ] **GitHub-Konto für Önder anlegen**, damit er die Inhalte selbst pflegen
      kann – siehe `ANLEITUNG.md`
- [ ] **Google Unternehmensprofil** anlegen bzw. beanspruchen
  - Für ein lokales Fahrdienst-Unternehmen bringt das erfahrungsgemäß mehr
    Anfragen als die Website allein. Adresse, Öffnungszeiten und
    Telefonnummer müssen dort **exakt** so stehen wie auf der Website
- [ ] **Preise veröffentlichen oder nicht?**
  - Aktuell absichtlich ausgeblendet (`anzeigen: false` in `preise.yaml`)
  - Die Tabelle ist fertig gebaut und lässt sich jederzeit einschalten

---

## Nicht vergessen

Wenn die Website online geht, sollten Adresse, Telefonnummer und
Öffnungszeiten **überall identisch** sein – auf der Website, im Google-Profil,
auf Flyern und in Fahrzeugbeschriftungen. Suchmaschinen bewerten das, und
Kunden verlassen sich darauf.
