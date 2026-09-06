/**
 * End-zu-Ende-Probe der Vermittlung.
 *
 * Voraussetzung: In zwei anderen Fenstern laufen
 *   node test/telegram-attrappe.mjs
 *   npx wrangler dev --port 8788
 *
 * Aufruf:  node test/ablauf.mjs
 */

const DIENST = 'http://127.0.0.1:8788';
const ATTRAPPE = 'http://127.0.0.1:8799';

let fehler = 0;

function pruefe(bedingung, beschreibung, zusatz = '') {
  if (bedingung) {
    console.log(`  ✓ ${beschreibung}`);
  } else {
    console.log(`  ✗ ${beschreibung}${zusatz ? '\n      ' + zusatz : ''}`);
    fehler++;
  }
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function aufrufe() {
  return (await fetch(`${ATTRAPPE}/__aufrufe`)).json();
}
async function leeren() {
  await fetch(`${ATTRAPPE}/__leeren`);
}

/** Nachrichten an einen bestimmten Chat herausfiltern. */
function an(liste, chatId) {
  return liste.filter(
    (a) => a.methode === 'sendMessage' && String(a.daten.chat_id) === String(chatId),
  );
}

async function bestelle(zusatz = {}) {
  const antwort = await fetch(`${DIENST}/api/bestellung`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      art: 'Flughafentransfer',
      abholung: 'Steiermärker Str. 3, Stuttgart',
      ziel: 'Flughafen Stuttgart',
      wunschzeit: 'Mo., 07.09.2026 um 06:30 Uhr',
      personen: 2,
      gepaeck: 3,
      name: 'Max Mustermann',
      telefon: '+49 171 1234567',
      ...zusatz,
    }),
  });
  return { status: antwort.status, koerper: await antwort.json() };
}

/** Simuliert einen Knopfdruck des Fahrers. */
async function knopfDruck(auftragId, fahrerId, chatId, annahme) {
  return fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-geheimnis',
    },
    body: JSON.stringify({
      callback_query: {
        id: 'cb1',
        data: `${annahme ? 'ja' : 'nein'}:${auftragId}:${fahrerId}`,
        message: { chat: { id: chatId }, message_id: 1 },
      },
    }),
  });
}

async function status(id) {
  return (await fetch(`${DIENST}/api/status/${id}`)).json();
}

/* ========================================================================== */

console.log('\n=== 1. Fahrer 1 nimmt an ===');
await leeren();
{
  const { status: code, koerper } = await bestelle();
  pruefe(code === 201, 'Bestellung wird angenommen', `Code ${code}`);

  await warte(600);
  let liste = await aufrufe();

  pruefe(an(liste, '101').length === 1, 'Fahrer 1 bekommt genau eine Anfrage');
  pruefe(an(liste, '102').length === 0, 'Fahrer 2 bekommt noch nichts');

  const angebot = an(liste, '101')[0]?.daten.text ?? '';
  pruefe(
    angebot.includes('Steiermärker'),
    'Die Abholadresse steht schon im Angebot',
    angebot.slice(0, 160),
  );
  pruefe(angebot.includes('Flughafen Stuttgart'), 'Das Ziel steht im Angebot');
  pruefe(
    !angebot.includes('Max Mustermann') && !angebot.includes('1234567'),
    'Name und Rufnummer des Fahrgasts stehen NOCH NICHT im Angebot',
    angebot.slice(0, 160),
  );
  pruefe(
    JSON.stringify(an(liste, '101')[0]?.daten.reply_markup ?? {}).includes('Annehmen'),
    'Der Annehmen-Knopf ist dabei',
  );

  await leeren();
  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);
  liste = await aufrufe();

  const zusage = liste.find(
    (a) => a.methode === 'editMessageText' && String(a.daten.chat_id) === '101',
  );
  pruefe(
    zusage?.daten.text.includes('Max Mustermann'),
    'Erst nach dem Annehmen kommt der Name des Fahrgasts',
  );
  pruefe(
    zusage?.daten.text.includes('+49 171 1234567'),
    'Erst nach dem Annehmen kommt die Rufnummer',
  );
  pruefe(
    zusage?.daten.text.includes('Steiermärker'),
    'Die Adresse steht auch in der Zusage',
  );

  const s = await status(koerper.auftragId);
  pruefe(s.status === 'angenommen', 'Status steht auf angenommen', JSON.stringify(s));
  pruefe(s.fahrer === 'Anna', 'Der Fahrgast sieht den Vornamen', JSON.stringify(s));
}

console.log('\n=== 2. Fahrer 1 antwortet nicht, Fahrer 2 übernimmt ===');
await leeren();
{
  const { koerper } = await bestelle();
  await warte(600);
  pruefe(an(await aufrufe(), '101').length === 1, 'Fahrer 1 wird zuerst gefragt');

  // Antwortzeit steht im Test auf 3 Sekunden
  console.log('  … warte auf das Zeitfenster');
  await warte(3800);

  const liste = await aufrufe();
  pruefe(an(liste, '102').length === 1, 'Nach Ablauf wird Fahrer 2 gefragt');
  pruefe(
    liste.some(
      (a) =>
        a.methode === 'editMessageText' &&
        String(a.daten.chat_id) === '101' &&
        a.daten.text.includes('Zeit abgelaufen'),
    ),
    'Bei Fahrer 1 verschwinden die Knöpfe',
  );

  await knopfDruck(koerper.auftragId, 102, '102', true);
  await warte(400);
  const s = await status(koerper.auftragId);
  pruefe(s.fahrer === 'Bekir', 'Fahrer 2 hat die Fahrt', JSON.stringify(s));
}

console.log('\n=== 3. Fahrer 1 lehnt ab – sofort weiter, ohne Wartezeit ===');
await leeren();
{
  const { koerper } = await bestelle();
  await warte(600);

  const vorher = Date.now();
  await knopfDruck(koerper.auftragId, 101, '101', false);
  await warte(500);
  const gebraucht = Date.now() - vorher;

  pruefe(an(await aufrufe(), '102').length === 1, 'Fahrer 2 wird gefragt');
  pruefe(gebraucht < 2000, 'Ohne Warten auf das Zeitfenster', `${gebraucht} ms`);

  // Auftrag abschliessen, sonst laeuft seine Eskalation in den naechsten
  // Abschnitt hinein und der Chef bekaeme dort zwei Meldungen.
  await knopfDruck(koerper.auftragId, 102, '102', true);
  await warte(300);
}

console.log('\n=== 4. Niemand nimmt an – der Chef wird benachrichtigt ===');
await leeren();
{
  const { koerper } = await bestelle();
  console.log('  … warte, bis beide Fahrer durch sind');
  await warte(8000);

  const liste = await aufrufe();
  pruefe(an(liste, '999').length === 1, 'Der Chef bekommt genau eine Meldung');

  const meldung = an(liste, '999')[0]?.daten.text ?? '';
  pruefe(meldung.includes('Kein Fahrer'), 'Die Meldung ist eindeutig');
  pruefe(
    meldung.includes('Steiermärker') && meldung.includes('+49 171 1234567'),
    'Der Chef bekommt alle Angaben, um selbst zu übernehmen',
  );

  const s = await status(koerper.auftragId);
  pruefe(s.status === 'niemand', 'Status steht auf "kein Fahrer"', JSON.stringify(s));
}

console.log('\n=== 5. Absicherungen ===');
{
  const ohneName = await bestelle({ name: '' });
  pruefe(ohneName.status === 400, 'Bestellung ohne Namen wird abgelehnt');

  const unsinnigeNummer = await bestelle({ telefon: 'abc' });
  pruefe(unsinnigeNummer.status === 400, 'Unsinnige Telefonnummer wird abgelehnt');

  const ohneGeheimnis = await fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  pruefe(
    ohneGeheimnis.status === 401,
    'Telegram-Aufruf ohne Geheimnis wird abgewiesen',
  );

  const fremd = await status('gibt-es-nicht');
  pruefe(Boolean(fremd.fehler), 'Unbekannter Auftrag liefert keinen Status');
}

console.log(
  fehler === 0
    ? '\n✅ Alle Prüfungen bestanden.\n'
    : `\n❌ ${fehler} Prüfung(en) fehlgeschlagen.\n`,
);
process.exit(fehler === 0 ? 0 : 1);
