/**
 * Rechnungsversand im echten Workers-Lauf.
 *
 * Prueft, was vitest nicht kann: dass eine Rechnung aus dem Fahrerbereich
 * heraus wirklich bis zur Mail-Schnittstelle kommt - samt Anmeldung,
 * PDF-Erzeugung in der Worker-Umgebung und dem Weg ueber Korrektur und
 * erneuten Versand.
 *
 * Voraussetzung (drei Fenster):
 *   node test/telegram-attrappe.mjs        # steht hier auch fuer Brevo
 *   npx wrangler dev --port 8788 --var ADMIN_PASSWORT:lokal-test  *     --var BREVO_API_KEY:lokal-test --var BREVO_BASIS:http://127.0.0.1:8799
 *   node test/versand.mjs
 */
const DIENST = 'http://127.0.0.1:8788';
const ATTRAPPE = 'http://127.0.0.1:8799';

function pruefe(bedingung, text, zusatz = '') {
  console.log(`  ${bedingung ? '✓' : '✗'} ${text}${!bedingung && zusatz ? '\n      ' + zusatz : ''}`);
  return bedingung ? 0 : 1;
}

let fehler = 0;

// --- Anmelden ---------------------------------------------------------------
const anmeldung = await fetch(`${DIENST}/fahrer/anmelden`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ passwort: 'lokal-test', weiter: '/fahrer' }),
  redirect: 'manual',
});
const keks = (anmeldung.headers.get('set-cookie') ?? '').split(';')[0];
fehler += pruefe(Boolean(keks), 'Anmeldung am Fahrerbereich', `Code ${anmeldung.status}`);

const mitKeks = (kopf = {}) => ({ cookie: keks, ...kopf });

// --- Rechnung von Hand schreiben --------------------------------------------
await fetch(`${ATTRAPPE}/__leeren`);

const erstellt = await fetch(`${DIENST}/fahrer/rechnungen/neu`, {
  method: 'POST',
  headers: mitKeks({ 'content-type': 'application/x-www-form-urlencoded' }),
  body: new URLSearchParams({
    von: 'Steiermärker Straße 3-5, Stuttgart',
    nach: 'Flughafen Stuttgart',
    betrag: '46,50',
    fahrtdatum: '2026-10-13',
    kunde_name: 'Frau Keller',
    kunde_anschrift: '',
    zahlungsart: 'karte',
  }),
  redirect: 'manual',
});
const ziel = erstellt.headers.get('location') ?? '';
const id = Number(ziel.match(/rechnungen\/(\d+)/)?.[1]);
fehler += pruefe(Number.isFinite(id) && id > 0, 'Rechnung angelegt', ziel);

// --- Verschicken ------------------------------------------------------------
const versand = await fetch(`${DIENST}/fahrer/rechnungen/${id}/senden`, {
  method: 'POST',
  headers: mitKeks({ 'content-type': 'application/x-www-form-urlencoded' }),
  body: new URLSearchParams({ an: 'kundin@example.com' }),
  redirect: 'manual',
});
fehler += pruefe(
  (versand.headers.get('location') ?? '').includes('versand=ok'),
  'Versand gemeldet als erfolgreich',
  versand.headers.get('location') ?? '',
);

const mails = (await (await fetch(`${ATTRAPPE}/__aufrufe`)).json()).filter(
  (a) => a.methode === 'email',
);
fehler += pruefe(mails.length === 1, 'Genau eine Mail ging raus', `${mails.length}`);

const mail = mails[0]?.daten ?? {};
fehler += pruefe(mail.to?.[0]?.email === 'kundin@example.com', 'An die richtige Adresse');
fehler += pruefe(
  String(mail.subject).includes('2026-'),
  'Betreff nennt die Rechnungsnummer',
  String(mail.subject),
);
fehler += pruefe(
  typeof mail.textContent === 'string' && !('htmlContent' in mail),
  'Reiner Text, kein HTML',
);
fehler += pruefe(
  String(mail.textContent).includes('46,50'),
  'Der Betrag steht im Anschreiben',
);

const anhang = mail.attachment?.[0];
const roh = anhang ? Buffer.from(anhang.content, 'base64') : Buffer.alloc(0);
// Eine einseitige Rechnung mit Standardschriften wiegt rund 2,3 KB. Die
// Untergrenze soll eine leere oder abgeschnittene Datei fangen, nicht eine
// sparsame - deshalb 1 KB und nicht mehr.
fehler += pruefe(
  roh.subarray(0, 4).toString() === '%PDF' && roh.length > 1000,
  'Ein vollstaendiges PDF haengt dran',
  `${roh.length} Bytes, Anfang ${roh.subarray(0, 8).toString()}`,
);

// --- Der Versand ist festgehalten -------------------------------------------
const seite = await (
  await fetch(`${DIENST}/fahrer/rechnungen/${id}`, { headers: mitKeks() })
).text();
fehler += pruefe(
  seite.includes('Per E-Mail verschickt am') && seite.includes('kundin@example.com'),
  'Die Seite zeigt Zeitpunkt und Empfaenger',
);
fehler += pruefe(seite.includes('Rechnung korrigieren'), 'Der Korrigieren-Knopf steht da');

// --- Korrigieren ------------------------------------------------------------
await fetch(`${ATTRAPPE}/__leeren`);
const korrektur = await fetch(`${DIENST}/fahrer/rechnungen/${id}/korrigieren`, {
  method: 'POST',
  headers: mitKeks(),
  redirect: 'manual',
});
const weiter = korrektur.headers.get('location') ?? '';
fehler += pruefe(
  weiter.includes('korrigiert=') && weiter.includes('an=kundin'),
  'Weiterleitung ins vorbelegte Formular',
  weiter,
);

const stornoMails = (await (await fetch(`${ATTRAPPE}/__aufrufe`)).json()).filter(
  (a) => a.methode === 'email',
);
fehler += pruefe(
  stornoMails.length === 1 && String(stornoMails[0].daten.subject).includes('Storno'),
  'Die Stornorechnung geht an den Fahrgast',
  String(stornoMails[0]?.daten.subject),
);
fehler += pruefe(
  !String(stornoMails[0]?.daten.textContent).includes('Bewertung'),
  'Unter einer Stornorechnung wird nicht um eine Bewertung gebeten',
);

const formular = await (
  await fetch(`${DIENST}${weiter}`, { headers: mitKeks() })
).text();
fehler += pruefe(formular.includes('46,50'), 'Der alte Betrag ist vorbelegt');
fehler += pruefe(formular.includes('Frau Keller'), 'Der Name ist vorbelegt');
fehler += pruefe(
  formular.includes('name="senden_an" value="kundin@example.com"'),
  'Die Adresse fuer den automatischen Versand steht im Formular',
);

// --- Neue Rechnung aus der Korrektur ----------------------------------------
await fetch(`${ATTRAPPE}/__leeren`);
const neue = await fetch(`${DIENST}/fahrer/rechnungen/neu`, {
  method: 'POST',
  headers: mitKeks({ 'content-type': 'application/x-www-form-urlencoded' }),
  body: new URLSearchParams({
    von: 'Steiermärker Straße 3-5, Stuttgart',
    nach: 'Flughafen Stuttgart',
    betrag: '52,00',
    fahrtdatum: '2026-10-13',
    kunde_name: 'Frau Keller',
    kunde_anschrift: '',
    zahlungsart: 'karte',
    senden_an: 'kundin@example.com',
  }),
  redirect: 'manual',
});
fehler += pruefe(
  (neue.headers.get('location') ?? '').includes('versand=ok'),
  'Die berichtigte Rechnung geht automatisch raus',
  neue.headers.get('location') ?? '',
);

const neueMails = (await (await fetch(`${ATTRAPPE}/__aufrufe`)).json()).filter(
  (a) => a.methode === 'email',
);
fehler += pruefe(
  String(neueMails[0]?.daten.textContent).includes('52,00'),
  'Mit dem berichtigten Betrag',
);

console.log(
  fehler === 0 ? '\n✅ Alle Prüfungen bestanden.\n' : `\n❌ ${fehler} fehlgeschlagen.\n`,
);
