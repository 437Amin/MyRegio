/**
 * Tut so, als waere sie die Telegram-Schnittstelle.
 * Schreibt alle Aufrufe mit, damit der Test pruefen kann, wer was bekommen hat.
 */
import http from 'node:http';

const aufrufe = [];
let naechsteNachrichtId = 1000;

http
  .createServer((anfrage, antwort) => {
    if (anfrage.url === '/__aufrufe') {
      antwort.writeHead(200, { 'content-type': 'application/json' });
      antwort.end(JSON.stringify(aufrufe));
      return;
    }
    if (anfrage.url === '/__leeren') {
      aufrufe.length = 0;
      antwort.end('ok');
      return;
    }

    let koerper = '';
    anfrage.on('data', (teil) => (koerper += teil));
    anfrage.on('end', () => {
      const methode = anfrage.url.split('/').pop();
      let daten = {};
      try {
        daten = JSON.parse(koerper || '{}');
      } catch {}
      aufrufe.push({ methode, daten });

      antwort.writeHead(200, { 'content-type': 'application/json' });
      antwort.end(
        JSON.stringify({ ok: true, result: { message_id: naechsteNachrichtId++ } }),
      );
    });
  })
  .listen(8799, '127.0.0.1', () => console.log('Telegram-Attrappe auf 8799'));
