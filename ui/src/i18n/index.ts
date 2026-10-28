// Mehrsprachigkeit: Der deutsche Text im Code ist zugleich der Schlüssel; die Übersetzungen stehen in en.ts.
// Fehlt eine Übersetzung, erscheint der deutsche Text (i18n.test.ts prüft, dass alle t()-Texte übersetzt sind).
//
//   t("Übung starten")                 -> "Start exercise"
//   t("Takt {n}", { n: 3 })            -> "Bar 3"
//
// Die Sprache gilt global (auch in Hilfsmodulen außerhalb von React). Beim Wechsel baut App die Oberfläche neu auf.

import { EN } from "./en";

export type Lang = "de" | "en";

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: "de", name: "Deutsch" },
  { id: "en", name: "English" },
];

let current: Lang = "de";

/** Sprache des Systems: Deutsch auf deutschsprachigen Systemen, sonst Englisch. */
export function detectLang(): Lang {
  const l = typeof navigator !== "undefined" ? navigator.language ?? "" : "";
  return l.toLowerCase().startsWith("de") ? "de" : "en";
}

export const isLang = (v: unknown): v is Lang => v === "de" || v === "en";
export const getLang = (): Lang => current;

export function setLang(lang: Lang) {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Übersetzt einen deutschen Text; {name}-Platzhalter werden durch vars ersetzt.
    Ein Zusatz nach „|“ unterscheidet gleich geschriebene Texte mit verschiedener Bedeutung (z. B. "Ton|Klang")
    und wird im Deutschen nicht angezeigt. */
export function t(de: string, vars?: Record<string, string | number>): string {
  const plain = de.split("|")[0];
  const s = current === "de" ? plain : (EN[de] ?? plain);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Markiert einen Text in Datenlisten als übersetzbar (wird erst beim Anzeigen mit t() übersetzt). */
export const tKey = (de: string) => de;

/** Locale für Datums- und Zahlenformate. */
export const locale = () => (current === "de" ? "de-DE" : "en-GB");

/** Meldungen aus dem Kern (deutsch, teils mit angehängtem Pfad o. ä.) übersetzen. */
export function tCore(message: string): string {
  if (current === "de" || !message) return message;
  if (EN[message]) return EN[message];
  for (const [de, en] of Object.entries(CORE_PREFIXES)) if (message.startsWith(de)) return en + message.slice(de.length);
  for (const [de, en] of Object.entries(CORE_SUFFIXES)) if (message.endsWith(de)) return message.slice(0, -de.length) + en;
  return message;
}

// Kern-Meldungen mit vorangestelltem Dateinamen
const CORE_SUFFIXES: Record<string, string> = {
  ": kein lesbarer SF2-Soundfont": ": not a readable SF2 soundfont",
};

// Kern-Meldungen, an die ein Pfad oder Detail angehängt wird
const CORE_PREFIXES: Record<string, string> = {
  "Ordner nicht anlegbar: ": "Cannot create folder: ",
  "Die Aufnahme konnte nicht gespeichert werden (": "The recording could not be saved (",
  "Erwartungsdatei nicht lesbar: ": "Cannot read expectation file: ",
  "Erwartungsdatei nicht schreibbar: ": "Cannot write expectation file: ",
  "WAV nicht lesbar: ": "Cannot read WAV: ",
  "Keine WAV-Datei: ": "Not a WAV file: ",
  "Nicht unterstuetztes WAV-Format: ": "Unsupported WAV format: ",
  "Nicht unterstuetzte Bittiefe: ": "Unsupported bit depth: ",
  "WAV nicht schreibbar: ": "Cannot write WAV: ",
  "Statistik-Datenbank nicht zu oeffnen: ": "Cannot open statistics database: ",
  "SQL-Fehler: ": "SQL error: ",
  "Statistik nicht verfuegbar: ": "Statistics not available: ",
  "Datei nicht anlegbar in: ": "Cannot create file in: ",
  "Datei nicht anlegbar: ": "Cannot create file: ",
  "MP3: Media Foundation nicht verfuegbar": "MP3: Media Foundation not available",
  "MP3: LAME nicht verfuegbar": "MP3: LAME not available",
  "MP3: Datei nicht anlegbar": "MP3: Cannot create file",
  "MP3: Eingangsformat nicht unterstuetzt": "MP3: Input format not supported",
  "MP3: Format nicht unterstuetzt": "MP3: Format not supported",
  "MP3: Schreiben nicht moeglich": "MP3: Cannot write",
  "MP3: Schreiben fehlgeschlagen": "MP3: Writing failed",
  "MP3: Abschluss fehlgeschlagen": "MP3: Finishing failed",
  "MP3: Aufnahme nicht lesbar": "MP3: Cannot read recording",
  "MP3: Speicher": "MP3: Out of memory",
  "Aufnahme nicht lesbar: ": "Cannot read recording: ",
  "Schreiben fehlgeschlagen: ": "Writing failed: ",
};
