/**
 * Gemeinsamer Rahmen fuer Fahrerbereich und Rechnungen.
 */

export function sicher(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function html(inhalt: string, status: number): Response {
  return new Response(inhalt, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      // Kundendaten und Handynummern gehoeren in keinen Zwischenspeicher
      'cache-control': 'private, no-store',
    },
  });
}

export function seite(
  inhalt: string,
  { titel = 'Fahrerbereich', stil = '' }: { titel?: string; stil?: string } = {},
): string {
  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${sicher(titel)} – MyRegioCar</title>
<!-- Zum Startbildschirm hinzufuegen: oeffnet dann ohne Browserleiste -->
<link rel="manifest" href="/fahrer/app.webmanifest">
<link rel="apple-touch-icon" href="/fahrer/app-symbol-180.png">
<meta name="theme-color" content="#05070a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Rechnungen">
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:1.5rem; background:#05070a; color:#e8edf3;
         font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif }
  .kopf { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap }
  h1 { font-size:1.6rem; margin:0 0 1rem }
  h2 { font-size:1.1rem; margin:2.5rem 0 .5rem; color:#fff }
  a { color:#45c6f5 }
  table { width:100%; border-collapse:collapse; margin-top:.75rem }
  th { text-align:left; font-size:.8rem; text-transform:uppercase;
       letter-spacing:.08em; color:#6b7887; padding:.4rem .5rem }
  td { padding:.5rem; border-top:1px solid rgba(255,255,255,.08); vertical-align:middle }
  .zeile { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center }
  input,select,textarea { min-height:2.75rem; padding:.5rem .7rem; border-radius:.6rem;
       border:1px solid rgba(255,255,255,.14); background:#0a0e14; color:#fff; font-size:16px;
       font-family:inherit; box-sizing:border-box }
  button,.knopf { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box;
       min-height:2.75rem; padding:0 1rem; border-radius:.6rem; border:1px solid rgba(255,255,255,.18);
       background:rgba(255,255,255,.05); color:#fff; font-weight:600; cursor:pointer; font-size:15px;
       text-decoration:none }
  button.cyan,.knopf.cyan { background:#22b8f0; color:#05070a; border-color:#22b8f0 }
  button.rot { border-color:rgba(248,113,113,.4); color:#fca5a5 }
  button:disabled { opacity:.6 }
  .haken { display:flex; align-items:center; gap:.35rem; white-space:nowrap }
  .haken input { min-height:auto; width:1.1rem; height:1.1rem; accent-color:#22b8f0 }
  .ja { color:#4ade80 } .nein { color:#fca5a5 } .warte { color:#fbbf24 }
  .klein { font-size:.82rem; color:#8d9aab; word-break:break-all }
  .hinweis { color:#8d9aab; font-size:.9rem; max-width:60ch }
  .fehler { color:#fca5a5 }
  ${stil}
</style></head>
<body>${inhalt}</body></html>`;
}
