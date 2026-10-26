import { afterEach, describe, expect, it } from "vitest";
import { EN } from "./en";
import { setLang, t } from ".";

// Quelltexte aller Module (ohne Tests)
const SOURCES = Object.entries(
  import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx"],
                   { query: "?raw", import: "default", eager: true }) as Record<string, string>,
);

/** Alle Texte in t("…") und tKey("…") – Vorlagen-Strings (`…`) sind in t() nicht erlaubt. */
function keys(): { key: string; file: string }[] {
  const out: { key: string; file: string }[] = [];
  for (const [file, text] of SOURCES)
    for (const m of text.matchAll(/\b(?:t|tKey)\(\s*"((?:[^"\\]|\\.)*)"/g)) out.push({ key: JSON.parse(`"${m[1]}"`), file });
  return out;
}

describe("Übersetzungen", () => {
  afterEach(() => setLang("de"));

  it("jeder t()-Text hat eine englische Übersetzung", () => {
    const missing = [...new Set(keys().filter((k) => !(k.key in EN)).map((k) => `${k.file}: ${k.key}`))];
    expect(missing).toEqual([]);
  });

  it("keine Vorlagen-Strings in t()", () => {
    const bad = SOURCES.filter(([, text]) => /\bt\(\s*`/.test(text)).map(([file]) => file);
    expect(bad).toEqual([]);
  });

  it("Übersetzungen behalten die Platzhalter", () => {
    const wrong = Object.entries(EN).filter(([de, en]) => {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      return ph(de) !== ph(en);
    });
    expect(wrong).toEqual([]);
  });

  it("setzt Platzhalter ein und fällt auf Deutsch zurück", () => {
    setLang("en");
    expect(t("Unbekannter Text {n}", { n: 3 })).toBe("Unbekannter Text 3");
  });
});
