-- Testdaten fuer die End-zu-Ende-Probe. Nur fuer die lokale Datenbank.
DELETE FROM verlauf;
DELETE FROM auftraege;
DELETE FROM drosselung;
DELETE FROM fahrer;

INSERT INTO fahrer (id, name, telefon, telegram_chat_id, anmeldecode, schicht, reihenfolge, aktiv)
VALUES
  (101, 'Anna Beispiel',  '+491700000001', '101', 'AAA111', 'beide', 10, 1),
  (102, 'Bekir Beispiel', '+491700000002', '102', 'BBB222', 'beide', 20, 1);

-- Kurze Antwortzeit, damit der Test nicht 40 Sekunden je Fahrer braucht
UPDATE einstellungen SET wert = '3' WHERE schluessel = 'antwortzeit_sekunden';
