/**
 * Adressen finden und Fahrstrecken messen - über OpenRouteService.
 *
 * Warum dieser Anbieter: Er wird vom HeiGIT in Heidelberg betrieben. Die
 * Adressen der Kundschaft bleiben damit in Deutschland, was den
 * Datenschutzweg deutlich einfacher macht als bei amerikanischen Diensten.
 *
 * Grundsatz in dieser Datei: Im Zweifel lieber KEIN Preis als ein falscher.
 * Jede Unsicherheit fuehrt zu null, und die Website zeigt dann
 * "Preis auf Anfrage".
 */

const BASIS = 'https://api.openrouteservice.org';

/** Ab dieser Trefferguete gilt eine Adresse als sicher erkannt. */
const MINDESTGUETE = 0.6;

/**
 * Nur diese Trefferarten sind fuer eine Preisberechnung brauchbar.
 *
 * WICHTIG: "locality", "region" und Verwandte sind bewusst NICHT dabei.
 * Findet der Dienst eine Hausadresse nicht, weicht er sonst auf den
 * Stadtmittelpunkt aus - und meldet dafuer eine hohe Trefferguete. Das ergibt
 * eine viel zu kurze Strecke und damit einen zu niedrigen Festpreis, an den
 * wir gebunden waeren.
 */
const BRAUCHBARE_ARTEN = new Set(['address', 'street', 'venue']);

/**
 * Suchradius um den Betriebssitz in Kilometern.
 *
 * Ohne diese Schranke findet der Dienst zu "Ludwigsburg Bahnhof" auch einen
 * gleichnamigen Ort am anderen Ende der Republik - und wir haetten einen
 * bindenden Preis fuer 226 statt 15 Kilometer genannt.
 */
const SUCHRADIUS_KM = 100;

/**
 * Weiter als das rechnen wir nicht automatisch. Fernfahrten werden ohnehin
 * einzeln besprochen, und je laenger die Strecke, desto teurer waere ein
 * Fehlgriff.
 */
const MAX_STRECKE_KM = 150;

/** Bis hierhin gilt ein Treffer als "aus der Region" und wird vorgezogen. */
const REGION_KM = 50;

export interface Ort {
  laenge: number;
  breite: number;
  /** So hat der Dienst die Adresse verstanden - wird dem Kunden gezeigt */
  bezeichnung: string;
}

export interface Strecke {
  km: number;
  minuten: number;
}

/**
 * Sucht eine Adresse. Der Fokuspunkt sorgt dafuer, dass "Bahnhofstraße 5"
 * in Stuttgart landet und nicht in Hamburg.
 */
export async function adresseFinden(
  text: string,
  schluessel: string,
  fokusBreite: number,
  fokusLaenge: number,
): Promise<Ort | null> {
  const gesuch = text.trim();
  if (gesuch.length < 4) return null;

  const url = new URL(`${BASIS}/geocode/search`);
  url.searchParams.set('api_key', schluessel);
  url.searchParams.set('text', gesuch);
  url.searchParams.set('boundary.country', 'DEU');
  // focus.point sortiert nur - boundary.circle schliesst wirklich aus
  url.searchParams.set('focus.point.lat', String(fokusBreite));
  url.searchParams.set('focus.point.lon', String(fokusLaenge));
  url.searchParams.set('boundary.circle.lat', String(fokusBreite));
  url.searchParams.set('boundary.circle.lon', String(fokusLaenge));
  url.searchParams.set('boundary.circle.radius', String(SUCHRADIUS_KM));
  url.searchParams.set('size', '5');
  url.searchParams.set('layers', 'address,street,venue');

  try {
    const antwort = await fetch(url.toString());
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: {
          label?: string;
          confidence?: number;
          layer?: string;
          match_type?: string;
        };
      }[];
    };

    // Den besten Treffer nehmen, der unsere Anforderungen erfuellt - nicht
    // stur den ersten. Steht ein Stadttreffer vorn, waere sonst alles
    // dahinter verloren, obwohl die richtige Adresse dabei sein kann.
    const treffer = (daten.features ?? []).find((eintrag) => {
      const eigenschaften = eintrag.properties ?? {};
      if (!eintrag.geometry?.coordinates) return false;
      if ((eigenschaften.confidence ?? 0) < MINDESTGUETE) return false;
      // Ein Stadt- oder Kreistreffer taugt nicht als Start- oder Zielpunkt
      if (!BRAUCHBARE_ARTEN.has(eigenschaften.layer ?? '')) return false;
      // "fallback" heisst: Der Dienst hat geraten, statt zu finden
      if (eigenschaften.match_type === 'fallback') return false;
      return true;
    });

    const koordinaten = treffer?.geometry?.coordinates;
    if (!koordinaten) return null;

    const ort: Ort = {
      laenge: koordinaten[0],
      breite: koordinaten[1],
      bezeichnung: treffer?.properties?.label ?? gesuch,
    };

    // Guertel und Hosentraeger: Auch wenn der Dienst die Schranke einmal
    // nicht beachtet, verlassen wir uns nicht darauf.
    const entfernung = luftlinieKm(ort, {
      laenge: fokusLaenge,
      breite: fokusBreite,
      bezeichnung: '',
    });
    if (entfernung > SUCHRADIUS_KM) return null;

    return ort;
  } catch {
    return null;
  }
}

/** Misst die tatsaechliche Fahrstrecke, nicht die Luftlinie. */
export async function streckeMessen(
  von: Ort,
  nach: Ort,
  schluessel: string,
): Promise<Strecke | null> {
  // Der einfache GET-Endpunkt ignoriert "preference" - deshalb POST.
  // Kuerzeste statt schnellster Strecke: Die schnellste fuehrt gern ueber die
  // Autobahn und ist deutlich laenger. Abgerechnet wird nach Kilometern -
  // wir wollen den Fahrgast nicht fuer einen Umweg zahlen lassen.
  try {
    const antwort = await fetch(`${BASIS}/v2/directions/driving-car`, {
      method: 'POST',
      headers: {
        Authorization: schluessel,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [
          [von.laenge, von.breite],
          [nach.laenge, nach.breite],
        ],
        preference: 'shortest',
        units: 'km',
      }),
    });
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as {
      routes?: { summary?: { distance?: number; duration?: number } }[];
    };

    const zusammenfassung = daten.routes?.[0]?.summary;
    const km = zusammenfassung?.distance;
    const sekunden = zusammenfassung?.duration;

    // Eine Strecke ohne Laenge ist kein Ergebnis, sondern ein Fehler
    if (typeof km !== 'number' || km <= 0) return null;

    // Notbremse gegen absurde Routen: Liegt die Fahrstrecke mehr als das
    // 2,5-fache ueber der Luftlinie, stimmt etwas nicht - dann lieber
    // "Preis auf Anfrage" als ein zu hoher, aber bindender Betrag.
    // Fernfahrten nicht automatisch bepreisen
    if (km > MAX_STRECKE_KM) return null;

    const luftlinie = luftlinieKm(von, nach);
    if (luftlinie > 0.5 && km / luftlinie > 2.5) return null;

    return {
      km: Math.round(km * 100) / 100,
      minuten: Math.round((sekunden ?? 0) / 60),
    };
  } catch {
    return null;
  }
}


/** Luftlinie in Kilometern - dient nur als Plausibilitaetspruefung. */
function luftlinieKm(a: Ort, b: Ort): number {
  const erdradius = 6371;
  const bogen = (grad: number) => (grad * Math.PI) / 180;

  const dBreite = bogen(b.breite - a.breite);
  const dLaenge = bogen(b.laenge - a.laenge);

  const h =
    Math.sin(dBreite / 2) ** 2 +
    Math.cos(bogen(a.breite)) * Math.cos(bogen(b.breite)) * Math.sin(dLaenge / 2) ** 2;

  return 2 * erdradius * Math.asin(Math.sqrt(h));
}


/**
 * Liefert Adressvorschlaege zum Antippen.
 *
 * Der eigentliche Grund fuer diese Funktion: Aus Freitext laesst sich kein
 * verlaesslicher Festpreis ableiten. Wer "Hamburg Hauptbahnhof" tippt, bekommt
 * vom Kartendienst innerhalb unseres Suchradius den Stuttgarter Hauptbahnhof -
 * ein plausibel aussehender, aber falscher und bindender Preis.
 *
 * Waehlt der Fahrgast dagegen aus einer Liste, ist eindeutig, welcher Punkt
 * bepreist wird.
 */
export async function adressenVorschlagen(
  gesuch: string,
  schluessel: string,
  fokusBreite: number,
  fokusLaenge: number,
): Promise<Ort[]> {
  const text = gesuch.trim();
  if (text.length < 3) return [];

  const url = new URL(`${BASIS}/geocode/autocomplete`);
  url.searchParams.set('api_key', schluessel);
  url.searchParams.set('text', text);
  url.searchParams.set('boundary.country', 'DEU');
  url.searchParams.set('focus.point.lat', String(fokusBreite));
  url.searchParams.set('focus.point.lon', String(fokusLaenge));
  url.searchParams.set('layers', 'address,street,venue');
  url.searchParams.set('size', '6');

  try {
    const antwort = await fetch(url.toString());
    // Auch ohne Kartendienst soll "Flughafen" zum Terminal fuehren
    if (!antwort.ok) return festeZieleEinsetzen(text, []);

    const daten = (await antwort.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string; layer?: string };
      }[];
    };

    const heimat: Ort = {
      breite: fokusBreite,
      laenge: fokusLaenge,
      bezeichnung: '',
    };

    const vorschlaege = (daten.features ?? [])
      .filter(
        (eintrag) =>
          eintrag.geometry?.coordinates &&
          BRAUCHBARE_ARTEN.has(eintrag.properties?.layer ?? ''),
      )
      .map((eintrag) => ({
        laenge: eintrag.geometry!.coordinates![0],
        breite: eintrag.geometry!.coordinates![1],
        bezeichnung: eintrag.properties?.label ?? '',
      }))
      .filter((ort) => ort.bezeichnung.length > 0)
      // Zweistufig sortieren: erst alles aus der Region, dann der Rest -
      // innerhalb der Gruppen bleibt die Reihenfolge des Kartendienstes.
      //
      // Reine Entfernungssortierung waere falsch: Sie stellt bei
      // "Hamburg Hauptbahnhof" eine 100 km entfernte Bushaltestelle vor den
      // tatsaechlichen Hamburger Hauptbahnhof. Umgekehrt braucht es die
      // Regionsstufe, damit "Steiermärker Straße" nicht in Karlsruhe landet.
      .map((ort, reihenfolge) => ({
        ort,
        reihenfolge,
        nah: luftlinieKm(ort, heimat) <= REGION_KM ? 0 : 1,
      }))
      .sort((a, b) => a.nah - b.nah || a.reihenfolge - b.reihenfolge)
      .map((eintrag) => eintrag.ort);

    return festeZieleEinsetzen(text, vorschlaege).slice(0, 5);
  } catch {
    return festeZieleEinsetzen(text, []);
  }
}

/* ============================================================ Feste Ziele */

export interface FestesZiel {
  /** So erscheint das Ziel in der Vorschlagsliste und beim Fahrer */
  bezeichnung: string;
  breite: number;
  laenge: number;
  /** Passt die EINGABE hierauf, steht das feste Ziel ganz oben */
  eingabe: RegExp;
  /** Vorschlaege der Kartensuche in diesem Umkreis ... */
  umkreisKm: number;
  /** ... deren NAME hierauf passt, werden durch das feste Ziel ersetzt */
  ersetzt: RegExp;
}

/**
 * Orte, bei denen die Kartensuche mehrere, sehr unterschiedlich teure Punkte
 * anbietet - und der Fahrgast nicht erkennen kann, welcher gemeint ist.
 *
 * Anlass: Zu "Flughafen Stuttgart" kam neben dem Terminal ein Punkt am
 * Ostende der Startbahn bei Neuhausen, gut 4 km entfernt. Ab Feuerbach
 * 53,50 statt 46,50 Euro, aus Esslingen und Bernhausen gar kein Preis. Und
 * genau dieser Eintrag hiess woertlich "Flughafen Stuttgart".
 *
 * Der Terminalpunkt ist gemessen, nicht geschaetzt: Aus Feuerbach, Esslingen,
 * Boeblingen und Bernhausen ergibt er dieselben Strecken wie die uebrigen
 * Terminal-Eintraege der Kartensuche (13.09.2026).
 *
 * Messe und Hauptbahnhof brauchen das nicht: Deren Vorschlaege liegen nur
 * 1-3 Euro auseinander, weil es echte, verschiedene Eingaenge sind.
 */
export const FESTE_ZIELE: FestesZiel[] = [
  {
    bezeichnung: 'Flughafen Stuttgart – Terminal',
    breite: 48.690542,
    laenge: 9.193195,
    // "Flughafen", "Flughaf…" beim Tippen, "Airport" - aber NICHT
    // "Flughafenstraße": Das ist eine echte Adresse, keine Flughafensuche
    eingabe: /\bflughaf(?!en[\s-]*str)|\bairport\b/i,
    // Das Ostende der Startbahn liegt gut 4 km vom Terminal entfernt
    umkreisKm: 5,
    // Wieder ohne "Flughafenstraße": Dort stehen Hotels und Bueros, 200-500 m
    // vom Terminal entfernt. Die duerfen nie zum Terminal umgebogen werden.
    ersetzt: /flughafen(?![\s-]*str)|airport/i,
  },
];

/**
 * Setzt feste Ziele in die Vorschlagsliste ein.
 *
 *  - Sucht der Fahrgast nach dem Ort ("Flughafen Stuttgart"), steht das feste
 *    Ziel ganz oben, und alle Doppelgaenger der Kartensuche verschwinden.
 *  - Sucht er nach etwas anderem ("Messe Stuttgart") und die Kartensuche
 *    liefert trotzdem einen Doppelgaenger (die S-Bahn-Station
 *    "Flughafen/Messe"), wird dieser an Ort und Stelle ersetzt - das feste
 *    Ziel draengt sich dann nicht nach vorn.
 */
export function festeZieleEinsetzen(gesuch: string, vorschlaege: Ort[]): Ort[] {
  let ergebnis = [...vorschlaege];
  const oben: Ort[] = [];

  for (const ziel of FESTE_ZIELE) {
    const punkt: Ort = {
      breite: ziel.breite,
      laenge: ziel.laenge,
      bezeichnung: ziel.bezeichnung,
    };
    const istDoppelgaenger = (ort: Ort) =>
      ziel.ersetzt.test(ort.bezeichnung) && luftlinieKm(ort, punkt) <= ziel.umkreisKm;

    if (ziel.eingabe.test(gesuch)) {
      ergebnis = ergebnis.filter((ort) => !istDoppelgaenger(ort));
      oben.push(punkt);
      continue;
    }

    const erster = ergebnis.findIndex(istDoppelgaenger);
    if (erster === -1) continue;

    ergebnis = ergebnis
      .map((ort, i) => (i === erster ? punkt : ort))
      .filter((ort, i) => i === erster || !istDoppelgaenger(ort));
  }

  return [...oben, ...ergebnis];
}

/** Misst die Strecke zwischen zwei bereits bekannten Punkten. */
export async function streckeZwischenPunkten(
  vonBreite: number,
  vonLaenge: number,
  nachBreite: number,
  nachLaenge: number,
  schluessel: string,
): Promise<Strecke | null> {
  return streckeMessen(
    { breite: vonBreite, laenge: vonLaenge, bezeichnung: '' },
    { breite: nachBreite, laenge: nachLaenge, bezeichnung: '' },
    schluessel,
  );
}
