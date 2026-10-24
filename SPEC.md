# Fretboard Trainer – Spezifikation

Desktop-Anwendung zum Trainieren des Notenlesens auf Saiteninstrumenten. Das Instrument wird über ein Audio-Interface angeschlossen; die Anwendung zeigt Noten an, erkennt den gespielten Ton und bewertet ihn.

- **Plattformen:** Windows (zuerst), Linux; macOS später
- **Lizenz:** AGPLv3 (Open Source)

## 1. Technik-Stack

| Schicht | Technologie |
|---|---|
| Audio-Kern, DSP, Erkennung | C++20, JUCE 8 (WASAPI/DirectSound, ALSA/JACK/PipeWire) |
| Oberfläche | TypeScript + React im JUCE-WebView (WebView2 unter Windows, WebKitGTK unter Linux) |
| GP-Import, Notensatz | alphaTab (MPL-2.0) |
| Persistenz | SQLite |
| Build | CMake (Kern), Vite (UI) |

Kommunikation über die Native-Function-/Event-Bridge von JUCE 8 (siehe Abschnitt 9).

## 2. Konfiguration

- **Audio:** Treiber, Gerät, Eingangskanal, Eingangsverstärkung, Puffergröße, Mithören an/aus, Ausgangslautstärke
- **Noisegate:** Schwelle (dBFS), Attack, Hold, Release, Hysterese; Pegelanzeige. Tonhöhenanalyse nur bei offenem Gate.
- **Instrument:** Vorlagen Gitarre (6/7/8), Bass (4/5/6), Ukulele, Violine, Viola, Cello; eigene Instrumente möglich. Eigenschaften: Saitenzahl, bundiert/bundlos, Bundanzahl bzw. Lagenbereich.
- **Stimmung:** frei pro Saite; Vorlagen (Standard, Drop D, Eb, Drop C, B-Standard, …).
- **Schlüssel:** Violin-, Bass-, Alt-, Tenorschlüssel – frei wählbar, unabhängig vom Instrument; optional oktavierend (8vb).
- **Übungsbereich:** Saiten- und Bundbereich, aus dem Noten erzeugt werden.

## 3. Übungsmodell: drei Achsen

1. **Notenquelle:** Zufallsgenerator (adaptiv) · Guitar-Pro-Datei ohne Notenlängen · Guitar-Pro-Datei mit Notenlängen (Ultra)
2. **Schwierigkeitsgrad:** bestimmt Hilfen, Notenmaterial und Standard-Spielmodus
3. **Tempo:** Langsam (Ganze) · Mittel (Halbe) · Schnell (Viertel) · Sehr schnell (Achtel) bei einstellbarem BPM

### Schwierigkeitsgrade

| Stufe | Notensystem | Notenname | Griffbrett | Vorzeichen | HO/PO | Standard-Spielmodus |
|---|---|---|---|---|---|---|
| Sehr leicht | ✔ | ✔ | ✔ mit Griffposition | – | – | Warten |
| Leicht | ✔ | ✔ | – | – | – | Warten (Reaktionszeit zählt) |
| Mittel | ✔ | – | – | – | – | Weich getaktet (±¼ Schlag) |
| Schwer | ✔ | – | – | ✔ | – | Getaktet (mittlere Toleranz) |
| Sehr schwer | ✔ | – | – | ✔ | vereinzelt | Getaktet (enge Toleranz) |
| Ultra | ✔ mit Notenlängen | – | – | ✔ | ✔ | Rhythmus |

Bei GP-Dateien sind Vorzeichen und HO/PO durch das Lied vorgegeben; die Stufe steuert dort Hilfen und Spielmodus. Der Spielmodus kann manuell überschrieben werden.

### Spielmodi

- **Warten:** nächste Note erst nach korrektem Ton.
- **Getaktet:** Metronom; Noten fallen auf den Schlag, Bewertung innerhalb eines Toleranzfensters.
- **Rhythmus (Ultra):** echte Notenlängen aus der GP-Datei, mitlaufender Cursor, Tempo skalierbar (50–100 %).

## 4. Erkennung

- **Tonhöhe (live, monophon):** YIN bzw. McLeod Pitch Method; Fenster 2048–4096 Samples (tiefes H des Basses ≈ 31 Hz).
- **Anschlag:** Onset-Erkennung (spektraler Fluss + Hüllkurve).
- **Treffer:** stabile Tonhöhe über mehrere Frames; **Oktave muss stimmen**; Toleranz in Cent einstellbar.
- **Hammer-on/Pull-off:** Tonhöhenwechsel ohne Anschlags-Transient (Legato).
- **Akkorde (notengestützt):** Spektrum wird gegen harmonische Vorlagen der *erwarteten* Töne geprüft; Bewertung je Akkordton.

### Aufnahme und Nachanalyse

- Jeder Durchgang wird als rohes Eingangssignal verlustfrei mitgeschnitten.
- Offline-Analyse: pYIN mit Viterbi-Glättung, rückwirkende Onset-Bestimmung, Ausrichtung an der erwarteten Notenfolge per Dynamic Time Warping.
- Ergebnis korrigiert die Live-Bewertung („Live-Ergebnis“ → „Endwert“).
- Review-Ansicht: Wellenform + Noten, Fehler markiert, Stellen einzeln anhörbar.

## 5. Feedback und adaptives Lernen

- **Punkte:** Basispunkte × Timing-Genauigkeit × Combo × Stufenfaktor.
- **Statistik je Ton und Griffposition:** Trefferquote, Ø Reaktionszeit, Ø Timingfehler, Verwechslungen.
- **Fortschritt:** Verlauf je Instrument/Stufe; Heatmaps auf Griffbrett und Notensystem.
- **Adaptiv:** Zufallsgenerator gewichtet Noten nach Fehlerquote und Reaktionszeit (Spaced Repetition).
- **GP-Lieder:** Übungsmodus für Problemstellen (Takt-Schleife).

## 6. Guitar-Pro-Import

- Formate: .gp3, .gp4, .gp5, .gpx, .gp (via alphaTab)
- Spurauswahl; Stimmung und Schlüssel werden aus der Spur vorgeschlagen.
- Ohne Notenlängen: reine Tonfolge (Pausen entfallen), Spielmodus nach Stufe.
- Ultra: vollständiger Rhythmus inklusive Pausen und Tempoangaben.

## 7. Wiedergabe und Effekte

- Mithören des Instruments mit niedriger Latenz (Ziel < 10 ms Round-Trip).
- Metronom auf separatem Bus.
- Später: Effektkette (eigene Effekte, optional VST3-Hosting).

## 8. Architektur

```
[Audio-Interface] → Eingang (Kanal/Gain) → Noisegate ─┬→ [Effektkette] → Ausgang (Mithören + Metronom)
                                                      ├→ Recorder (Ringpuffer → Datei)
                                                      └→ Analyse-Thread (lock-free FIFO)
                                                           ├ Tonhöhe (YIN/MPM)
                                                           ├ Onset/Hüllkurve → Legato-Erkennung
                                                           └ NoteEvent {midi, cents, time, onsetType}
                                                                    ↓ Bridge
UI: Übungs-Engine ↔ Bewertung ↔ Notenansicht (alphaTab) / Griffbrett / Statistik
```

Regeln: Im Audio-Thread keine Allokationen, keine Locks, kein I/O.

## 9. Bridge-API (Entwurf)

**UI → Kern (Funktionen)**
- `getAudioDevices()`, `setAudioDevice(cfg)`
- `setInputGain(db)`, `setMonitoring(on, volumeDb)`
- `setNoiseGate({thresholdDb, attackMs, holdMs, releaseMs, hysteresisDb})`
- `setDetectionConfig({minHz, maxHz, centsTolerance})`
- `startRecording(sessionId)`, `stopRecording()`, `analyzeRecording(sessionId, expectedNotes)`
- `setMetronome({bpm, on, volumeDb})`

**Kern → UI (Events)**
- `level` {rmsDb, peakDb, gateOpen} – ca. 30 Hz
- `pitch` {hz, midi, cents, confidence} – kontinuierlich (Stimmgerät)
- `note` {midi, cents, timeMs, onsetType: "pick" | "legato"}
- `beat` {index, timeMs}
- `analysisDone` {sessionId, results}

## 10. Datenmodell (SQLite, Entwurf)

- `instrument`(id, name, strings, fretted, frets, tuning_json)
- `session`(id, started_at, instrument_id, difficulty, mode, tempo, source, gp_file, score)
- `attempt`(id, session_id, expected_midi, string, fret, played_midi, cents, reaction_ms, timing_ms, onset_type, correct, corrected_offline)
- `note_stats`(instrument_id, midi, string, fret, attempts, hits, avg_reaction_ms, avg_timing_ms, weight)

## 11. Phasen

1. Grundgerüst: CMake, JUCE-App mit WebView und Bridge, Geräteauswahl, Mithören, Noisegate, Pegelanzeige
2. Erkennung: YIN/MPM + Onset, Stimmgerät, Test-WAVs und automatische Tests
3. Übungs-Engine: Zufallsgenerator, Notenansicht, Stufen Sehr leicht–Mittel, Warte-Modus, Griffbrett, Instrumente, Stimmungen
4. Getaktete Modi: Metronom, Toleranzfenster, Punkte, Statistik, adaptive Auswahl
5. GP-Import ohne Notenlängen
6. Akkorde und HO/PO, Stufe Sehr schwer
7. Aufnahme und Offline-Analyse, Review-Ansicht
8. Ultra-Modus
9. Effekte
