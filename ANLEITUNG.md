# Ihre Website selbst pflegen

Diese Anleitung ist für Sie geschrieben – ohne Fachbegriffe. Sie brauchen kein
Programm zu installieren und können alles auch vom Handy aus erledigen.

---

## Das Wichtigste vorweg

**Sie können nichts kaputt machen.**

Wenn Sie sich beim Bearbeiten vertippen, merkt das ein automatischer Prüfer und
die Änderung wird gar nicht erst veröffentlicht. Ihre Website bleibt dann
einfach so online, wie sie vorher war. Sie bekommen eine Meldung auf Deutsch,
die genau sagt, in welcher Datei und in welcher Zeile etwas nicht stimmt.

---

## So bearbeiten Sie etwas – in 5 Schritten

1. Öffnen Sie **github.com** und melden Sie sich an.
2. Gehen Sie in das Projekt `myregiocar` und dort in den Ordner **`content`**.
3. Klicken Sie die Datei an, die Sie ändern möchten (welche das ist, steht unten).
4. Klicken Sie oben rechts auf das **Stift-Symbol** ✏️ und ändern Sie den Text.
5. Ganz unten auf den grünen Knopf **„Commit changes"** klicken.

Nach etwa einer Minute ist die Änderung auf der Website zu sehen. Laden Sie die
Seite im Browser einmal neu.

---

## Welche Datei wofür?

Alle Dateien liegen im Ordner **`content`**.

| Was Sie ändern möchten | Datei |
|---|---|
| Telefonnummer, WhatsApp-Nummer, E-Mail, Öffnungszeiten, Urlaubshinweis | `einstellungen.yaml` |
| Preise, Park-&-Fly-Konditionen | `preise.yaml` |
| Häufige Fragen und Antworten | `faq.yaml` |
| Texte der Leistungsseiten | Ordner `leistungen` |
| Stellenanzeigen | Ordner `jobs` |
| Kundenbewertungen | Ordner `kundenstimmen` |

---

## Die wichtigsten Regeln beim Bearbeiten

Damit der Prüfer zufrieden ist, halten Sie sich an vier einfache Dinge:

**1. Ändern Sie nur den Text rechts vom Doppelpunkt.**

```yaml
telefonAnzeige: "+49 711 123456"
                 ^^^^^^^^^^^^^^^ nur das hier ändern
```

**2. Lassen Sie die Anführungszeichen stehen.**

Richtig: `ort: "Stuttgart"` — Falsch: `ort: Stuttgart"`

**3. Verändern Sie nicht die Leerzeichen am Zeilenanfang.**

Die Einrückung sagt dem Computer, was zu was gehört. Wenn eine Zeile mit zwei
Leerzeichen beginnt, muss sie das auch danach noch tun.

**4. Zeilen mit `#` am Anfang sind nur Notizen.**

Die können Sie lesen, sie erscheinen aber nicht auf der Website.

---

## Häufige Aufgaben

### Telefonnummer oder WhatsApp-Nummer ändern

Datei `einstellungen.yaml`, Abschnitt `kontakt`. Achten Sie auf die drei
verschiedenen Schreibweisen:

```yaml
kontakt:
  telefonAnzeige: "+49 711 123456"    # so wird sie ANGEZEIGT, mit Leerzeichen
  telefonWaehlen: "+49711123456"      # zum Anklicken, NUR Ziffern nach dem +
  whatsapp: "491711234567"            # NUR Ziffern, kein +, keine 0 am Anfang
```

Bei der WhatsApp-Nummer: **Die 0 am Anfang wird durch 49 ersetzt.**
Aus `0171 2345678` wird also `491712345678`.

Die neue Nummer erscheint danach automatisch überall: im Kopf, im Fuß, auf dem
grünen Knopf am unteren Bildschirmrand und auch bei Google.

### Urlaubshinweis einblenden

Datei `einstellungen.yaml`, Abschnitt `hinweisBanner`. Stellen Sie `anzeigen`
von `false` auf `true` und passen Sie den Text an:

```yaml
hinweisBanner:
  anzeigen: true
  text: "Vom 24.12. bis 02.01. sind wir nur eingeschränkt erreichbar."
```

Oben auf jeder Seite erscheint dann ein farbiger Streifen. Nach dem Urlaub
einfach wieder auf `false` stellen.

### Eine Stellenanzeige schließen

Gehen Sie in den Ordner `jobs`, öffnen Sie die Datei und ändern Sie
`aktiv: true` in `aktiv: false`. Die Anzeige verschwindet dann von der
Website – bleibt aber gespeichert, falls Sie sie später wieder brauchen.

Um sie wieder einzuschalten: zurück auf `true`.

### Eine neue Frage im FAQ ergänzen

Datei `faq.yaml`. Kopieren Sie einen bestehenden Block und passen Sie ihn an:

```yaml
- id: "wartezeit"
  frage: "Wie lange warten Sie am Flughafen?"
  antwort: >-
    Bei Flugverspätungen warten wir ohne Aufpreis. Geben Sie uns dafür bitte
    bei der Buchung Ihre Flugnummer an.
```

Die `id` muss einmalig sein und darf nur Kleinbuchstaben und Bindestriche
enthalten – keine Umlaute, keine Leerzeichen.

Das `>-` sorgt dafür, dass Sie die Antwort über mehrere Zeilen schreiben können.
Wichtig: Die Folgezeilen müssen eingerückt sein.

### Eine Kundenbewertung veröffentlichen

Ordner `kundenstimmen`. Dort stehen Beispiel-Einträge, die alle auf
`freigegeben: false` stehen und deshalb **nicht** auf der Website erscheinen.

Ersetzen Sie den Text durch eine echte Rückmeldung und stellen Sie dann
`freigegeben: true`.

> **Wichtig:** Erfundene Bewertungen sind wettbewerbswidrig und können
> abgemahnt werden. Veröffentlichen Sie nur echte Rückmeldungen und fragen Sie
> die Person vorher. Ein Vorname und der Stadtteil reichen völlig.

### Preise veröffentlichen

Aktuell zeigt die Website **absichtlich keine Preise** – Sie nennen sie im
WhatsApp-Chat. Wenn Sie das ändern möchten:

1. Datei `preise.yaml` öffnen
2. Bei den Strecken die echten Beträge eintragen (statt `0`)
3. Ganz unten `anzeigen: false` in `anzeigen: true` ändern

Solange überall noch `0` steht, bleibt die Tabelle auch bei `true` verborgen –
damit nie eine Preisliste voller Nullen online geht.

> **Bedenken Sie:** Ein veröffentlichter Preis ist für Sie verbindlich. Prüfen
> Sie die Zahlen daher gründlich.

### Einen Text auf einer Leistungsseite ändern

Ordner `leistungen`. Jede Leistung ist eine eigene Datei.

Oben zwischen den beiden `---`-Linien stehen die Grunddaten (Titel, Vorteile,
Google-Texte). Darunter folgt der normale Fließtext, den Sie einfach wie in
einem Textprogramm bearbeiten können.

Ein paar Formatierungen:

- `## Überschrift` erzeugt eine Zwischenüberschrift
- `**fett**` macht Text fett
- Eine Zeile, die mit `- ` beginnt, wird zu einem Aufzählungspunkt

---

## Wenn etwas nicht klappt

Wenn Ihre Änderung nach ein paar Minuten nicht auf der Website erscheint, hat
der Prüfer vermutlich einen Fehler gefunden.

**Bei GitHub nachsehen:** Neben Ihrer letzten Änderung steht dann ein rotes ✗
statt eines grünen ✓. Klicken Sie darauf – dort steht eine Meldung wie diese:

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

Die Meldung nennt Ihnen die Datei und die genaue Stelle. Korrigieren Sie sie und
speichern Sie erneut.

**Häufigste Ursachen:**

| Problem | Lösung |
|---|---|
| Ein Anführungszeichen fehlt | Beide `"` müssen da sein |
| Die Einrückung stimmt nicht | Leerzeichen am Zeilenanfang wie vorher setzen |
| `true` oder `false` in Anführungszeichen | Diese beiden Wörter **ohne** `"` schreiben |
| Umlaut in einer `id` | `id` darf nur a–z, 0–9 und `-` enthalten |

**Alles rückgängig machen:** Bei GitHub sehen Sie unter „History" alle
Änderungen. Sie können jederzeit zu einem früheren Stand zurück – oder rufen Sie
einfach Ihren Entwickler an.

---

## Was Sie nicht selbst ändern sollten

- Das Aussehen der Seite (Farben, Anordnung, Schriften)
- Impressum und Datenschutzerklärung – diese Texte sollten nur nach
  Rücksprache mit einer Anwältin oder einem Anwalt geändert werden
- Alles außerhalb des Ordners `content`

Wenn Sie hier etwas brauchen, melden Sie sich bei Ihrem Entwickler.
