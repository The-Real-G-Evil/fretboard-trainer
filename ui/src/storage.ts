// Kleine Komfort-Einstellungen der Oberfläche (gewähltes Instrument, ausgeblendete Hinweise).
// localStorage kann in der WebView fehlen oder gesperrt sein – dann gelten Standardwerte.

export function load(key: string): string | null {
  try {
    return window.localStorage.getItem(`ft.${key}`);
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    window.localStorage.setItem(`ft.${key}`, value);
  } catch {
    // ohne Speicher geht es auch
  }
}
