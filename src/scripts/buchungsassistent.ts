/**
 * Buchungsassistent.
 *
 * Fuehrt Schritt fuer Schritt durch die Anfrage und baut daraus eine fertige
 * WhatsApp-Nachricht. Es werden zu keinem Zeitpunkt Daten an einen Server
 * geschickt - alles bleibt im Browser, bis die Person selbst auf "Senden" tippt.
 */

const LETZTER_SCHRITT = 5;
const SPEICHER_SCHLUESSEL = 'myregiocar-anfrage';

type Werte = Record<string, string>;

/** sessionStorage kann im privaten Modus Fehler werfen - daher abgesichert. */
function sicherLesen(): Werte {
  try {
    const roh = sessionStorage.getItem(SPEICHER_SCHLUESSEL);
    return roh ? (JSON.parse(roh) as Werte) : {};
  } catch {
    return {};
  }
}

function sicherSchreiben(werte: Werte): void {
  try {
    sessionStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(werte));
  } catch {
    /* Kein Speicher verfuegbar - der Assistent funktioniert trotzdem. */
  }
}

function alsDatum(datum: string): string {
  if (!datum) return '';
  const d = new Date(`${datum}T00:00:00`);
  if (Number.isNaN(d.getTime())) return datum;
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function zweistellig(zahl: number): string {
  return String(zahl).padStart(2, '0');
}

function heuteIso(versatzTage = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
}

export function assistentStarten(): void {
  document
    .querySelectorAll<HTMLElement>('[data-assistent]')
    .forEach(einrichten);
}

function einrichten(wurzel: HTMLElement): void {
  const formular = wurzel.querySelector<HTMLFormElement>('[data-formular]');
  if (!formular) return;

  const nummer = wurzel.dataset.whatsapp ?? '';
  const marke = wurzel.dataset.marke ?? 'MyRegioCar';
  const vorauswahl = wurzel.dataset.vorauswahl ?? '';

  const felder = Array.from(
    wurzel.querySelectorAll<HTMLFieldSetElement>('[data-schritt]'),
  );
  const knopfWeiter = wurzel.querySelector<HTMLButtonElement>('[data-weiter]');
  const knopfZurueck = wurzel.querySelector<HTMLButtonElement>('[data-zurueck]');
  const knopfSenden = wurzel.querySelector<HTMLAnchorElement>('[data-senden]');
  const linkMail = wurzel.querySelector<HTMLAnchorElement>('[data-mailto]');
  const alternativen = wurzel.querySelector<HTMLElement>('[data-alternativen]');
  const fehlerFeld = wurzel.querySelector<HTMLElement>('[data-fehler]');
  const vorschau = wurzel.querySelector<HTMLElement>('[data-vorschau]');
  const ansage = wurzel.querySelector<HTMLElement>('[data-ansage]');

  let schritt = 1;

  /* ---------------------------------------------------------------- Werte */

  function werteLesen(): Werte {
    const daten = new FormData(formular!);
    const werte: Werte = {};
    for (const [name, wert] of daten.entries()) {
      if (typeof wert === 'string') werte[name] = wert.trim();
    }
    // Nicht angehakte Kontrollkaestchen tauchen in FormData nicht auf
    formular!
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((kasten) => {
        werte[kasten.name] = kasten.checked ? 'ja' : 'nein';
      });
    return werte;
  }

  function werteSetzen(werte: Werte): void {
    Object.entries(werte).forEach(([name, wert]) => {
      const eingabe = formular!.elements.namedItem(name);
      if (!eingabe) return;

      if (eingabe instanceof RadioNodeList) {
        eingabe.forEach((element) => {
          if (element instanceof HTMLInputElement && element.type === 'radio') {
            element.checked = element.value === wert;
          }
        });
      } else if (eingabe instanceof HTMLInputElement) {
        if (eingabe.type === 'checkbox') eingabe.checked = wert === 'ja';
        else eingabe.value = wert;
      } else if (eingabe instanceof HTMLTextAreaElement) {
        eingabe.value = wert;
      }
    });
  }

  /* --------------------------------------------------- Sichtbarkeit je Art */

  function artAktualisieren(): void {
    const art = werteLesen().art ?? '';

    wurzel.querySelectorAll<HTMLElement>('[data-nur-art]').forEach((element) => {
      element.hidden = element.dataset.nurArt !== art;
    });
    wurzel.querySelectorAll<HTMLElement>('[data-ohne-art]').forEach((element) => {
      element.hidden = element.dataset.ohneArt === art;
    });
  }

  /* ------------------------------------------------------------ Pruefungen */

  function pflichtfeld(name: string): HTMLInputElement | null {
    const element = formular!.elements.namedItem(name);
    return element instanceof HTMLInputElement ? element : null;
  }

  /** Gibt eine Fehlermeldung zurueck oder null, wenn alles passt. */
  function pruefen(nummerSchritt: number): string | null {
    const werte = werteLesen();
    const istParken = werte.art === 'Park & Fly';

    const fehlt = (name: string, meldung: string): string | null => {
      if (!werte[name]) {
        const feld = pflichtfeld(name);
        if (feld) {
          feld.setAttribute('aria-invalid', 'true');
          feld.focus();
        }
        return meldung;
      }
      pflichtfeld(name)?.removeAttribute('aria-invalid');
      return null;
    };

    switch (nummerSchritt) {
      case 1:
        return werte.art ? null : 'Bitte wählen Sie zuerst einen Anlass aus.';

      case 2:
        if (istParken)
          return fehlt(
            'kennzeichen',
            'Bitte geben Sie das Kennzeichen Ihres Fahrzeugs an.',
          );
        return (
          fehlt('von', 'Bitte geben Sie an, wo wir Sie abholen sollen.') ??
          fehlt('nach', 'Bitte geben Sie das Ziel Ihrer Fahrt an.')
        );

      case 3: {
        const grund =
          fehlt('datum', 'Bitte wählen Sie ein Datum aus.') ??
          fehlt('zeit', 'Bitte wählen Sie eine Uhrzeit aus.');
        if (grund) return grund;
        if (istParken)
          return fehlt(
            'rueckkehr',
            'Bitte geben Sie an, wann Sie voraussichtlich zurückkommen.',
          );
        return null;
      }

      case 4:
        return null;

      case 5:
        return fehlt('name', 'Bitte nennen Sie uns noch Ihren Namen.');

      default:
        return null;
    }
  }

  function fehlerZeigen(text: string | null): void {
    if (!fehlerFeld) return;
    fehlerFeld.textContent = text ?? '';
    fehlerFeld.classList.toggle('hidden', !text);
    fehlerFeld.classList.toggle('flex', Boolean(text));
  }

  /* -------------------------------------------------------- Nachrichtentext */

  function nachrichtBauen(): string {
    const w = werteLesen();
    const istParken = w.art === 'Park & Fly';
    const zeilen: string[] = [];

    zeilen.push(
      istParken
        ? `Neue Park-&-Fly-Anfrage über die Website von ${marke}`
        : `Neue Fahrtanfrage über die Website von ${marke}`,
    );
    zeilen.push('');

    if (!istParken) {
      zeilen.push(`Anlass: ${w.art || '-'}`);
      if (w.von) zeilen.push(`Abholung: ${w.von}`);
      if (w.nach) zeilen.push(`Ziel: ${w.nach}`);
      if (w.rueckfahrt === 'ja') zeilen.push('Rückfahrt: ja, bitte einplanen');
      if (w.datum) zeilen.push(`Termin: ${alsDatum(w.datum)}${w.zeit ? ` um ${w.zeit} Uhr` : ''}`);
      if (w.flugnummer) zeilen.push(`Flugnummer: ${w.flugnummer}`);
    } else {
      if (w.kennzeichen) zeilen.push(`Kennzeichen: ${w.kennzeichen}`);
      if (w.fahrzeug) zeilen.push(`Fahrzeug: ${w.fahrzeug}`);
      if (w.datum)
        zeilen.push(
          `Auto abstellen: ${alsDatum(w.datum)}${w.zeit ? ` um ${w.zeit} Uhr` : ''}`,
        );
      if (w.rueckkehr)
        zeilen.push(
          `Rückkehr: ${alsDatum(w.rueckkehr)}${w.rueckzeit ? ` um ${w.rueckzeit} Uhr` : ''}`,
        );
      zeilen.push(
        `Shuttle zum Terminal: ${w.shuttle === 'ja' ? 'ja, bitte' : 'nein, danke'}`,
      );
    }

    if (w.personen) zeilen.push(`Personen: ${w.personen}`);
    if (w.gepaeck && w.gepaeck !== '0') zeilen.push(`Gepäckstücke: ${w.gepaeck}`);
    if (w.kindersitze && w.kindersitze !== '0')
      zeilen.push(`Kindersitze: ${w.kindersitze}`);
    if (w.anmerkung) zeilen.push(`Anmerkung: ${w.anmerkung}`);

    zeilen.push('');
    zeilen.push(`Mein Name: ${w.name || '(bitte noch ergänzen)'}`);

    return zeilen.join('\n');
  }

  function linksAktualisieren(): void {
    const text = nachrichtBauen();
    if (vorschau) vorschau.textContent = text;
    if (knopfSenden)
      knopfSenden.href = `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
    if (linkMail) {
      const betreff = encodeURIComponent(`Fahrtanfrage über die Website`);
      linkMail.href = `${linkMail.href.split('?')[0]}?subject=${betreff}&body=${encodeURIComponent(text)}`;
    }
  }

  /* ------------------------------------------------------------- Anzeigen */

  function schrittZeigen(neuer: number, fokussieren = true): void {
    schritt = Math.min(Math.max(neuer, 1), LETZTER_SCHRITT);
    artAktualisieren();

    felder.forEach((feld) => {
      feld.hidden = Number(feld.dataset.schritt) !== schritt;
    });

    // Fortschrittsbalken
    wurzel.querySelectorAll<HTMLElement>('[data-fortschritt]').forEach((balken) => {
      const index = Number(balken.dataset.fortschritt);
      balken.classList.toggle('erledigt', index < schritt);
      balken.classList.toggle('aktiv', index === schritt);
    });
    wurzel
      .querySelectorAll<HTMLElement>('[data-fortschritt-text]')
      .forEach((text) => {
        text.classList.toggle(
          'aktiv',
          Number(text.dataset.fortschrittText) === schritt,
        );
      });

    const amEnde = schritt === LETZTER_SCHRITT;
    if (knopfZurueck) knopfZurueck.hidden = schritt === 1;
    if (knopfWeiter) knopfWeiter.hidden = amEnde;
    if (knopfSenden) knopfSenden.hidden = !amEnde;
    if (alternativen) alternativen.classList.toggle('hidden', !amEnde);

    fehlerZeigen(null);
    linksAktualisieren();

    if (ansage) ansage.textContent = `Schritt ${schritt} von ${LETZTER_SCHRITT}`;

    if (fokussieren) {
      const ueberschrift = felder
        .find((feld) => Number(feld.dataset.schritt) === schritt)
        ?.querySelector<HTMLElement>('legend');
      ueberschrift?.focus();
    }
  }

  /* ---------------------------------------------------------------- Zähler */

  wurzel.querySelectorAll<HTMLElement>('[data-zaehler]').forEach((zaehler) => {
    const anzeige = zaehler.querySelector<HTMLOutputElement>('[data-wert]');
    const versteckt = zaehler.querySelector<HTMLInputElement>('input[type="hidden"]');
    const minus = zaehler.querySelector<HTMLButtonElement>('[data-minus]');
    const plus = zaehler.querySelector<HTMLButtonElement>('[data-plus]');
    const min = Number(zaehler.dataset.min ?? 0);
    const max = Number(zaehler.dataset.max ?? 9);

    const setzen = (wert: number) => {
      const begrenzt = Math.min(Math.max(wert, min), max);
      if (anzeige) anzeige.textContent = String(begrenzt);
      if (versteckt) versteckt.value = String(begrenzt);
      if (minus) minus.disabled = begrenzt <= min;
      if (plus) plus.disabled = begrenzt >= max;
      speichern();
    };

    minus?.addEventListener('click', () =>
      setzen(Number(versteckt?.value ?? min) - 1),
    );
    plus?.addEventListener('click', () =>
      setzen(Number(versteckt?.value ?? min) + 1),
    );

    setzen(Number(versteckt?.value ?? min));
  });

  /* ----------------------------------------------------------- Schnellwahl */

  wurzel.querySelectorAll<HTMLButtonElement>('[data-schnellwahl]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const datum = pflichtfeld('datum');
      const zeit = pflichtfeld('zeit');
      if (!datum || !zeit) return;

      const art = chip.dataset.schnellwahl;
      if (art === 'jetzt') {
        const gleich = new Date(Date.now() + 45 * 60 * 1000);
        gleich.setMinutes(Math.ceil(gleich.getMinutes() / 5) * 5, 0, 0);
        datum.value = heuteIso();
        zeit.value = `${zweistellig(gleich.getHours())}:${zweistellig(gleich.getMinutes())}`;
      } else if (art === 'heute-abend') {
        datum.value = heuteIso();
        zeit.value = '18:00';
      } else if (art === 'morgen-frueh') {
        datum.value = heuteIso(1);
        zeit.value = '06:00';
      }

      wurzel
        .querySelectorAll<HTMLButtonElement>('[data-schnellwahl]')
        .forEach((anderer) =>
          anderer.setAttribute('aria-pressed', String(anderer === chip)),
        );

      datum.removeAttribute('aria-invalid');
      zeit.removeAttribute('aria-invalid');
      speichern();
    });
  });

  /* ------------------------------------------------------------- Speichern */

  function speichern(): void {
    sicherSchreiben(werteLesen());
    linksAktualisieren();
  }

  formular.addEventListener('input', () => {
    fehlerZeigen(null);
    speichern();
  });

  formular.addEventListener('change', (ereignis) => {
    const ziel = ereignis.target;
    if (ziel instanceof HTMLInputElement && ziel.name === 'art') {
      artAktualisieren();
    }
    speichern();
  });

  // Absenden per Enter-Taste soll den Assistenten weiterschalten,
  // nicht die Seite neu laden.
  formular.addEventListener('submit', (ereignis) => {
    ereignis.preventDefault();
    knopfWeiter?.click();
  });

  /* -------------------------------------------------------------- Bedienung */

  knopfWeiter?.addEventListener('click', () => {
    const problem = pruefen(schritt);
    if (problem) {
      fehlerZeigen(problem);
      return;
    }
    schrittZeigen(schritt + 1);
  });

  knopfZurueck?.addEventListener('click', () => schrittZeigen(schritt - 1));

  knopfSenden?.addEventListener('click', (ereignis) => {
    const problem = pruefen(LETZTER_SCHRITT);
    if (problem) {
      ereignis.preventDefault();
      fehlerZeigen(problem);
      return;
    }
    // Nach dem Absenden nichts Persoenliches im Browser zurueckhalten
    try {
      sessionStorage.removeItem(SPEICHER_SCHLUESSEL);
    } catch {
      /* egal */
    }
  });

  /* ------------------------------------------------------------------ Start */

  // Kein Datum in der Vergangenheit anbieten
  ['datum', 'rueckkehr'].forEach((name) => {
    pflichtfeld(name)?.setAttribute('min', heuteIso());
  });

  const gespeichert = sicherLesen();
  if (Object.keys(gespeichert).length > 0) werteSetzen(gespeichert);
  if (vorauswahl && !gespeichert.art) werteSetzen({ art: vorauswahl });

  schrittZeigen(1, false);
}
