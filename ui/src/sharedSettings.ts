// Einstellungen, die Hauptfenster und Einstellungsfenster gemeinsam nutzen (zwei WebViews, ein Kern).
// Jede lokale Änderung meldet das Fenster per Broadcast; das andere liest den Stand neu ein.

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { api, type AppSettings } from "./api";
import { detectLang, getLang, isLang, setLang, type Lang } from "./i18n";
import type { UiSettings } from "./practice/settings";

/** Welches Fenster: Hauptfenster oder Einstellungsfenster (?view=settings). */
export const VIEW: "main" | "settings" =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("view") === "settings" ? "settings" : "main";

/** Plattform für den System-Look des Einstellungsfensters. */
export const PLATFORM: "mac" | "win" | "linux" =
  typeof navigator === "undefined" ? "linux"
    : /Mac/.test(navigator.userAgent) ? "mac"
    : /Windows/.test(navigator.userAgent) ? "win" : "linux";

export function useSharedSettings(migrate?: (u: UiSettings) => UiSettings) {
  const [settings, setSettingsRaw] = useState<AppSettings | null>(null);
  const [ui, setUiRaw] = useState<UiSettings | null>(null);
  const [lang, setLangState] = useState<Lang>(getLang());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const migrateRef = useRef(migrate);

  const applyLang = (u: UiSettings) => {
    // Sprache: gespeicherte Wahl, sonst die des Systems (auch für Meldungen und Dialoge des Kerns speichern)
    const l = isLang(u.language) ? u.language : detectLang();
    if (!isLang(u.language)) api.setUiSetting("language", l);
    setLang(l);
    setLangState(l);
    return { ...u, language: l };
  };

  const reload = useCallback(async (first: boolean) => {
    const [s, u] = await Promise.all([api.getSettings(), api.getUiSettings()]);
    setSettingsRaw(s);
    setUiRaw(applyLang(first && migrateRef.current ? migrateRef.current(u) : u));
  }, []);

  useEffect(() => {
    void reload(true);
    const offChanged = api.onSettingsChanged((e) => {
      if (e.from !== VIEW) void reload(false);
    });
    // Neuer Eingang (z. B. Rocksmith-Kabel): der Kern hat dessen gespeicherten Gain geladen
    const offDevice = api.onAudioDevice((e) => {
      if (e.gainDb !== undefined) setSettingsRaw((s) => (s ? { ...s, inputGainDb: e.gainDb! } : s));
    });
    return () => {
      offChanged();
      offDevice();
    };
  }, [reload]);

  const notify = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void api.broadcastSettingsChanged(VIEW), 200);
  }, []);

  const setSettings = useCallback((v: SetStateAction<AppSettings | null>) => {
    setSettingsRaw(v);
    notify();
  }, [notify]);

  const setUi = useCallback((v: SetStateAction<UiSettings | null>) => {
    setUiRaw(v);
    notify();
  }, [notify]);

  // Sprachwechsel (hier oder im anderen Fenster) gilt sofort
  const uiLang = ui?.language;
  useEffect(() => {
    if (isLang(uiLang) && uiLang !== lang) {
      setLang(uiLang);
      setLangState(uiLang);
    }
  }, [uiLang, lang]);

  return { settings, setSettings, ui, setUi, lang };
}
