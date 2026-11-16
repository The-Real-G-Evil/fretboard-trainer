import type { ReactNode } from "react";
import appIcon from "../assets/app-icon.png";
import { t } from "../i18n";

export type Page = "practice" | "courses" | "stats" | "tuner" | "effects" | "recording";

// Einfache Liniensymbole (24er Raster, Strichfarbe = Textfarbe)
const ICONS: Record<Page | "settings", ReactNode> = {
  practice: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  courses: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  stats: <><path d="M4 20h16" /><path d="M7 16v-5" /><path d="M12 16V5" /><path d="M17 16v-8" /></>,
  tuner: <><path d="M3.5 17a9 9 0 1 1 17 0" /><path d="M12 17l4.5-6" /><circle cx="12" cy="17" r="1.2" /></>,
  effects: <><path d="M5 21v-7" /><path d="M5 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M19 21v-5" /><path d="M19 12V3" /><path d="M2 14h6" /><path d="M9 8h6" /><path d="M16 16h6" /></>,
  recording: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const PAGES: { id: Page; label: string }[] = [
  { id: "practice", label: "Üben" },
  { id: "courses", label: "Kurse" },
  { id: "stats", label: "Statistik" },
  { id: "tuner", label: "Stimmgerät" },
  { id: "effects", label: "Effekte" },
  { id: "recording", label: "Aufnahme" },
];

export function ToolbarIcon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;
}

/** Kopfzeile des Hauptfensters als App-Toolbar: links App-Symbol und Name, in der Mitte die Seiten (Symbol über
    Beschriftung), rechts Aufnahme, Sprache, Version und – je nach Plattform – Einstellungen. */
export function AppToolbar({ page, onPage, end }: { page: Page; onPage: (p: Page) => void; end: ReactNode }) {
  return (
    <header className="app-toolbar">
      <div className="app-brand">
        <img src={appIcon} alt="" width={32} height={32} />
        <span>Fretboard Trainer</span>
      </div>
      <nav className="toolbar-tabs" role="tablist">
        {PAGES.map((p) => (
          <button key={p.id} role="tab" className="toolbar-tab" aria-selected={page === p.id} onClick={() => onPage(p.id)}>
            <ToolbarIcon name={p.id} />
            <span>{t(p.label)}</span>
          </button>
        ))}
      </nav>
      <div className="toolbar-end">{end}</div>
    </header>
  );
}
