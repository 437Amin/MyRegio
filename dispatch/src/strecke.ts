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
  url.searchParams.set('focus.point.lat', String(fokusBreite));
  url.searchParams.set('focus.point.lon', String(fokusLaenge));
  url.searchParams.set('size', '1');
  url.searchParams.set('layers', 'address,street,venue,locality');

  try {
    const antwort = await fetch(url.toString());
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string; confidence?: number };
      }[];
    };

    const treffer = daten.features?.[0];
    const koordinaten = treffer?.geometry?.coordinates;
    const guete = treffer?.properties?.confidence ?? 0;

    if (!koordinaten || guete < MINDESTGUETE) return null;

    return {
      laenge: koordinaten[0],
      breite: koordinaten[1],
      bezeichnung: treffer?.properties?.label ?? gesuch,
    };
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
  const url = new URL(`${BASIS}/v2/directions/driving-car`);
  url.searchParams.set('api_key', schluessel);
  url.searchParams.set('start', `${von.laenge},${von.breite}`);
  url.searchParams.set('end', `${nach.laenge},${nach.breite}`);

  try {
    const antwort = await fetch(url.toString());
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as {
      features?: {
        properties?: { summary?: { distance?: number; duration?: number } };
      }[];
    };

    const zusammenfassung = daten.features?.[0]?.properties?.summary;
    const meter = zusammenfassung?.distance;
    const sekunden = zusammenfassung?.duration;

    // Eine Strecke ohne Laenge ist kein Ergebnis, sondern ein Fehler
    if (typeof meter !== 'number' || meter <= 0) return null;

    return {
      km: Math.round((meter / 1000) * 100) / 100,
      minuten: Math.round((sekunden ?? 0) / 60),
    };
  } catch {
    return null;
  }
}
