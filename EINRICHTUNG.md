# Einrichtung mit Önder – Schritt für Schritt

Diese Liste ist zum Abarbeiten gedacht, gemeinsam an einem Tisch. Rechnen Sie
mit **45 bis 60 Minuten**, der größte Teil davon ist Warten darauf, dass die
Fahrer ihren Link öffnen.

Reihenfolge einhalten: Teil 1 muss vor Teil 5 stehen, sonst lässt sich nichts
prüfen.

---

## Was Sie vorher bereitlegen

**Amin:**

- Laptop mit Zugang zu **Cloudflare** (dash.cloudflare.com)
- Das **Passwort für den Fahrerbereich**
- Die Adresse des Fahrerbereichs: **vermittlung.myregiocar.com/fahrer**

**Önder:**

- Handy mit **Telegram** (vorher installieren, nicht erst beim Termin)
- Die **Liste der Fahrer**: Name, Handynummer, und ob jemand nur Tag oder nur
  Nacht fährt
- **IBAN** der Firma (für Rechnungen, falls jemand überweisen soll)
- Die **Konzessionsnummer** nach PBefG, falls zur Hand

**Die Fahrer selbst müssen nicht dabei sein.** Sie brauchen nur ihr Handy mit
Telegram und bekommen ihren Link per WhatsApp – das kann auch später am Tag
passieren.

---

## Teil 1 · Önder bekommt die Meldungen (10 Minuten)

Das Wichtigste zuerst: Önder muss erfahren, wenn etwas nicht automatisch
läuft. Ohne diesen Schritt gehen alle Meldungen weiterhin an Amin.

**1.1** Önder öffnet auf dem Handy diesen Link:

```
https://t.me/MyRegioBot
```

Telegram geht auf und zeigt den Bot. Unten steht ein Knopf **„Starten"** –
darauf tippen.

> Der Bot antwortet, dass er einen Anmeldecode braucht. **Das ist in Ordnung.**
> Önder ist kein Fahrer, er braucht keinen Code. Wichtig war nur, dass er den
> Chat einmal geöffnet hat – vorher darf der Bot ihm nichts schicken, das
> verbietet Telegram.

**1.2** Önder sucht in Telegram nach **@userinfobot** und tippt dort ebenfalls
auf **„Starten"**.

Der Bot antwortet sofort mit mehreren Zeilen. Gebraucht wird die Zeile:

```
Id: 123456789
```

**1.3** Diese Zahl bekommt Amin. Sie ist kein Passwort – sie ist eine Kennung
wie eine Telefonnummer und für sich genommen wertlos.

**1.4** Amin trägt sie bei Cloudflare ein:

1. dash.cloudflare.com → links **Compute (Workers)**
2. Worker **myregiocar-vermittlung** anklicken
3. **Settings** → Abschnitt **Variables and Secrets** → **+ Add**
4. **Type: Secret** auswählen (nicht „Text")
5. **Variable name:** `CHEF_CHAT_ID`
6. **Value:** die Zahl
7. **Deploy** klicken

> ⚠️ Gibt es den Eintrag schon, muss er zuerst über das **Papierkorb-Symbol**
> weg – sonst bleibt die alte Nummer stehen.
>
> ⚠️ **„Secret" muss angehakt sein.** Als normale Variable wird der Wert beim
> nächsten Veröffentlichen gelöscht, und dann bekommt niemand mehr Meldungen,
> ohne dass irgendwo ein Fehler erscheint.

**Erledigt?** ☐

---

## Teil 2 · Milad freischalten (5 Minuten)

Milad steht bereits im System, hat den Bot aber noch nie geöffnet. Bis dahin
bekommt er keine Aufträge.

**2.1** Amin öffnet **vermittlung.myregiocar.com/fahrer** und meldet sich an.

**2.2** In der Fahrerliste steht bei Milad **„nicht angemeldet"** und darunter
ein Link, der mit `t.me/MyRegioBot?start=` beginnt.

**2.3** Diesen Link per WhatsApp an Milad schicken.

**2.4** Milad öffnet ihn auf dem Handy, tippt auf **„Starten"** und bekommt
eine Bestätigung mit seinem Namen.

**2.5** Fahrerbereich neu laden. Bei Milad muss jetzt **„✓ angemeldet"**
stehen.

> **Nebeneffekt:** Ab zwei angemeldeten Fahrern erscheint auf der Website die
> Auswahl **„Wunschfahrer"**. Vorher bleibt sie verborgen.

**Erledigt?** ☐

---

## Teil 3 · Die übrigen Fahrer anlegen (5 Minuten je Fahrer)

Für jeden Fahrer einmal:

**3.1** Im Fahrerbereich auf **„Neuen Fahrer anlegen"**

**3.2** Eintragen:

| Feld | Was hinein |
|---|---|
| Name | Vor- und Nachname. Der **Vorname** erscheint später auf der Website |
| Telefon | Handynummer |
| Schicht | **Beide Schichten**, **Nur Tag** oder **Nur Nacht** |
| Reihenfolge | Kleinere Zahl = wird zuerst gefragt. 10, 20, 30 … |

**3.3** **„Anlegen"** tippen, den `t.me/MyRegioBot?start=`-Link kopieren und
dem Fahrer per WhatsApp schicken.

**3.4** Der Fahrer öffnet ihn, tippt **„Starten"** – fertig.

**3.5** Prüfen: Steht bei ihm **„✓ angemeldet"**?

> **Erst dann bekommt er Aufträge.** Solange dort „nicht angemeldet" steht,
> wird er bei der Vermittlung übersprungen.
>
> **Zur Reihenfolge:** Wer zuerst gefragt wird, bekommt die meisten Fahrten.
> Önder sollte sich überlegen, ob das so gewollt ist – zum Beispiel die
> Vollzeitkräfte vorn, Aushilfen hinten.

**Erledigt für:** ☐ ☐ ☐ ☐ ☐

---

## Teil 4 · Firmendaten für Rechnungen (10 Minuten)

**4.1** Fahrerbereich → **Rechnungen** → unten **„Firmendaten"** aufklappen

**4.2** Prüfen und ergänzen:

- **Firmenname, Straße, PLZ und Ort** – stehen schon da, einmal gegenlesen
- **USt-IdNr. oder Steuernummer** – steht schon da, von Önder bestätigen lassen
- **IBAN** – neu einzutragen. Wird nur gebraucht, wenn jemand per Überweisung
  zahlen soll; bar und Karte gehen auch ohne
- **Bank** – Name der Bank

**4.3** **„Firmendaten speichern"**

> Die Angaben gelten ab der **nächsten** Rechnung. Schon ausgestellte bleiben
> unverändert – das verlangt das Steuerrecht.

**Erledigt?** ☐

---

## Teil 5 · Probe: Kommt bei Önder etwas an? (5 Minuten)

Jetzt zeigt sich, ob Teil 1 funktioniert hat.

**5.1** Amin bestellt auf **www.myregiocar.com** eine Fahrt:
Anlass wählen, Abholung und Ziel **aus den Vorschlägen anklicken** (nicht nur
tippen), Termin „so bald wie möglich", Name und Telefonnummer, dann
**„Jetzt Fahrer anfordern"**.

**5.2** Die Handys der Fahrer klingeln. **Niemand tippt etwas an.**

**5.3** Nach etwa anderthalb Minuten – wenn alle Fahrer durch sind – muss bei
**Önder** eine Telegram-Nachricht ankommen:

> 🚗 Kein Fahrer gefunden …

**Kommt sie an?** Dann stimmt die Einrichtung.

**Kommt sie nicht an**, liegt es an einem dieser drei Punkte:

1. Önder hat den Bot nie geöffnet (Teil 1.1)
2. Die Zahl wurde falsch übertragen – Zahlendreher
3. Der Eintrag wurde als „Text" statt als „Secret" angelegt

**Erledigt?** ☐

---

## Teil 6 · Was Önder und die Fahrer im Alltag tun

Das ist der Teil, den Önder verstehen muss. Alles andere läuft von selbst.

### Der Fahrer tippt pro Fahrt vier Knöpfe

Alle im selben Telegram-Chat, keine App, kein Menü:

| Knopf | Wann | Was passiert |
|---|---|---|
| **✅ Annehmen** | Angebot kommt rein | Er bekommt Name und Rufnummer des Fahrgasts |
| **📍 Standort senden** | Wenn er losfährt | Der Fahrgast sieht „noch etwa 6 Minuten" |
| **🚕 Fahrgast abgeholt** | Beim Einsteigen | Beim Fahrgast steht „Ihr Fahrer ist da" |
| **✅ Erledigt** | Nach der Fahrt | Er ist wieder frei, Rechnung geht automatisch raus |

> **Wer eine Rechnung bestellt hat**, dessen Fahrer sieht statt „Erledigt"
> zwei Knöpfe: **„Erledigt · bar"** und **„Erledigt · Karte"**. Die Zahlungsart
> muss auf der Rechnung stehen, und geraten wird sie nicht.
>
> **Der Standortknopf ist freiwillig.** Wer ihn nie tippt, dessen Fahrten
> laufen genauso – der Fahrgast sieht dann nur keine Zeitangabe.
>
> **Bequemer:** Einmal morgens in Telegram Büroklammer → Standort →
> „Live-Standort teilen", 8 Stunden. Dann läuft es den ganzen Tag ohne
> weiteres Zutun.

### Was ohne Zutun passiert

- **Rechnung** an den Fahrgast, sobald „Erledigt" getippt ist
- **Dankesmail** mit Bitte um Bewertung, wenn er seine Adresse angegeben hat
- **Bewertung** auf der Seite, direkt nach der Fahrt

### Wann Önder gebraucht wird

Er bekommt dann eine Telegram-Nachricht:

| Meldung | Was zu tun ist |
|---|---|
| **Kein Fahrer gefunden** | Fahrgast anrufen, Nummer steht in der Nachricht |
| **Rechnung von Hand nötig** | Über 250 € oder kein Festpreis – im Fahrerbereich schreiben |
| **Rechnung nicht verschickt** | Auf der Rechnungsseite auf „Noch einmal verschicken" |
| **⚠️ Schlechte Bewertung** | Zwei Sterne oder weniger – am selben Tag anrufen lohnt sich |
| **⭐ Neue Bewertung** | Nur zur Kenntnis |

### Wo er nachschaut

**vermittlung.myregiocar.com/fahrer** – Fahrer verwalten, laufende Fahrten,
Rechnungen, telefonische Aufträge aufnehmen.

Auf dem Handy lohnt sich **„Zum Startbildschirm hinzufügen"**, dann öffnet es
sich wie eine App.

Die ausführliche Anleitung dazu steht in [ANLEITUNG.md](ANLEITUNG.md).

**Besprochen?** ☐

---

## Teil 7 · Eine echte Fahrt zusammen durchspielen (15 Minuten)

Nicht überspringen. Alles ist einzeln geprüft, aber niemand hat das Ganze
bisher als Fremder benutzt.

**7.1** Önder bestellt vom eigenen Handy eine kurze Fahrt und gibt dabei
**seine E-Mail-Adresse** an, mit Haken bei „Rechnung".

**7.2** Ein Fahrer nimmt an, tippt **Standort senden**, fährt wirklich los.

**7.3** Önder schaut auf seiner Seite zu: Erscheint die Minutenzahl? Sinkt sie?

**7.4** Önder schreibt eine Nachricht an den Fahrer, der Fahrer antwortet.
Steht beides im Verlauf?

**7.5** Fahrer tippt **Fahrgast abgeholt**, dann **Erledigt · bar**.

**7.6** Prüfen:

- Kommt die **Rechnung per Mail** an? (**Auch im Spam nachsehen** – bei neuen
  Absendern ist das normal und bessert sich mit der Zeit)
- Lässt sich das **PDF öffnen**?
- Erscheint auf der Seite das **Dankeschön mit den Sternen**?
- Kommt die **Bewertung** bei Önder in Telegram an?

**7.7** Die Testrechnung anschließend **stornieren** – nicht löschen, das geht
nicht und soll auch nicht gehen. Auf der Rechnung steht dafür ein Knopf.

**Erledigt?** ☐

---

## Was Amin danach noch allein erledigt

Nichts davon hält den Betrieb auf, aber es sollte nicht liegen bleiben:

1. **Google-Unternehmensprofil** anlegen, den Bewertungslink unter
   *Rechnungen → Firmendaten* eintragen.
   ⚠️ **Nicht die Kategorie „Taxi" wählen** – Mietwagen mit Fahrer ist etwas
   anderes, und die Verwechslung ist rechtlich heikel.
2. **Datenschutzerklärung** um vier Punkte ergänzen: Brevo als
   Auftragsverarbeiter, E-Mail-Adresse des Fahrgasts, Standort der Fahrer,
   Nachrichten im Chat.
3. **Auftragsverarbeitungsvertrag mit Brevo** abschließen (liegt im
   Brevo-Konto bereit).
4. **Konzessionsnummer** ins Impressum, sobald Önder sie geschickt hat.

Die vollständige Liste mit Befehlen steht in [TODO-KUNDE.md](TODO-KUNDE.md).
