import { noteName, type CalibrationTake } from "../api";
import type { Instrument } from "../instruments";
import type { Exercise } from "./exercises";
import { Fretboard } from "./Fretboard";
import { InstrumentHint } from "./InstrumentHint";
import { NoteChip, type ChipState } from "./NoteChip";
import { RETAKE_ACCURACY, GOOD_ACCURACY } from "./recommendations";

interface TakeResultProps {
  take: CalibrationTake;
  exercise: Exercise;
  instrument: Instrument;
  gateThresholdDb: number;
  onApplyGate: (db: number) => void;
  onSwitchInstrument: (id: string) => void;
}

const CLIP_WARN_DB = -1;

function LevelWarning({ peakDb }: { peakDb?: number }) {
  if (peakDb === undefined || peakDb < CLIP_WARN_DB) return null;
  return (
    <p className="warning">
      Der Eingang war fast übersteuert (Spitze {peakDb.toFixed(1)} dBFS). Bitte die Eingangsverstärkung am
      Interface etwas zurückdrehen – verzerrte Töne verschlechtern die Erkennung.
    </p>
  );
}

const DETAIL: Partial<Record<ChipState, string>> = {
  wrongType: "Art vertauscht",
  missing: "fehlt",
};

export function TakeResult({ take, exercise, instrument, gateThresholdDb, onApplyGate, onSwitchInstrument }: TakeResultProps) {
  if (take.error) return <p className="error">{take.error}</p>;

  if (take.kind === "silence" && take.noise) {
    const n = take.noise;
    const differs = Math.abs(n.suggestedGateDb - gateThresholdDb) >= 1;
    if (n.quiet === false)
      return (
        <div className="take-result">
          <p className="warning">
            Es war nicht ruhig: typische Spitze {(n.typicalPeakDb ?? n.peakDb).toFixed(1)} dBFS. Vermutlich klang noch eine
            Saite oder das Instrument wurde berührt. Bitte alle Saiten abdämpfen und die Messung wiederholen.
          </p>
        </div>
      );
    return (
      <div className="take-result">
        <div className="result-stats">
          <div><span>Grundrauschen (typische Spitze)</span>{(n.typicalPeakDb ?? n.peakDb).toFixed(1)} dBFS</div>
          <div><span>Grundrauschen (höchste Spitze)</span>{n.peakDb.toFixed(1)} dBFS</div>
          <div><span>Grundrauschen (RMS)</span>{n.rmsDb.toFixed(1)} dBFS</div>
          <div><span>Empfohlene Gate-Schwelle</span>{n.suggestedGateDb.toFixed(1)} dBFS</div>
        </div>
        {differs ? (
          <button className="primary" onClick={() => onApplyGate(n.suggestedGateDb)}>
            Gate-Schwelle auf {n.suggestedGateDb.toFixed(1)} dBFS setzen (bisher {gateThresholdDb.toFixed(1)})
          </button>
        ) : (
          <p className="hint">Die Gate-Schwelle passt bereits.</p>
        )}
      </div>
    );
  }

  const s = take.score;
  if (!s) return <p className="hint">Keine Bewertung vorhanden.</p>;

  const states: ChipState[] = exercise.notes.map(() => "missing");
  const details: (string | undefined)[] = exercise.notes.map(() => undefined);
  for (const a of s.alignment) {
    if (a.expected < 0 || a.expected >= states.length) continue;
    states[a.expected] = a.kind === "extra" ? "missing" : a.kind;
    if (a.kind === "wrongPitch" && s.detected[a.detected]) {
      const d = noteName(s.detected[a.detected].midi);
      details[a.expected] = `erkannt: ${d.name}${d.octave}`;
    } else if (a.kind === "wrongType" && s.detected[a.detected]) {
      details[a.expected] = s.detected[a.detected].onsetType === "pick" ? "als Anschlag" : "als Legato";
    } else {
      details[a.expected] = DETAIL[a.kind as ChipState];
    }
  }

  const octavePairs = s.alignment
    .filter((a) => a.kind === "wrongPitch" && s.detected[a.detected])
    .map((a) => ({ expected: exercise.notes[a.expected].midi, detected: s.detected[a.detected].midi }));

  const pct = Math.round(s.accuracy * 100);
  const grade = s.accuracy >= GOOD_ACCURACY ? "good" : s.accuracy >= RETAKE_ACCURACY ? "ok" : "bad";

  return (
    <div className="take-result">
      <InstrumentHint instrument={instrument} pairs={octavePairs} onSwitchInstrument={onSwitchInstrument} />
      <LevelWarning peakDb={take.peakDb} />
      <div className="result-stats">
        <div className={`accuracy ${grade}`}><span>Übereinstimmung</span>{pct} %</div>
        <div><span>richtig</span>{s.correct} / {s.expected}</div>
        <div><span>Art vertauscht</span>{s.wrongType}</div>
        <div><span>falscher Ton</span>{s.wrongPitch}</div>
        <div><span>fehlt</span>{s.missing}</div>
        <div><span>zusätzlich</span>{s.extra}</div>
      </div>
      <Fretboard instrument={instrument} notes={exercise.notes} states={states} />
      <div className="chips">
        {exercise.notes.map((n, i) => (
          <NoteChip key={i} note={n} instrument={instrument} state={states[i]} detail={details[i]} />
        ))}
      </div>
    </div>
  );
}
