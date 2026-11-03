// Prüft auf GitHub, ob eine neuere Version vorliegt (Releases sind Vorabversionen, daher die Liste statt /latest).
// Fehler (offline, Rate-Limit) bleiben still: dann gibt es eben keinen Hinweis.

import { useEffect, useState } from "react";
import { api } from "../api";

const RELEASES_API = "https://api.github.com/repos/The-Real-G-Evil/fretboard-trainer/releases?per_page=1";
export const RELEASES_PAGE = "https://github.com/The-Real-G-Evil/fretboard-trainer/releases";

export interface UpdateInfo {
  latest: string; // z. B. "00.00.05"
  newer: boolean;
  url: string; // Installer für dieses System, sonst die Release-Seite
  file?: string; // Name des Installers
}

export type UpdateState = { checking: boolean; info: UpdateInfo | null; failed: boolean; checkedAt?: number };

interface Release {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** Versionen wie "00.00.05" (auch mit "v") vergleichen: > 0, wenn a neuer ist. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, "").split(".").map((p) => parseInt(p, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Installer passend zum System (nach der Kennung des Browsers in der App). */
export function platformAsset(assets: NonNullable<Release["assets"]>, userAgent: string) {
  const pick = (re: RegExp) => assets.find((a) => a.name && a.browser_download_url && re.test(a.name));
  if (/Windows/i.test(userAgent)) return pick(/Setup\.exe$/i);
  if (/Mac OS|Macintosh/i.test(userAgent)) return pick(/\.dmg$/i);
  if (/Linux/i.test(userAgent)) return pick(/\.deb$/i) ?? pick(/\.tar\.gz$/i);
  return undefined;
}

/** Auswertung der Antwort von GitHub (null: unbrauchbar). */
export function updateFromReleases(releases: unknown, current: string, userAgent: string): UpdateInfo | null {
  const r = (Array.isArray(releases) ? releases : []).find((x: Release) => x && !x.draft && typeof x.tag_name === "string") as Release | undefined;
  if (!r?.tag_name) return null;
  const latest = r.tag_name.replace(/^v/i, "");
  const asset = platformAsset(r.assets ?? [], userAgent);
  return {
    latest,
    newer: compareVersions(latest, current) > 0,
    url: asset?.browser_download_url ?? RELEASES_PAGE,
    ...(asset?.name ? { file: asset.name } : {}),
  };
}

let state: UpdateState = { checking: false, info: null, failed: false };
const listeners = new Set<(s: UpdateState) => void>();
const publish = (s: UpdateState) => {
  state = s;
  listeners.forEach((fn) => fn(s));
};

/** Einmal nachsehen (mehrfache Aufrufe während einer Prüfung werden zusammengefasst). */
export async function checkForUpdate(current: string): Promise<void> {
  if (state.checking || !current) return;
  publish({ ...state, checking: true });
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    const info = res.ok ? updateFromReleases(await res.json(), current, navigator.userAgent) : null;
    publish({ checking: false, info: info ?? state.info, failed: !info, checkedAt: Date.now() });
  } catch {
    publish({ checking: false, info: state.info, failed: true, checkedAt: Date.now() });
  }
}

export function useUpdateState(): UpdateState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** Installer bzw. Release-Seite im Standardbrowser öffnen (der Kern lässt nur GitHub-Adressen dieses Projekts zu). */
export const openDownload = (info: UpdateInfo) => api.openDownload(info.url);
