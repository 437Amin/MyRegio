# Ihr Fahrerbereich

Diese Anleitung ist für Sie geschrieben – ohne Fachbegriffe. Sie brauchen kein
Programm zu installieren und können alles auch vom Handy aus erledigen.

**Das erledigen Sie selbst im Fahrerbereich:**
Fahrer anlegen und entfernen, Tag- und Nachtschicht, Festpreise, Aufträge ansehen.

**Das läuft über Amin:**
Alles, was auf der Website steht – Texte, Öffnungszeiten, Telefonnummer,
Park & Fly, Stellenanzeigen, Kundenbewertungen. Schicken Sie ihm einfach eine
WhatsApp-Nachricht, was sich ändern soll.

---

## So melden Sie sich an

Rufen Sie im Browser auf:

**https://myregiocar-vermittlung.assad-amin.workers.dev/fahrer**

Das Passwort bekommen Sie von Amin. Nach 12 Stunden werden Sie automatisch
abgemeldet.

> **Tipp:** Legen Sie sich die Adresse auf dem Handy als Lesezeichen oder auf
> den Startbildschirm. Dann ist der Fahrerbereich immer einen Tipp entfernt.

---

## So läuft eine Bestellung ab

1. Ein Kunde bestellt auf der Website und sieht vorher den Festpreis.
2. Der **erste passende Fahrer** bekommt eine Telegram-Nachricht mit der
   Abholadresse und zwei Knöpfen: **Annehmen** und **Ablehnen**.
3. Lehnt er ab oder reagiert nicht innerhalb von **40 Sekunden**, ist der
   nächste Fahrer dran.
4. Nimmt jemand an, bekommt er Name und Telefonnummer des Fahrgasts.
5. Nimmt **niemand** an, bekommen **Sie** eine Telegram-Nachricht mit allen
   Angaben und der Telefonnummer des Fahrgasts. Dann rufen Sie ihn am besten
   kurz an.

**Wer ist „passend"?** Ein Fahrer, der aktiv ist, in Telegram angemeldet ist
und dessen Schicht zur Uhrzeit der **Fahrt** passt – nicht zur Uhrzeit der
Bestellung. Wer abends eine Fahrt für den nächsten Morgen bestellt, erreicht
also die Tagfahrer.

---

## Einen neuen Fahrer anlegen

1. Unter **„Neuen Fahrer anlegen"** Name und Telefonnummer eintragen
2. Schicht wählen: **Beide Schichten**, **Nur Tag** oder **Nur Nacht**
3. Die Zahl für die Reihenfolge eintragen (siehe unten)
4. **„Anlegen"** tippen

Oben in der Liste steht der Fahrer jetzt mit **„nicht angemeldet"** und
darunter einem Link, der mit `t.me/MyRegioBot` beginnt.

5. **Schicken Sie diesen Link dem Fahrer per WhatsApp.**
6. Der Fahrer öffnet den Link auf seinem Handy. Telegram geht auf, er tippt auf
   **„Starten"** und bekommt eine Bestätigung.
7. Laden Sie den Fahrerbereich neu. Beim Fahrer steht jetzt **„✓ angemeldet"**.

**Erst dann bekommt er Aufträge.** Der Fahrer braucht dafür die Telegram-App
auf seinem Handy.

---

## Die Reihenfolge festlegen

Jeder Fahrer hat eine Zahl. **Wer die kleinste Zahl hat, wird zuerst gefragt.**

> **Tipp:** Vergeben Sie 10, 20, 30 statt 1, 2, 3. Dann können Sie später
> jemanden dazwischenschieben – zum Beispiel mit 15 –, ohne alle anderen
> ändern zu müssen.

Haben zwei Fahrer dieselbe Zahl, wird zuerst gefragt, wer früher angelegt wurde.

Zum Ändern: Zahl in der Zeile des Fahrers anpassen und **„Speichern"** tippen.

---

## Einen Fahrer pausieren – Urlaub, krank, freier Tag

Beim Fahrer den Haken bei **„aktiv"** entfernen und **„Speichern"** tippen.

Er bekommt keine Aufträge mehr, bleibt aber mit allen Angaben gespeichert. Wenn
er zurück ist, den Haken wieder setzen. Eine neue Anmeldung in Telegram ist
nicht nötig.

---

## Einen Fahrer entfernen

Beim Fahrer auf **„Löschen"** tippen und bestätigen.

Er verschwindet aus der Liste und bekommt nie wieder Aufträge. Seine
Telefonnummer und die Telegram-Verbindung werden gelöscht, sein alter
Anmeldelink funktioniert nicht mehr.

**Hatte er schon Aufträge, bleibt sein Name in der Auftragsliste stehen.** So
sehen Sie bei einer Rückfrage oder Beschwerde weiterhin, wer gefahren ist.

Kommt der Fahrer später zurück, legen Sie ihn einfach neu an.

---

## Tag- und Nachtschicht einstellen

Unter **„Einstellungen"**:

- **Nacht von … bis …** – zum Beispiel `22:00` bis `06:00`. Alles andere ist
  Tagschicht.
- **Antwortzeit** – so viele Sekunden hat ein Fahrer, bevor der nächste gefragt
  wird. Voreingestellt sind 40.

Danach **„Speichern"** tippen.

---

## Festpreise ändern

Unter **„Festpreise"** stehen die Werte, aus denen der Preis für jede Fahrt
berechnet wird:

| Feld | Bedeutung |
|---|---|
| **Grundpreis** | Fester Betrag für jede Fahrt |
| **bis … km je … €** | Preis pro Kilometer auf den ersten Kilometern |
| **danach je … €** | Preis pro Kilometer für den Rest der Strecke |
| **Mindestens** | Günstiger wird keine Fahrt |
| **Aufrunden auf** | Der Preis wird immer aufgerundet, z. B. auf volle 50 Cent |

Darunter zeigt eine Tabelle, was einige typische Strecken dann kosten – und
was dieselbe Strecke mit dem Taxi in Stuttgart kosten würde. **Schauen Sie
nach dem Speichern immer auf diese Tabelle.**

> **Wichtig:** Ein Preis, den der Kunde sieht, ist **verbindlich**. Die neuen
> Werte gelten sofort für alle Kunden, die ab jetzt einen Preis angezeigt
> bekommen. Bereits bestellte Fahrten behalten ihren Preis.

---

## Aufträge ansehen

Unter **„Letzte Aufträge"** stehen die neuesten Bestellungen mit Eingang,
Anlass, Abholung, Fahrgast und Fahrer.

| Status | Bedeutung |
|---|---|
| **läuft** | Fahrer werden gerade gefragt |
| **angenommen** | Ein Fahrer hat die Fahrt übernommen |
| **kein Fahrer** | Niemand hat angenommen – Sie haben eine Nachricht bekommen |
| **storniert** | Die Fahrt wurde abgesagt |

---

## Wenn etwas nicht klappt

**Ein Fahrer bekommt keine Aufträge.**
Prüfen Sie in dieser Reihenfolge:
1. Steht bei ihm **„✓ angemeldet"**? Falls nicht: Link noch einmal schicken.
2. Ist der Haken bei **„aktiv"** gesetzt?
3. Passt seine **Schicht** zur Uhrzeit der Fahrt?
4. Sind **andere Fahrer vor ihm** dran und nehmen die Aufträge an?

**Telegram sagt dem Fahrer „Diesen Code kenne ich nicht".**
Der Link ist veraltet – zum Beispiel, weil der Fahrer entfernt und neu angelegt
wurde. Schicken Sie ihm den Link, der jetzt im Fahrerbereich bei ihm steht.

**Sie haben die Nachricht „Kein Fahrer gefunden" bekommen.**
Rufen Sie den Fahrgast unter der Nummer in der Nachricht an. Steht dort, dass
zu dieser Uhrzeit **kein Fahrer eingeteilt** war, lohnt sich ein Blick auf die
Schichten.

**Sie haben das Passwort vergessen.**
Melden Sie sich bei Amin.

---

## Änderungen an der Website

Diese Dinge ändert Amin für Sie. Schicken Sie ihm per WhatsApp, was genau
anders sein soll:

- Telefonnummer, WhatsApp-Nummer, E-Mail-Adresse
- Öffnungszeiten oder ein Urlaubshinweis oben auf der Seite
- Preis und Bedingungen für Park & Fly
- Stellenanzeigen öffnen oder schließen
- Häufige Fragen und Antworten
- Texte auf den Leistungsseiten
- Impressum und Datenschutzerklärung

> **Bei Kundenbewertungen:** Nur echte Rückmeldungen, und nur, wenn die Person
> einverstanden ist. Erfundene Bewertungen können abgemahnt werden. Vorname und
> Stadtteil reichen völlig.
