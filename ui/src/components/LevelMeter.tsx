import { useEffect, useRef, useState } from "react";
import { api, type LevelEvent, type NoiseGateParams } from "../api";

const MIN_DB = -72;
const MAX_DB = 0;
const PEAK_HOLD_MS = 1000;
const PEAK_FALL_DB_PER_S = 24;
const TICKS = [-72, -60, -48, -36, -24, -12, -6, 0];

const toPercent = (db: number) =>
  ((Math.min(MAX_DB, Math.max(MIN_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;

const fromPercent = (p: number) => MIN_DB + (p / 100) * (MAX_DB - MIN_DB);

const formatDb = (db: number) => (db <= -99 ? "−∞" : db.toFixed(1).replace("-", "−"));

interface LevelMeterProps {
  gate: NoiseGateParams;
  onThresholdChange: (db: number) => void;
}

export function LevelMeter({ gate, onThresholdChange }: LevelMeterProps) {
  const [level, setLevel] = useState<LevelEvent>({ rmsDb: -100, peakDb: -100, gateOpen: false });
  const [heldPeak, setHeldPeak] = useState(-100);
  const peakState = useRef({ db: -100, at: 0 });
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      api.onLevel((e) => {
        setLevel(e);

        const now = performance.now();
        const p = peakState.current;
        const age = now - p.at;
        const fallen = age > PEAK_HOLD_MS ? p.db - ((age - PEAK_HOLD_MS) / 1000) * PEAK_FALL_DB_PER_S : p.db;

        if (e.peakDb >= fallen) peakState.current = { db: e.peakDb, at: now };
        setHeldPeak(Math.max(e.peakDb, fallen));
      }),
    [],
  );

  // Klick/Ziehen auf die Anzeige setzt die Gate-Schwelle
  const dragThreshold = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const db = fromPercent(((clientX - rect.left) / rect.width) * 100);
    onThresholdChange(Math.round(Math.min(0, Math.max(-90, db)) * 2) / 2);
  };

  const closeDb = gate.thresholdDb - gate.hysteresisDb;

  return (
    <div className="meter">
      <div className="meter-readout">
        <div className={`gate-led ${level.gateOpen ? "open" : ""}`} aria-live="polite">
          <span className="dot" />
          Gate {level.gateOpen ? "offen" : "zu"}
        </div>
        <div className="value"><span>RMS</span>{formatDb(level.rmsDb)} dBFS</div>
        <div className="value"><span>Spitze</span>{formatDb(heldPeak)} dBFS</div>
      </div>

      <div
        className="meter-bar"
        ref={barRef}
        title="Klicken oder ziehen, um die Gate-Schwelle zu setzen"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragThreshold(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) dragThreshold(e.clientX);
        }}
      >
        <div className="below-gate" style={{ width: `${toPercent(gate.thresholdDb)}%` }} />
        <div className={`rms ${level.gateOpen ? "open" : ""}`} style={{ width: `${toPercent(level.rmsDb)}%` }} />
        <div className="peak" style={{ left: `${toPercent(heldPeak)}%` }} />
        <div className="close-line" style={{ left: `${toPercent(closeDb)}%` }} />
        <div className="threshold-line" style={{ left: `${toPercent(gate.thresholdDb)}%` }}>
          <span>{formatDb(gate.thresholdDb)}</span>
        </div>
      </div>

      <div className="meter-scale">
        {TICKS.map((t) => (
          <span key={t} style={{ left: `${toPercent(t)}%` }}>{t}</span>
        ))}
      </div>
      <p className="hint">
        Durchgezogene Linie: Öffnungsschwelle · gestrichelt: Schließschwelle (Schwelle − Hysterese)
      </p>
    </div>
  );
}
