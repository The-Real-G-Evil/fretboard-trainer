# Test-WAVs für die Tonerkennung

`ft_tests` prüft jede `<name>.wav` in diesem Ordner gegen die gleichnamige `<name>.txt`.

## Format der Erwartungsdatei

```
range 55 1500        # Tonumfang für die Erkennung (minHz maxHz)
40 pick 0.200        # MIDI-Note, Anschlagsart (pick | legato), Zeit in Sekunden
47 legato 0.600
```

Toleranz: ±20 ms für `pick`, ±60 ms für `legato`. Die Oktave muss stimmen.

## Vorhandene Dateien

Die Dateien `guitar_*` und `bass_*` sind synthetisch (additive Synthese gezupfter Saiten mit
Anschlagsgeräusch, Inharmonizität und Rauschteppich) und werden so erzeugt:

```bash
build/tests/Release/ft_wavtool generate tests/data
```

## Eigene Aufnahmen hinzufügen

1. Instrument trocken (ohne Effekte) als WAV aufnehmen – Mono oder Stereo (Kanal 1 wird
   genutzt), 16/24/32 Bit oder Float, 44,1–96 kHz.
2. Erkennung ansehen:
   ```bash
   build/tests/Release/ft_wavtool analyze tests/data/meine_aufnahme.wav 55 1500
   ```
3. Bei Fehlern hilft die Diagnose der Anschlagserkennung je 5-ms-Hop:
   ```bash
   build/tests/Release/ft_wavtool onsets tests/data/meine_aufnahme.wav 1.2 1.5
   ```
4. Die tatsächlich gespielten Noten als `meine_aufnahme.txt` daneben legen – ab dann ist
   die Aufnahme Teil der automatischen Tests.
