"""Diagnose-Aufnahme vom Üben auswerten (siehe ui/src/practice/diagnostics.ts).

Aufruf:  python tools/diagnose.py <aufnahme.json> [--alle]

Gibt eine Zeitleiste aus: Zielton, jeder erkannte Ton (Zeit in der WAV-Datei, Abweichung,
Anschlagsart, ob anhand des Ziels korrigiert) und wie er gewertet wurde (Treffer, Fehler,
ignoriert). Ohne --alle nur die Umgebung der Fehler. Am Ende eine Übersicht der Fehler mit
passenden ft_wavtool-Aufrufen (pitch/spectrum) für die genauere Untersuchung.
"""

import json
import sys
from collections import Counter
from pathlib import Path

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"]


def name(midi):
    return "-" if midi is None else f"{NAMES[midi % 12]}{midi // 12 - 1}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    path = Path(args[0])
    data = json.loads(path.read_text(encoding="utf-8"))
    rec, log = data["recording"], data["log"]
    wav = path.with_name(rec["file"])
    start = rec["startMs"]
    strings = log.get("strings", [])
    sec = lambda ms: (ms - start) / 1000.0

    # Versuche den erkannten Tönen zuordnen (gleiche Stream-Zeit)
    attempts = {e["noteTimeMs"]: e for e in log["entries"] if e["type"] == "attempt" and e.get("noteTimeMs") is not None}

    print(f"{path.name}: {log.get('instrument')} ({' '.join(name(m) for m in strings)}), "
          f"{log.get('difficulty')}/{log.get('mode')}, Aufnahme {rec['durationSec']:.1f} s"
          f"{' (gekürzt)' if rec.get('truncated') else ''}")
    gate = data.get("settings", {}).get("noiseGate", {})
    if gate:
        print(f"Gate {gate.get('thresholdDb')} dBFS")
    print()

    rows, target = [], None
    for e in log["entries"]:
        if e["type"] == "targets":
            target = e["midis"][0] if e["midis"] else None
        elif e["type"] == "note":
            a = attempts.get(e["timeMs"])
            verdict = "ignoriert" if a is None else ("Treffer" if a["correct"] else "FEHLER")
            open_string = e["midi"] in strings and e["midi"] != target
            rows.append((sec(e["timeMs"]), target, e, verdict, open_string))
        elif e["type"] == "attempt" and e.get("noteTimeMs") is None:
            rows.append((None, e["expectedMidi"], None, "verpasst", False))

    show_all = "--alle" in sys.argv
    errors = [i for i, r in enumerate(rows) if r[3] in ("FEHLER", "ignoriert")]
    visible = set(range(len(rows))) if show_all else {j for i in errors for j in range(i - 1, i + 2)}

    print(f"{'Zeit s':>8}  {'Ziel':5} {'erkannt':8} {'Cent':>5}  {'Art':7} {'Pegel':>6} {'Anstieg':>7}  Wertung")
    last = -1
    for i, (t, tgt, e, verdict, open_string) in enumerate(rows):
        if i not in visible:
            continue
        if i != last + 1:
            print(f"{'...':>8}")
        last = i
        if e is None:
            print(f"{'':>8}  {name(tgt):5} {'':8} {'':>5}  {'':7} {'':6} {'':7}  {verdict}")
            continue
        flags = (" korrigiert" if e.get("corrected") else "") + (" leere Saite" if open_string else "")
        level = f"{e['levelDb']:6.1f} {e['riseDb']:7.1f}" if "levelDb" in e else f"{'':6} {'':7}"
        print(f"{t:8.2f}  {name(tgt):5} {name(e['midi']):8} {e['cents']:5.0f}  {e['onsetType']:7} {level}  {verdict}{flags}")

    misses = [r for r in rows if r[3] == "FEHLER"]
    print()
    print(f"{sum(r[3] == 'Treffer' for r in rows)} Treffer, {len(misses)} Fehler, "
          f"{sum(r[3] == 'ignoriert' for r in rows)} ignoriert, {sum(r[3] == 'verpasst' for r in rows)} verpasst")
    print(f"davon Fehler auf einer leeren Saite: {sum(r[4] for r in misses)}")
    for (tgt, played), n in Counter((r[1], r[2]["midi"]) for r in misses).most_common():
        print(f"  {name(tgt)} gesucht, {name(played)} erkannt: {n}x")

    if misses:
        print("\nGenauer ansehen (Tonhöhe je Frame / Spektrum am Anschlag):")
        det = data.get("settings", {}).get("detection", {})
        hz = f" {det['minHz']:g} {det['maxHz']:g}" if "minHz" in det else ""
        for t, *_ in misses[:12]:
            print(f'  ft_wavtool pitch "{wav}" {max(0, t - 0.15):.2f} {t + 0.35:.2f}{hz}')
            print(f'  ft_wavtool spectrum "{wav}" {max(0, t - 0.05):.2f} {t + 0.15:.2f}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
