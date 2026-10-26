import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { barAt, moveMarker, type BarRect } from "../song/barGeometry";
import { t } from "../i18n";

export type MarkerKind = "start" | "end";

interface RangeMarkersProps {
  sheet: RefObject<HTMLDivElement | null>; // Notenansicht (Koordinatenbezug der Taktgrenzen)
  rects: (BarRect | undefined)[]; // Lage der Takte, Index = Takt
  from: number;
  to: number; // letzter Takt (inklusive)
  placing: MarkerKind | null; // per Button gewählt: Balken folgt dem Mauszeiger bis zum Klick
  onPlaced: () => void;
  onChange: (from: number, to: number) => void;
}

/** Grüner (Anfang) und roter (Ende) Balken in der Notenansicht: ziehen oder per Button direkt setzen.
    Die Balken rasten an Taktgrenzen ein; der Bereich dazwischen ist leicht hinterlegt. */
export function RangeMarkers({ sheet, rects, from, to, placing, onPlaced, onChange }: RangeMarkersProps) {
  const [preview, setPreview] = useState<{ which: MarkerKind; bar: number } | null>(null);
  const dragging = useRef<MarkerKind | null>(null);

  const barUnder = (clientX: number, clientY: number) => {
    const box = sheet.current?.getBoundingClientRect();
    return box ? barAt(rects, clientX - box.left, clientY - box.top) : -1;
  };
  const commit = (which: MarkerKind, bar: number) => {
    if (bar >= 0) onChange(...moveMarker(which, bar, from, to));
    setPreview(null);
  };

  // Setzen per Button: Balken folgt dem Mauszeiger über den Noten, Klick setzt, Esc bricht ab
  useEffect(() => {
    const el = sheet.current;
    if (!el || !placing) return;
    const move = (e: PointerEvent) => {
      const bar = barUnder(e.clientX, e.clientY);
      if (bar >= 0) setPreview({ which: placing, bar });
    };
    const click = (e: MouseEvent) => {
      e.preventDefault();
      commit(placing, barUnder(e.clientX, e.clientY));
      onPlaced();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPreview(null);
      onPlaced();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("click", click);
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("click", click);
      window.removeEventListener("keydown", key);
    };
  }, [placing, rects, from, to]);

  // Ziehen: der Balken fängt den Zeiger ein, damit auch schnelle Bewegungen bei ihm ankommen
  const dragHandlers = (which: MarkerKind) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = which;
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current !== which) return;
      const bar = barUnder(e.clientX, e.clientY);
      if (bar >= 0) setPreview({ which, bar });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current !== which) return;
      dragging.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      commit(which, barUnder(e.clientX, e.clientY));
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const [a, b] = preview ? moveMarker(preview.which, preview.bar, from, to) : [from, to];
  const start = rects[a];
  const end = rects[b];
  const moving = preview?.which ?? placing;

  const marker = (which: MarkerKind, r: BarRect, x: number) => (
    <div className={`range-marker ${which} ${moving === which ? "moving" : ""}`}
         style={{ left: x - 8, top: r.y, height: r.h }}
         title={which === "start" ? t("Anfang der Übung – ziehen zum Verschieben") : t("Ende der Übung – ziehen zum Verschieben")}
         {...dragHandlers(which)}>
      <span className="range-flag">{which === "start" ? t("Start") : t("Ende")}</span>
    </div>
  );

  return (
    <div className={`range-layer ${moving ? "active" : ""}`}>
      {rects.map((r, i) => (r && i >= a && i <= b
        ? <div key={i} className="range-shade" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} /> : null))}
      {start && marker("start", start, start.x)}
      {end && marker("end", end, end.x + end.w)}
    </div>
  );
}
