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
  const knopfVermitteln = wurzel.querySelector<HTMLButtonElement>('[data-vermitteln]');
  const statusFeld = wurzel.querySelector<HTMLElement>('[data-status]');
  const preisFeld = wurzel.querySelector<HTMLElement>('[data-preisfeld]');
  const fortschritt = wurzel.querySelector<HTMLElement>('ol');
  const vermittlungBasis = (wurzel.dataset.vermittlung ?? '').replace(/\/$/, '');
  const linkMail = wurzel.querySelector<HTMLAnchorElement>('[data-mailto]');
  const alternativen = wurzel.querySelector<HTMLElement>('[data-alternativen]');
  const fehlerFeld = wurzel.querySelector<HTMLElement>('[data-fehler]');
  const vorschau = wurzel.querySelector<HTMLElement>('[data-vorschau]');
  const ansage = wurzel.querySelector<HTMLElement>('[data-ansage]');

  let schritt = 1;
  let statusTimer: number | undefined;
  /** Merkt sich, für welche Strecke der Preis schon geholt wurde */
  let preisSchluessel = '';
  /** Zuletzt angezeigter Betrag - wandert in die WhatsApp-Nachricht */
  let angezeigterPreis = '';

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

  /**
   * Dieselbe lockere Regel wie im Vermittlungsdienst (auftrag-erfassen.ts).
   *
   * Sie faengt die Tippfehler, an denen eine Mail wirklich scheitert, und
   * weist keine ungewoehnliche Adresse ab. Maßgeblich bleibt der Server -
   * hier geht es nur darum, den Fehler zu zeigen, solange der Fahrgast noch
   * davorsitzt.
   */
  function emailPlausibel(wert: string): boolean {
    const text = wert.trim();
    if (text.length < 6 || text.length > 254 || /\s/.test(text)) return false;

    const teile = text.split('@');
    if (teile.length !== 2) return false;

    const [davor, danach] = teile;
    if (!davor || davor.length > 64 || !danach) return false;
    if (danach.includes('..') || danach.startsWith('.') || danach.endsWith('.')) {
      return false;
    }

    const punkt = danach.lastIndexOf('.');
    return punkt >= 1 && danach.length - punkt - 1 >= 2;
  }

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

      case 4: {
        // Der Assistent prueft jeden Schritt selbst - das "required" des
        // Browsers greift hier nicht, weil die Schritte Teile EINES Formulars
        // sind und nie einzeln abgeschickt werden.
        const adresse = (werte.kundeEmail ?? '').trim();

        if (werte.rechnungGewuenscht === 'ja' && !adresse) {
          return fehlt(
            'kundeEmail',
            'Für die Rechnung brauchen wir Ihre E-Mail-Adresse.',
          );
        }

        // Auch ohne Rechnung lohnt die Pruefung: Eine vertippte Adresse faellt
        // sonst erst auf, wenn die Nachricht nicht ankommt - und dann merkt es
        // niemand.
        if (adresse && !emailPlausibel(adresse)) {
          const feld = pflichtfeld('kundeEmail');
          feld?.setAttribute('aria-invalid', 'true');
          feld?.focus();
          return 'Diese E-Mail-Adresse sieht nicht richtig aus – bitte prüfen.';
        }

        pflichtfeld('kundeEmail')?.removeAttribute('aria-invalid');
        return null;
      }

      case 5: {
        const grund = fehlt('name', 'Bitte nennen Sie uns noch Ihren Namen.');
        if (grund) return grund;

        // Ohne Rufnummer kann der Fahrer den Fahrgast nicht erreichen.
        // Beim WhatsApp-Weg ist sie entbehrlich - dort schreibt man ja schon.
        if (direktMoeglich()) {
          const nurZiffern = (werte.telefon ?? '').replace(/[^0-9]/g, '');
          if (nurZiffern.length < 7) {
            const feld = pflichtfeld('telefon');
            feld?.setAttribute('aria-invalid', 'true');
            feld?.focus();
            return 'Bitte geben Sie eine Telefonnummer an, unter der der Fahrer Sie erreicht.';
          }
          pflichtfeld('telefon')?.removeAttribute('aria-invalid');
        }
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Direkt vermitteln geht nur, wenn der Dienst eingerichtet ist und es sich
   * um eine Fahrt handelt. Einen Stellplatz kann man keinem Fahrer zuteilen.
   */
  function direktMoeglich(): boolean {
    if (!vermittlungBasis) return false;
    return werteLesen().art !== 'Park & Fly';
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
    if (angezeigterPreis) {
      zeilen.push(`Angezeigter Festpreis: ${angezeigterPreis}`);
    }

    zeilen.push('');
    zeilen.push(`Mein Name: ${w.name || '(bitte noch ergänzen)'}`);
    if (w.telefon) zeilen.push(`Meine Telefonnummer: ${w.telefon}`);

    // Auch ueber WhatsApp muss die Adresse ankommen. Sonst traegt jemand sie
    // ein, bestellt dann aber ueber WhatsApp - und niemand erfaehrt davon.
    // Automatisch laeuft es nur bei einer Bestellung ueber die Vermittlung.
    if (w.kundeEmail) {
      zeilen.push(`Meine E-Mail-Adresse: ${w.kundeEmail}`);
      if (w.rechnungGewuenscht === 'ja') {
        zeilen.push('Bitte Rechnung an diese Adresse');
      }
    }

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

  /* --------------------------------------------------- Adressvorschläge */

  /**
   * Macht aus einem Textfeld eine Auswahlliste.
   *
   * Wichtig für den Festpreis: Erst wenn der Fahrgast einen Vorschlag antippt,
   * kennen wir die genauen Koordinaten. Aus freiem Text lässt sich kein
   * verlässlicher Preis ableiten - "Hamburg Hauptbahnhof" fände der
   * Kartendienst sonst als irgendetwas Ähnliches in der Nähe.
   */
  function vorschlagfeldEinrichten(name: 'von' | 'nach'): void {
    const huelle = wurzel.querySelector<HTMLElement>(
      `[data-vorschlagfeld="${name}"]`,
    );
    if (!huelle || !vermittlungBasis) return;

    const eingabe = huelle.querySelector<HTMLInputElement>('input[type="text"]');
    const liste = huelle.querySelector<HTMLUListElement>('.vorschlaege');
    const breite = pflichtfeld(`${name}Breite`);
    const laenge = pflichtfeld(`${name}Laenge`);
    if (!eingabe || !liste || !breite || !laenge) return;

    let warteZeiger: number | undefined;
    let markiert = -1;

    const schliessen = () => {
      liste.hidden = true;
      liste.replaceChildren();
      eingabe.setAttribute('aria-expanded', 'false');
      markiert = -1;
    };

    const uebernehmen = (text: string, b: string, l: string) => {
      eingabe.value = text;
      breite.value = b;
      laenge.value = l;
      schliessen();
      speichern();
      // Adresse steht fest - jetzt lohnt sich der Preis
      preisSchluessel = '';
      void preisHolen();
    };

    const markiereEintrag = (richtung: number) => {
      const eintraege = Array.from(liste.querySelectorAll('li'));
      if (eintraege.length === 0) return;
      markiert = (markiert + richtung + eintraege.length) % eintraege.length;
      eintraege.forEach((eintrag, i) =>
        eintrag.setAttribute('aria-selected', String(i === markiert)),
      );
      eintraege[markiert]?.scrollIntoView({ block: 'nearest' });
    };

    eingabe.addEventListener('input', () => {
      // Getippt heißt: Die zuletzt gewählte Adresse gilt nicht mehr
      breite.value = '';
      laenge.value = '';

      if (warteZeiger) window.clearTimeout(warteZeiger);
      const gesuch = eingabe.value.trim();
      if (gesuch.length < 3) {
        schliessen();
        return;
      }

      warteZeiger = window.setTimeout(async () => {
        try {
          const antwort = await fetch(
            `${vermittlungBasis}/api/adressen?q=${encodeURIComponent(gesuch)}`,
          );
          const daten = (await antwort.json()) as {
            vorschlaege?: { text: string; breite: number; laenge: number }[];
          };
          const treffer = daten.vorschlaege ?? [];

          if (treffer.length === 0 || eingabe.value.trim() !== gesuch) {
            schliessen();
            return;
          }

          liste.replaceChildren(
            ...treffer.map((eintrag) => {
              const zeile = document.createElement('li');
              zeile.textContent = eintrag.text;
              zeile.setAttribute('role', 'option');
              zeile.setAttribute('aria-selected', 'false');
              zeile.addEventListener('mousedown', (ereignis) => {
                // mousedown statt click: Sonst schließt der Fokusverlust die
                // Liste, bevor der Klick ankommt.
                ereignis.preventDefault();
                uebernehmen(
                  eintrag.text,
                  String(eintrag.breite),
                  String(eintrag.laenge),
                );
              });
              return zeile;
            }),
          );
          liste.hidden = false;
          eingabe.setAttribute('aria-expanded', 'true');
          markiert = -1;
        } catch {
          schliessen();
        }
      }, 300);
    });

    eingabe.addEventListener('keydown', (ereignis) => {
      if (liste.hidden) return;
      if (ereignis.key === 'ArrowDown') {
        ereignis.preventDefault();
        markiereEintrag(1);
      } else if (ereignis.key === 'ArrowUp') {
        ereignis.preventDefault();
        markiereEintrag(-1);
      } else if (ereignis.key === 'Enter' && markiert >= 0) {
        ereignis.preventDefault();
        liste.querySelectorAll('li')[markiert]?.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
        );
      } else if (ereignis.key === 'Escape') {
        schliessen();
      }
    });

    eingabe.addEventListener('blur', () => window.setTimeout(schliessen, 120));
  }

  /* ------------------------------------------------------------- Festpreis */

  function preisAnzeige(art: 'laedt' | 'fertig' | 'anfrage' | 'aus'): void {
    if (!preisFeld) return;
    preisFeld.hidden = art === 'aus';
    (['laedt', 'fertig', 'anfrage'] as const).forEach((name) => {
      const teil = preisFeld.querySelector<HTMLElement>(`[data-preis-${name}]`);
      if (teil) teil.hidden = name !== art;
    });
  }

  /**
   * Holt den Festpreis für die eingegebene Strecke.
   *
   * Gerechnet wird auf dem Server. Kommt kein Preis zurück - etwa weil eine
   * Adresse nicht eindeutig ist - zeigen wir "auf Anfrage", statt zu raten.
   * Ein angezeigter Festpreis wäre bindend.
   */
  async function preisHolen(): Promise<void> {
    if (!preisFeld || !vermittlungBasis) return;

    const w = werteLesen();
    if (!direktMoeglich() || !w.von || !w.nach) {
      preisAnzeige('aus');
      preisSchluessel = '';
      angezeigterPreis = '';
      return;
    }

    // Ohne ausgewählte Punkte gibt es keinen verlässlichen Preis
    if (!w.vonBreite || !w.nachBreite) {
      preisAnzeige('anfrage');
      angezeigterPreis = '';
      preisSchluessel = '';
      return;
    }

    const schluessel = `${w.vonBreite},${w.vonLaenge}|${w.nachBreite},${w.nachLaenge}`;
    if (schluessel === preisSchluessel) return;
    preisSchluessel = schluessel;

    preisAnzeige('laedt');

    try {
      const antwort = await fetch(`${vermittlungBasis}/api/preis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vonPunkt: {
            breite: Number(w.vonBreite),
            laenge: Number(w.vonLaenge),
            bezeichnung: w.von,
          },
          nachPunkt: {
            breite: Number(w.nachBreite),
            laenge: Number(w.nachLaenge),
            bezeichnung: w.nach,
          },
        }),
      });
      const daten = (await antwort.json()) as {
        preis?: number;
        streckeKm?: number;
        dauerMinuten?: number;
        vonErkannt?: string;
        nachErkannt?: string;
      };

      if (!antwort.ok || typeof daten.preis !== 'number') {
        angezeigterPreis = '';
        preisAnzeige('anfrage');
        linksAktualisieren();
        return;
      }

      const betrag = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(daten.preis);
      angezeigterPreis = betrag;

      const setze = (name: string, wert: string) => {
        const feld = preisFeld.querySelector<HTMLElement>(`[data-preis-${name}]`);
        if (feld) feld.textContent = wert;
      };
      setze('betrag', betrag);
      setze('km', String(daten.streckeKm ?? '–').replace('.', ','));
      setze('dauer', String(daten.dauerMinuten ?? '–'));
      setze('von', daten.vonErkannt ?? w.von);
      setze('nach', daten.nachErkannt ?? w.nach);

      preisAnzeige('fertig');
      linksAktualisieren();
    } catch {
      // Netz weg oder Dienst nicht erreichbar - lieber kein Preis
      angezeigterPreis = '';
      preisAnzeige('anfrage');
      linksAktualisieren();
    }
  }

  /* ---------------------------------------------------- Direkte Vermittlung */

  type StatusArt = 'suche' | 'gefunden' | 'keiner' | 'fehler';

  /**
   * Holt die Fahrer zur Auswahl.
   *
   * Der Block bleibt verborgen, bis wirklich jemand zur Auswahl steht - eine
   * leere Liste oder ein stehengebliebenes "wird geladen" waere schlechter
   * als gar kein Feld. Ohne Vermittlungsdienst passiert hier nichts.
   */
  async function fahrerladen(): Promise<void> {
    const block = wurzel.querySelector<HTMLElement>('[data-wunschfahrer]');
    const auswahl = block?.querySelector<HTMLSelectElement>('select');
    if (!block || !auswahl || !vermittlungBasis) return;

    try {
      const antwort = await fetch(`${vermittlungBasis}/api/fahrer`);
      if (!antwort.ok) return;

      const { fahrer = [] } = (await antwort.json()) as {
        fahrer?: { id: number; name: string }[];
      };
      // Ohne angemeldeten Fahrer bleibt der Block verborgen - eine leere
      // Liste waere schlechter als gar kein Feld. Ab einem Fahrer erscheint
      // sie: Entscheidung des Auftraggebers vom 14.10.2026. Bei nur einem zur
      // Auswahl ist das eher eine Vorstellung als eine Wahl - aber "Egal"
      // steht voreingestellt da, es kostet also niemanden einen Handgriff.
      if (fahrer.length === 0) return;

      for (const eintrag of fahrer) {
        const auswahlfeld = document.createElement('option');
        auswahlfeld.value = String(eintrag.id);
        auswahlfeld.textContent = eintrag.name;
        auswahl.append(auswahlfeld);
      }

      // Erst jetzt sichtbar machen - und einen gespeicherten Stand nachtragen
      block.hidden = false;
      const gespeichert = sicherLesen();
      if (gespeichert.wunschFahrerId) auswahl.value = gespeichert.wunschFahrerId;
    } catch {
      // Ohne Liste bestellt man eben ohne Wunschfahrer
    }
  }

  /**
   * Das Adressfeld erscheint erst, wenn eine Rechnung gewuenscht ist.
   *
   * Ohne JavaScript bleibt es sichtbar: ein Feld zu viel, aber nichts kaputt.
   * Das Feld ist absichtlich nicht "required" - sonst blockierte ein leeres
   * Feld das Absenden, obwohl der Haken gar nicht gesetzt ist.
   */
  /**
   * Das Adressfeld steht immer da und ist freiwillig.
   *
   * Pflicht wird es nur, wenn jemand eine Rechnung ankreuzt - ohne Adresse
   * koennte sie nirgends hingehen. Ansonsten bleibt es leer und es passiert
   * nichts.
   */
  function rechnungsfeldEinrichten(): void {
    const haken = wurzel.querySelector<HTMLInputElement>('[data-rechnung-haken]');
    const adresse = wurzel.querySelector<HTMLElement>('[data-rechnung-adresse]');
    const feld = adresse?.querySelector<HTMLInputElement>('input');
    const vermerk = adresse?.querySelector<HTMLElement>('[data-email-optional]');
    if (!haken || !feld) return;

    const umschalten = (): void => {
      feld.required = haken.checked;
      // "optional" darf nicht stehen bleiben, wenn die Adresse gebraucht wird
      if (vermerk) vermerk.hidden = haken.checked;
      if (!haken.checked) feld.removeAttribute('aria-invalid');
    };

    haken.addEventListener('change', () => {
      umschalten();
      if (haken.checked && !feld.value) feld.focus();
    });
    umschalten();
  }

  /** Blendet das Formular aus und zeigt stattdessen den Stand der Suche. */
  function zeigeStatus(art: StatusArt): void {
    if (!statusFeld) return;

    formular!.hidden = true;
    if (fortschritt) fortschritt.hidden = true;
    statusFeld.hidden = false;

    (['suche', 'gefunden', 'keiner', 'fehler'] as StatusArt[]).forEach((name) => {
      const teil = statusFeld.querySelector<HTMLElement>(`[data-status-${name}]`);
      if (teil) teil.hidden = name !== art;
    });

    if (ansage) {
      const texte: Record<StatusArt, string> = {
        suche: 'Ein Fahrer wird gesucht.',
        gefunden: 'Ein Fahrer übernimmt Ihre Fahrt.',
        keiner: 'Zurzeit ist kein Fahrer frei.',
        fehler: 'Die Anfrage konnte nicht übermittelt werden.',
      };
      ansage.textContent = texte[art];
    }

    statusFeld.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function zurueckZumFormular(): void {
    if (statusTimer) window.clearTimeout(statusTimer);
    if (statusFeld) statusFeld.hidden = true;
    formular!.hidden = false;
    if (fortschritt) fortschritt.hidden = false;
  }

  /**
   * Fragt in Abstaenden nach, wie es um die Fahrt steht.
   *
   * Nach der Zusage wird WEITER gefragt, nur langsamer: Die Ankunftszeit
   * entsteht erst, wenn der Fahrer seinen Standort teilt - meist ein paar
   * Sekunden spaeter. Wer hier aufhoert, zeigt sie nie an.
   */
  function beobachte(auftragId: string): void {
    // Bis jemand zusagt. Nach der Zusage laeuft die Frist weiter, siehe unten.
    let schluss = Date.now() + 5 * 60 * 1000;
    let vergeben = false;

    const nachfragen = async (): Promise<void> => {
      if (Date.now() > schluss) {
        // Nach einer Zusage ist "keiner" die falsche Meldung - dann hoeren
        // wir einfach auf, und es bleibt stehen, was zuletzt zu sehen war.
        if (!vergeben) zeigeStatus('keiner');
        return;
      }

      try {
        const antwort = await fetch(
          `${vermittlungBasis}/api/status/${encodeURIComponent(auftragId)}`,
        );
        if (antwort.ok) {
          const stand = (await antwort.json()) as {
            status?: string;
            fahrer?: string;
            wunschVerfehlt?: boolean;
            ankunft?: string;
            beendet?: boolean;
            abgeholt?: boolean;
          };

          if (stand.status === 'angenommen') {
            const name = wurzel.querySelector<HTMLElement>('[data-fahrername]');
            if (name) name.textContent = stand.fahrer || 'Ein Fahrer';

            // Nur wenn ein Wunschfahrer angegeben war und jemand anderes faehrt
            const hinweis = wurzel.querySelector<HTMLElement>('[data-status-wunsch]');
            if (hinweis) hinweis.hidden = !stand.wunschVerfehlt;

            // Ankunftszeit, solange der Fahrer seinen Standort teilt. Faellt
            // sie weg - etwa weil er die Freigabe beendet -, verschwindet die
            // Zeile wieder, statt eine veraltete Zahl stehen zu lassen.
            const ankunft = wurzel.querySelector<HTMLElement>('[data-status-ankunft]');
            if (ankunft) {
              // Sitzt der Fahrgast im Auto, waere eine Ankunftszeit zur
              // Abholadresse sinnlos - dann steht da, dass der Fahrer da ist.
              const text = stand.abgeholt ? 'Ihr Fahrer ist da.' : (stand.ankunft ?? '');
              ankunft.textContent = text;
              ankunft.hidden = !text;
            }

            zeigeStatus('gefunden');

            // Weiterfragen, bis die Fahrt abgemeldet ist. Langsamer als bei
            // der Suche: Es geht nur noch um die Ankunftszeit.
            if (!vergeben) {
              vergeben = true;
              schluss = Date.now() + 60 * 60 * 1000;
            }
            if (!stand.beendet) {
              statusTimer = window.setTimeout(nachfragen, 10000);
            }
            return;
          }
          if (stand.status === 'niemand' || stand.status === 'storniert') {
            zeigeStatus('keiner');
            return;
          }
        }
      } catch {
        // Netz kurz weg - beim naechsten Versuch klappt es vielleicht
      }

      statusTimer = window.setTimeout(nachfragen, 3000);
    };

    statusTimer = window.setTimeout(nachfragen, 2500);
  }

  /** Schickt die Bestellung an den Vermittlungsdienst. */
  async function vermitteln(): Promise<void> {
    const problem = pruefen(LETZTER_SCHRITT);
    if (problem) {
      fehlerZeigen(problem);
      return;
    }

    const w = werteLesen();
    const beschriftung = knopfVermitteln?.innerHTML ?? '';
    if (knopfVermitteln) {
      knopfVermitteln.disabled = true;
      knopfVermitteln.textContent = 'Wird gesendet …';
    }

    // Datum und Uhrzeit maschinenlesbar - danach richtet sich, ob Tag- oder
    // Nachtfahrer gefragt werden.
    const wunschIso =
      w.datum && w.zeit ? new Date(`${w.datum}T${w.zeit}`).toISOString() : '';

    try {
      const antwort = await fetch(`${vermittlungBasis}/api/bestellung`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          art: w.art,
          abholung: w.von,
          ziel: w.nach ?? '',
          wunschzeit: `${alsDatum(w.datum ?? '')}${w.zeit ? ` um ${w.zeit} Uhr` : ''}`,
          wunschIso,
          sofort: w.sofort === 'ja',
          personen: Number(w.personen ?? 1),
          gepaeck: Number(w.gepaeck ?? 0),
          kindersitze: Number(w.kindersitze ?? 0),
          anmerkung: [
            w.rueckfahrt === 'ja' ? 'Rückfahrt gewünscht' : '',
            w.anmerkung ?? '',
          ]
            .filter(Boolean)
            .join(' · '),
          name: w.name,
          telefon: w.telefon,
          wunschFahrerId: w.wunschFahrerId ? Number(w.wunschFahrerId) : undefined,
          // Haken liegen hier als Text vor: Boolean('nein') waere true
          rechnungGewuenscht: w.rechnungGewuenscht === 'ja',
          kundeEmail: w.kundeEmail || undefined,
          vonPunkt: w.vonBreite
            ? {
                breite: Number(w.vonBreite),
                laenge: Number(w.vonLaenge),
                bezeichnung: w.von,
              }
            : undefined,
          nachPunkt: w.nachBreite
            ? {
                breite: Number(w.nachBreite),
                laenge: Number(w.nachLaenge),
                bezeichnung: w.nach,
              }
            : undefined,
        }),
      });

      if (!antwort.ok) throw new Error(`Status ${antwort.status}`);

      const ergebnis = (await antwort.json()) as { auftragId?: string };
      if (!ergebnis.auftragId) throw new Error('Keine Auftragsnummer erhalten');

      try {
        sessionStorage.removeItem(SPEICHER_SCHLUESSEL);
      } catch {
        /* egal */
      }

      zeigeStatus('suche');
      beobachte(ergebnis.auftragId);
    } catch {
      zeigeStatus('fehler');
    } finally {
      if (knopfVermitteln) {
        knopfVermitteln.disabled = false;
        knopfVermitteln.innerHTML = beschriftung;
      }
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
    if (knopfVermitteln) knopfVermitteln.hidden = !amEnde || !direktMoeglich();
    if (alternativen) alternativen.classList.toggle('hidden', !amEnde);

    fehlerZeigen(null);
    linksAktualisieren();

    // Ab dem Termin-Schritt stehen die Adressen fest - jetzt lohnt die Abfrage
    if (schritt >= 3) void preisHolen();
    else preisAnzeige('aus');

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
      const sofortFeld = pflichtfeld('sofort');
      if (sofortFeld) sofortFeld.value = art === 'jetzt' ? 'ja' : '';

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

  formular.addEventListener('input', (ereignis) => {
    fehlerZeigen(null);

    // Wer Datum oder Uhrzeit von Hand anfasst, meint keine Sofortfahrt mehr
    const ziel = ereignis.target;
    if (
      ziel instanceof HTMLInputElement &&
      (ziel.name === 'datum' || ziel.name === 'zeit')
    ) {
      const sofortFeld = pflichtfeld('sofort');
      if (sofortFeld) sofortFeld.value = '';
      wurzel
        .querySelectorAll<HTMLButtonElement>('[data-schnellwahl]')
        .forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    }

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

  knopfVermitteln?.addEventListener('click', () => {
    void vermitteln();
  });

  wurzel
    .querySelector<HTMLButtonElement>('[data-zurueck-formular]')
    ?.addEventListener('click', zurueckZumFormular);

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

  vorschlagfeldEinrichten('von');
  vorschlagfeldEinrichten('nach');
  rechnungsfeldEinrichten();
  void fahrerladen();

  schrittZeigen(1, false);
}
