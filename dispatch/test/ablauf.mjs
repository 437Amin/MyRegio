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

/**
 * Legt eine Bestellung ab.
 *
 * Die Absender-IP ist angebbar, weil der Dienst nur fuenf Bestellungen pro
 * Stunde und Absender annimmt. Ohne das gingen die spaeteren Abschnitte dieser
 * Probe an der Drosselung zugrunde statt an der Vermittlung.
 */
async function bestelle(zusatz = {}, ip = '203.0.113.1') {
  const antwort = await fetch(`${DIENST}/api/bestellung`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
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

/**
 * Simuliert den Knopf "Fahrt erledigt".
 *
 * Danach ist der Fahrer wieder frei. Ohne das bleibt er fuer die geschaetzte
 * Fahrtdauer gesperrt - richtig im Betrieb, aber hier waeren nach zwei
 * Abschnitten beide Fahrer belegt.
 */
async function erledige(auftragId, fahrerId, zahlungsart = '') {
  const antwort = await fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-geheimnis',
    },
    body: JSON.stringify({
      callback_query: {
        id: 'cb-fertig',
        data: `fertig:${auftragId}:${fahrerId}${zahlungsart ? ':' + zahlungsart : ''}`,
        message: { chat: { id: String(fahrerId) }, message_id: 1 },
      },
    }),
  });
  await warte(300);
  return antwort;
}

/** Der Fahrgast bewertet die Fahrt. */
async function bewerten(auftragId, sterne, text) {
  const antwort = await fetch(`${DIENST}/api/bewertung`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ auftragId, sterne, text }),
  });
  return { status: antwort.status, koerper: await antwort.json() };
}

/** Der Fahrer tippt etwas in den Chat mit dem Bot. */
async function fahrerSchreibt(chatId, text) {
  return fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-geheimnis',
    },
    body: JSON.stringify({
      message: { message_id: 9, chat: { id: chatId }, text },
    }),
  });
}

/** Schickt eine Nachricht des Fahrgasts an den Fahrer. */
async function nachricht(auftragId, text) {
  const antwort = await fetch(`${DIENST}/api/nachricht`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ auftragId, text }),
  });
  return { status: antwort.status, koerper: await antwort.json() };
}

/** Simuliert einen beliebigen Knopfdruck ueber die Knopfdaten. */
async function knopfDaten(daten, chatId) {
  return fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-geheimnis',
    },
    body: JSON.stringify({
      callback_query: {
        id: 'cb-knopf',
        data: daten,
        message: { chat: { id: chatId }, message_id: 1 },
      },
    }),
  });
}

/** Simuliert eine Standortmeldung des Fahrers aus Telegram. */
async function standortMelden(chatId, breite, laenge, bearbeitet = false) {
  const nachricht = {
    message_id: 7,
    chat: { id: chatId },
    location: { latitude: breite, longitude: laenge, live_period: 900 },
  };
  return fetch(`${DIENST}/telegram/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-geheimnis',
    },
    body: JSON.stringify(bearbeitet ? { edited_message: nachricht } : { message: nachricht }),
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

  // Fahrt abmelden - sonst gilt Fahrer 1 im naechsten Abschnitt als unterwegs.
  // Dass er danach wirklich wieder gefragt wird, zeigt Abschnitt 2.
  await erledige(koerper.auftragId, 101);
  pruefe(
    (await aufrufe()).some(
      (a) =>
        a.methode === 'editMessageText' &&
        String(a.daten.chat_id) === '101' &&
        a.daten.text.includes('abgeschlossen'),
    ),
    'Nach dem Abmelden bekommt der Fahrer die Bestätigung',
  );
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

  await erledige(koerper.auftragId, 102);
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
  await erledige(koerper.auftragId, 102);
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

console.log('\n=== 5. Wunschfahrer: der Gewünschte wird zuerst gefragt ===');
await leeren();
{
  const { status: code, koerper } = await bestelle(
    { wunschFahrerId: 102 },
    '203.0.113.5',
  );
  pruefe(code === 201, 'Bestellung mit Wunschfahrer wird angenommen', `Code ${code}`);
  await warte(600);

  pruefe(an(await aufrufe(), '102').length === 1, 'Der Wunschfahrer wird gefragt');
  pruefe(
    an(await aufrufe(), '101').length === 0,
    'Und zwar zuerst - der andere noch nicht',
  );

  // Kann der Wunschfahrer nicht, wird normal weitergesucht. Eine Fahrt bleibt
  // nie liegen, nur weil ein bestimmter Fahrer nicht kann.
  await knopfDruck(koerper.auftragId, 102, '102', false);
  await warte(500);
  pruefe(
    an(await aufrufe(), '101').length === 1,
    'Nach der Absage wird der Nächste gefragt',
  );

  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);
  const s = await status(koerper.auftragId);
  pruefe(s.fahrer === 'Anna', 'Die Fahrt ist vergeben', JSON.stringify(s));
  pruefe(
    s.wunschVerfehlt === true,
    'Der Fahrgast erfährt, dass es ein anderer wurde',
    JSON.stringify(s),
  );

  await erledige(koerper.auftragId, 101);
}

console.log('\n=== 6. Ein Wunschfahrer, der gerade unterwegs ist ===');
await leeren();
{
  // Erst Fahrer 1 beschaeftigen ...
  const erste = await bestelle({ wunschFahrerId: 101 }, '203.0.113.7');
  await warte(600);
  await knopfDruck(erste.koerper.auftragId, 101, '101', true);
  await warte(400);
  pruefe(
    (await status(erste.koerper.auftragId)).fahrer === 'Anna',
    'Fahrer 1 ist unterwegs',
  );

  // ... und ihn dann als Wunsch angeben. Er faellt wie jeder belegte Fahrer
  // heraus, bevor der Wunsch ueberhaupt zum Zuge kommt.
  await leeren();
  const zweite = await bestelle({ wunschFahrerId: 101 }, '203.0.113.7');
  await warte(600);
  pruefe(an(await aufrufe(), '101').length === 0, 'Der Belegte wird nicht gefragt');
  pruefe(an(await aufrufe(), '102').length === 1, 'Gefragt wird, wer frei ist');

  await knopfDruck(zweite.koerper.auftragId, 102, '102', true);
  await warte(400);
  const s = await status(zweite.koerper.auftragId);
  pruefe(
    s.fahrer === 'Bekir' && s.wunschVerfehlt === true,
    'Die Fahrt läuft, der Hinweis an den Fahrgast steht',
    JSON.stringify(s),
  );

  await erledige(erste.koerper.auftragId, 101);
  await erledige(zweite.koerper.auftragId, 102);
}

console.log('\n=== 7. Ein Wunsch, den es nicht gibt, kostet nie die Fahrt ===');
await leeren();
{
  // Dieser Fall kommt vor: Die Seite stand lange offen, der gewünschte Fahrer
  // ist inzwischen ausgetragen. Daran scheiterte vorher die ganze Bestellung.
  const { status: code, koerper } = await bestelle(
    { wunschFahrerId: 999 },
    '203.0.113.6',
  );
  pruefe(code === 201, 'Die Bestellung geht trotzdem durch', `Code ${code}`);
  await warte(600);

  pruefe(an(await aufrufe(), '101').length === 1, 'Es wird normal vermittelt');
  const s = await status(koerper.auftragId);
  pruefe(
    s.wunschVerfehlt === false,
    'Kein falscher Hinweis an den Fahrgast',
    JSON.stringify(s),
  );

  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(300);
  await erledige(koerper.auftragId, 101);
}

console.log('\n=== 8. Rechnung nach der Fahrt ===');
//
// Ohne Kartendienst-Schluessel steht lokal KEIN Festpreis fest. Das ist kein
// Mangel der Probe, sondern der interessantere Fall: Ohne Preis darf keine
// Rechnung entstehen, und der Chef muss davon erfahren. Die vollstaendige
// Kette bis zum PDF prueft test/rechnung-fahrt.test.ts gegen eine echte
// Datenbank.
await leeren();
{
  const { status: code, koerper } = await bestelle(
    {
      name: 'Frau Keller',
      rechnungGewuenscht: true,
      kundeEmail: 'kundin@example.com',
    },
    '203.0.113.8',
  );
  pruefe(code === 201, 'Bestellung mit Rechnungswunsch wird angenommen', `Code ${code}`);
  await warte(600);

  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(500);

  // Die Zusage ist eine Aenderung der bestehenden Nachricht, kein neuer Text
  const zusage = (await aufrufe())
    .filter((a) => a.methode === 'editMessageText' && String(a.daten.chat_id) === '101')
    .at(-1);
  const knoepfe = (zusage?.daten.reply_markup?.inline_keyboard ?? []).flat();
  pruefe(
    knoepfe.some((k) => k.callback_data?.endsWith(':bar')) &&
      knoepfe.some((k) => k.callback_data?.endsWith(':karte')),
    'Beim Abmelden stehen „bar" und „Karte" zur Wahl',
    JSON.stringify(knoepfe.map((k) => k.callback_data)),
  );

  await leeren();
  await erledige(koerper.auftragId, 101, 'karte');
  await warte(900);

  const liste = await aufrufe();
  pruefe(
    liste.filter((a) => a.methode === 'email').length === 0,
    'Ohne Festpreis geht keine Rechnung raus',
  );

  const anChef = an(liste, '999');
  pruefe(anChef.length === 1, 'Der Chef bekommt genau eine Meldung', `${anChef.length}`);
  pruefe(
    String(anChef[0]?.daten.text).includes('kein Festpreis'),
    'Die Meldung nennt den Grund',
    String(anChef[0]?.daten.text).slice(0, 120),
  );
  pruefe(
    String(anChef[0]?.daten.text).includes('kundin@example.com'),
    'Und die Adresse, an die sie gehen soll',
  );

  // Zweimal tippen darf nicht zweimal melden
  await leeren();
  await erledige(koerper.auftragId, 101, 'karte');
  await warte(600);
  pruefe(
    an(await aufrufe(), '999').length === 0,
    'Zweimal abmelden meldet nicht zweimal',
  );
}

console.log('\n=== 9. Nachricht nach der Fahrt ===');
await leeren();
{
  // Nur die Nachricht, keine Rechnung. Lokal steht ohnehin kein Festpreis
  // fest - um so klarer trennt dieser Abschnitt die beiden Wege.
  const { status: code, koerper } = await bestelle(
    {
      name: 'Herr Vogt',
      // Nur die Adresse, kein Rechnungswunsch - die Angabe allein genuegt
      kundeEmail: 'gast@example.com',
    },
    '203.0.113.9',
  );
  pruefe(code === 201, 'Bestellung ohne Rechnung, aber mit Nachricht', `Code ${code}`);
  await warte(600);

  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);

  // Ohne Rechnungswunsch bleibt es bei EINEM Abmeldeknopf - die Zahlungsart
  // braucht nur eine Rechnung
  const zusage = (await aufrufe())
    .filter((a) => a.methode === 'editMessageText' && String(a.daten.chat_id) === '101')
    .at(-1);
  const knoepfe = (zusage?.daten.reply_markup?.inline_keyboard ?? []).flat();
  pruefe(
    knoepfe.length === 1 && knoepfe[0].callback_data?.split(':').length === 3,
    'Ohne Rechnungswunsch nur ein Abmeldeknopf',
    JSON.stringify(knoepfe.map((k) => k.callback_data)),
  );

  await leeren();
  await erledige(koerper.auftragId, 101);
  await warte(900);

  const mails = (await aufrufe()).filter((a) => a.methode === 'email');
  pruefe(mails.length === 1, 'Genau eine Nachricht geht raus', `${mails.length}`);

  const mail = mails[0]?.daten ?? {};
  pruefe(
    mail.to?.[0]?.email === 'gast@example.com',
    'An die angegebene Adresse',
    JSON.stringify(mail.to),
  );
  pruefe(
    String(mail.subject).includes('Danke'),
    'Der Betreff ist ein Dank, keine Rechnung',
    String(mail.subject),
  );
  pruefe(
    !mail.attachment,
    'Ohne Anhang – es gibt ja keine Rechnung',
  );
  pruefe(
    String(mail.textContent).includes('künftig nicht mehr'),
    'Der Hinweis auf den Widerspruch steht drin',
  );

  // Der Chef bekommt hier NICHTS: Es war keine Rechnung gewuenscht
  pruefe(
    an(await aufrufe(), '999').length === 0,
    'Keine Meldung an den Chef – es war keine Rechnung gewünscht',
  );
}

console.log('\n=== 10. Standort und Ankunftszeit ===');
await leeren();
{
  // Die Abholung liegt beim Betriebssitz; der Fahrer meldet sich ein Stueck
  // entfernt. Ohne gewaehlte Adresse gaebe es keine Koordinaten - deshalb
  // werden sie hier mitgeschickt.
  const { koerper } = await bestelle(
    {
      name: 'Frau Wagner',
      abholung: 'Steiermärker Straße 3-5, Stuttgart',
      vonPunkt: { breite: 48.8143644, laenge: 9.165389 },
    },
    '203.0.113.10',
  );
  await warte(600);
  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);

  const ohne = await status(koerper.auftragId);
  pruefe(
    ohne.ankunft === undefined,
    'Ohne Standort steht keine Ankunftszeit da',
    JSON.stringify(ohne),
  );

  // Der Fahrer teilt seinen Live-Standort: rund 2 km entfernt
  await standortMelden('101', 48.7985, 9.1744);
  await warte(300);

  const mit = await status(koerper.auftragId);
  pruefe(
    /^Ihr Fahrer ist etwa \d+ Minuten entfernt\.$/.test(mit.ankunft ?? ''),
    'Mit Standort erscheint die geschätzte Zeit',
    JSON.stringify(mit.ankunft),
  );
  pruefe(
    !JSON.stringify(mit).includes('48.79') && !JSON.stringify(mit).includes('9.17'),
    'Der Standort selbst geht NICHT nach außen',
    JSON.stringify(mit),
  );

  // Aktualisierung als bearbeitete Nachricht - naeher dran
  await standortMelden('101', 48.8125, 9.1662, true);
  await warte(300);
  const naeher = await status(koerper.auftragId);
  const minuten = (text) => Number(/(\d+)/.exec(text ?? '')?.[1] ?? 0);
  pruefe(
    minuten(naeher.ankunft) < minuten(mit.ankunft),
    'Die Aktualisierung kommt an und die Zeit sinkt',
    `${mit.ankunft} -> ${naeher.ankunft}`,
  );

  // Fahrgast einsteigen lassen: Ab hier waere eine Ankunftszeit zur
  // Abholadresse sinnlos
  await knopfDaten(`abgeholt:${koerper.auftragId}:101`, '101');
  await warte(400);
  const eingestiegen = await status(koerper.auftragId);
  pruefe(eingestiegen.abgeholt === true, 'Die Seite weiß, dass er eingestiegen ist');
  pruefe(
    eingestiegen.ankunft === undefined,
    'Danach steht keine Ankunftszeit mehr da',
    JSON.stringify(eingestiegen.ankunft),
  );

  await erledige(koerper.auftragId, 101);
  await warte(400);
  const danach = await status(koerper.auftragId);
  pruefe(danach.beendet === true, 'Nach dem Abmelden gilt die Fahrt als beendet');

  // Dass ohne laufende Fahrt gar nichts gespeichert wird, prueft
  // test/standort.test.ts gegen eine echte Datenbank - von aussen waere es
  // nicht zu sehen, und eine Pruefung, die immer besteht, ist keine.
}

console.log('\n=== 11. Nachricht an den Fahrer ===');
await leeren();
{
  const { koerper } = await bestelle({ name: 'Frau Keller' }, '203.0.113.11');
  await warte(600);

  // Vor der Zusage gibt es niemanden, an den sie gehen koennte
  const zuFrueh = await nachricht(koerper.auftragId, 'Hallo?');
  pruefe(zuFrueh.status === 409, 'Vor der Zusage geht keine Nachricht', `Code ${zuFrueh.status}`);

  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);
  await leeren();

  const gut = await nachricht(koerper.auftragId, 'Ich stehe am hinteren Ausgang');
  pruefe(gut.status === 200, 'Nach der Zusage geht sie durch', `Code ${gut.status}`);

  const beimFahrer = an(await aufrufe(), '101').at(-1)?.daten.text ?? '';
  pruefe(
    beimFahrer.includes('Ich stehe am hinteren Ausgang'),
    'Der Fahrer bekommt den Text',
    beimFahrer.slice(0, 80),
  );
  pruefe(beimFahrer.includes('Frau Keller'), 'Mit dem Namen des Fahrgasts');

  // Maskierung: Der Fahrgast darf dem Fahrer nichts unterschieben
  await leeren();
  await nachricht(koerper.auftragId, '<a href="https://beispiel">klick</a>');
  const maskiert = an(await aufrufe(), '101').at(-1)?.daten.text ?? '';
  pruefe(!maskiert.includes('<a href'), 'HTML wird maskiert', maskiert.slice(0, 80));

  const leer = await nachricht(koerper.auftragId, '   ');
  pruefe(leer.status === 400, 'Leere Nachricht wird abgewiesen', `Code ${leer.status}`);

  // Grenze je Fahrt: fuenf Stueck
  await nachricht(koerper.auftragId, 'drei');
  await nachricht(koerper.auftragId, 'vier');
  await nachricht(koerper.auftragId, 'fünf');
  // --- Der Fahrer antwortet ------------------------------------------------
  await leeren();
  await fahrerSchreibt('101', 'Bin in zwei Minuten da');
  await warte(300);

  const mitAntwort = await status(koerper.auftragId);
  const verlauf = mitAntwort.verlauf ?? [];
  pruefe(
    verlauf.some((n) => n.von === 'fahrer' && n.text === 'Bin in zwei Minuten da'),
    'Die Antwort des Fahrers steht im Verlauf',
    JSON.stringify(verlauf),
  );
  pruefe(
    verlauf.some((n) => n.von === 'fahrgast' && n.text.includes('hinteren Ausgang')),
    'Und die eigene Nachricht des Fahrgasts auch',
    JSON.stringify(verlauf),
  );
  pruefe(
    verlauf.every((n) => /^\d{2}:\d{2}$/.test(n.zeit)),
    'Jede Zeile trägt eine Uhrzeit',
    JSON.stringify(verlauf.map((n) => n.zeit)),
  );
  pruefe(
    String(an(await aufrufe(), '101').at(-1)?.daten.text).includes('sieht es'),
    'Der Fahrer bekommt eine Bestätigung',
  );

  await leeren();
  await fahrerSchreibt('101', '/start ABC123');
  await warte(300);
  const nachBefehl = await status(koerper.auftragId);
  pruefe(
    !(nachBefehl.verlauf ?? []).some((n) => n.text.includes('/start')),
    'Ein Befehl landet nicht im Verlauf',
    JSON.stringify(nachBefehl.verlauf),
  );

  // Erst zum Schluss ans Kontingent gehen - die Grenze zaehlt beide
  // Richtungen zusammen, danach waere kein Austausch mehr pruefbar
  for (let n = 0; n < 16; n++) await nachricht(koerper.auftragId, `Nummer ${n}`);
  const zuViel = await nachricht(koerper.auftragId, 'eine zu viel');
  pruefe(zuViel.status === 429, 'Irgendwann ist Schluss', `Code ${zuViel.status}`);

  await erledige(koerper.auftragId, 101);
  await warte(300);
  const danach = await nachricht(koerper.auftragId, 'Noch da?');
  pruefe(danach.status === 409, 'Nach der Fahrt geht keine mehr', `Code ${danach.status}`);

  const ohneVerlauf = await status(koerper.auftragId);
  pruefe(
    (ohneVerlauf.verlauf ?? []).length === 0,
    'Nach der Fahrt ist der Verlauf gelöscht',
    JSON.stringify(ohneVerlauf.verlauf),
  );

  await leeren();
  await fahrerSchreibt('101', 'Hallo?');
  await warte(300);
  pruefe(
    String(an(await aufrufe(), '101').at(-1)?.daten.text).includes('keine laufende Fahrt'),
    'Ohne Fahrt bekommt der Fahrer einen Hinweis',
  );
}

console.log('\n=== 12. Bewertung nach der Fahrt ===');
await leeren();
{
  const { koerper } = await bestelle({ name: 'Herr Vogt' }, '203.0.113.12');
  await warte(600);
  await knopfDruck(koerper.auftragId, 101, '101', true);
  await warte(400);

  // Vor dem Ende gibt es nichts zu bewerten
  const zuFrueh = await bewerten(koerper.auftragId, 5, 'Toll');
  const nochNicht = await status(koerper.auftragId);
  pruefe(
    nochNicht.bewertet !== true,
    'Vor dem Abmelden zählt keine Bewertung',
    JSON.stringify({ code: zuFrueh.status, bewertet: nochNicht.bewertet }),
  );

  await erledige(koerper.auftragId, 101);
  await warte(400);
  await leeren();

  const unsinn = await bewerten(koerper.auftragId, 9, '');
  pruefe(unsinn.status === 400, 'Neun Sterne gibt es nicht', `Code ${unsinn.status}`);

  const gut = await bewerten(koerper.auftragId, 2, 'Hat lange gedauert');
  pruefe(gut.status === 200, 'Nach der Fahrt geht die Bewertung durch', `Code ${gut.status}`);

  const bewertet = await status(koerper.auftragId);
  pruefe(bewertet.bewertet === true, 'Die Seite weiß, dass bewertet wurde');

  const anChef = an(await aufrufe(), '999').at(-1)?.daten.text ?? '';
  pruefe(
    anChef.includes('Schlechte Bewertung'),
    'Zwei Sterne fallen beim Chef auf',
    anChef.slice(0, 60),
  );
  pruefe(anChef.includes('Hat lange gedauert'), 'Mit dem Text des Fahrgasts');

  await leeren();
  const nochmal = await bewerten(koerper.auftragId, 5, 'Doch gut');
  pruefe(nochmal.status === 200, 'Ein zweiter Versuch ist kein Fehler', `Code ${nochmal.status}`);
  pruefe(
    an(await aufrufe(), '999').length === 0,
    'Aber er meldet den Chef nicht noch einmal',
  );
}

console.log('\n=== 13. Absicherungen ===');
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
