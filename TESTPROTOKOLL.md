# Testprotokoll Fretboard Trainer

Stand: Phasen 1–8 (Commit nach f19d070). Phase 9 (Effekte) wird nach ihrer Fertigstellung ergänzt.

## So wird das Protokoll benutzt

- Reihenfolge einhalten: Die Bereiche bauen aufeinander auf (Audio → Erkennung → Üben → Lieder → Auswertung).
- Je Testfall ankreuzen: **OK**, **Fehler** oder **n. g.** (nicht getestet). Bei Fehler kurz notieren, *was* passiert
  ist und *was* erwartet war; Screenshot hilft.
- **Priorität:** A = Grundfunktion, ohne sie ist die App nicht benutzbar · B = wichtig · C = Feinschliff.
- **📼 Diagnose:** Bei so markierten Fällen vor dem Start *Diagnose-Aufnahme* einschalten. Die Aufnahme liegt danach
  unter `Dokumente/Fretboard Trainer/Diagnose/` (.wav + .json). Mit diesen Daten werden Schwellen der Erkennung
  abgestimmt – bitte den Dateinamen im Feld *Notiz* eintragen.
- Bei Fehlern, die die Erkennung betreffen (falscher Ton, Ton nicht erkannt, doppelt erkannt): wenn möglich mit
  Diagnose-Aufnahme wiederholen.

**Testumgebung** (einmal ausfüllen)

| | |
|---|---|
| Datum | |
| Audio-Interface / Treiber (ASIO?) | |
| Puffergröße / Abtastrate | |
| Instrument(e) und Stimmung | |
| Soundfont | |

---

## 1. Audio und Grundlagen

### T-1.1 Gerät und Mithören (A)
1. *Einstellungen → Audio & Erkennung*: Gerät, Eingang, Ausgang wählen.
2. Instrument spielen, Mithören an/aus, Lautstärke ändern.

Erwartet: Instrument ist ohne hörbare Verzögerung zu hören; Pegelanzeige reagiert; Einstellungen bleiben nach Neustart erhalten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.2 Noisegate (B)
1. Nicht spielen, Gate-Schwelle so einstellen, dass das Grundrauschen geschlossen ist.
2. Leise und laut spielen.

Erwartet: Gate öffnet bei jedem Anschlag, schließt in der Pause; kein Flattern.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.3 Stimmgerät (A)
1. Seite *Stimmgerät*, jede Saite einzeln anschlagen, dann eine Saite bewusst verstimmen.

Erwartet: richtiger Ton mit Oktave; Cent-Anzeige ruhig und plausibel; Verstimmung wird angezeigt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-1.4 Kalibrierung (B)
1. Hinweis *Kalibrierung* öffnen, Grundrauschen messen.
2. Mindestens eine Übung aufnehmen, danach *Optimieren*.

Erwartet: Aufnahmen werden bewertet; Optimierung läuft durch und zeigt das Ergebnis; neue Werte gelten sofort.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 2. Üben mit Zufallsnoten

### T-2.1 Warte-Modus, Stufe Sehr leicht (A)
1. Stufe *Sehr leicht*, Quelle *Zufall*, Spielmodus *Nach Stufe*, *Start*.
2. 20 Noten spielen, dazwischen absichtlich 3 falsche Töne und 1 falsche Oktave.

Erwartet: Griffstelle mit Finger auf dem Griffbrett; nächste Note erst nach dem richtigen Ton; falsche Töne als Fehler, falsche Oktave mit Hinweis.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.2 Getaktet, Stufe Mittel (A)
1. Stufe *Mittel*, Tempo *Mittel*, 70 BPM, *Start*.
2. Eine Minute auf den Schlag spielen, einmal deutlich zu früh, einmal eine Note auslassen.

Erwartet: Vorzähler; Zeitleiste läuft; Treffer mit Abweichung in ms; *zu früh* und *verpasst* werden erkannt; Tendenz plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.3 Timing-Ausgleich (B)
1. Wie T-2.2. Werden alle Treffer gleich als „zu spät“ gewertet, Timing-Ausgleich anpassen.

Erwartet: Nach dem Ausgleich liegen genaue Anschläge bei ±20 ms.

- [ ] OK  [ ] Fehler  [ ] n. g. — Wert: ____ ms — Notiz:

### T-2.4 Vorzeichen, Stufe Schwer (B)
1. Stufe *Schwer*, getaktet. Töne mit ♯ und ♭ spielen.

Erwartet: Vorzeichen im System richtig; enharmonische Schreibweise (z. B. G♯/A♭) wird beide Male als richtig erkannt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.5 Hammer-on/Pull-off, Stufe Sehr schwer 📼 (A)
1. Diagnose-Aufnahme an. Stufe *Sehr schwer*, Warte-Modus.
2. Gebundene Noten (H/P-Bogen) gebunden spielen; zweimal absichtlich anschlagen statt binden.

Erwartet: gebunden gespielte Noten zählen voll; angeschlagen statt gebunden: Treffer mit Hinweis und halben Punkten; keine Doppel-Erkennung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-2.6 Lautstärke bewerten (C)
1. *Lautstärke bewerten* an, Fenster ±6 dB, Warte-Modus, 30 Noten gleichmäßig, dann einige deutlich lauter/leiser.

Erwartet: Abweichungen werden angezeigt; außerhalb des Fensters ¾ der Punkte; *automatisch enger* verkleinert das Fenster nach einem guten Durchgang.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-2.7 Adaptiv (C)
1. Mehrere Durchgänge mit *Adaptiv*; einen Ton absichtlich oft falsch spielen.

Erwartet: dieser Ton kommt in späteren Durchgängen spürbar öfter.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 3. Tonleiter-Trainer

### T-3.1 Auswahl und Anzeige (A)
1. Quelle *Tonleiter*, Grundton A, *Moll-Pentatonik*, Umfang 1 Oktave.
2. Danach F-Dur und D-Dur wählen.

Erwartet: Tonnamen richtig (A C D E G; F-Dur mit B; D-Dur mit F♯ und C♯); Griffbrett zeigt alle Leitertöne im Übungsbereich, Grundton hervorgehoben.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-3.2 Auf und ab, Griffstellen (A)
1. *Auf und ab*, Wiederholen an, Übungsbereich z. B. Bund 5–8, Warte-Modus *Sehr leicht*.

Erwartet: Tonfolge aufwärts und wieder abwärts, Grundton beim Wiederholen nicht doppelt; Griffstellen in einer Lage ohne unnötige Sprünge.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-3.3 Zufällige Reihenfolge, getaktet (B)
1. Reihenfolge *zufällig*, Spielmodus *Getaktet*.

Erwartet: nur Leitertöne, Schreibweise passend zur Tonart; Statistik zeigt den Durchgang als „Tonleiter …“.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 4. Lieder (Guitar Pro) ohne Notenlängen

### T-4.1 Laden und Spurwahl (A)
1. *Lied öffnen …* mit einer .gp5/.gpx-Datei; Spur wechseln; App neu starten.

Erwartet: Lied wird geladen; passende Spur zum Instrument vorgeschlagen; zuletzt geöffneter Ordner und Liste „zuletzt geöffnet“ bleiben nach Neustart.

- [ ] OK  [ ] Fehler  [ ] n. g. — Datei: — Notiz:

### T-4.2 Tonfolge mit Akkorden, Warte-Modus 📼 (A)
1. Diagnose-Aufnahme an. Lied mit Akkorden, Warte-Modus, Stufe *Mittel*.
2. Akkorde vollständig spielen; einmal einen Akkordton auslassen; einmal geschlagen (Strumming) spielen.

Erwartet: Akkord als Notenstapel mit Akkordsymbol und Griff; vollständig = Treffer; ein fehlender Ton bei *Mittel* noch Treffer mit „x von y Tönen“; zwei fehlende = „Akkord unvollständig – es fehlt …“; Strumming zählt als ein Anschlag.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-4.3 Problemstellen (C)
1. Mehrere Durchgänge mit einem Lied; danach die vorgeschlagenen Problemstellen anklicken.

Erwartet: schwache Takte werden genannt; Klick setzt den Taktbereich mit Takt davor/danach.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 5. Song-Modus (Wiedergabe mit Notenlängen)

### T-5.1 Wiedergabe und Mischpult (A)
1. Spielmodus *Lied mitspielen*, *Start*, *▶ Wiedergabe*.
2. Spuren stumm/solo schalten, Lautstärken ändern, Übungsspur wechseln.

Erwartet: alle Spuren über das Audio-Interface hörbar; Cursor und Autoscroll laufen mit; Mischpult wirkt sofort; Spurwechsel ohne Unterbrechung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.2 Bewertung beim Mitspielen (A)
1. Einen Abschnitt mitspielen, einige Noten bewusst auslassen.

Erwartet: Treffer mit ms-Abweichung, ausgelassene als *Verpasst*; Abweichungen plausibel (sonst Timing-Ausgleich prüfen).

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.3 Bedienung: Stop, Takt vor/zurück, Bereich (B)
1. *Stop*, *◀ Takt*/*Takt ▶* mehrfach, grünen und roten Balken ziehen bzw. per Button setzen, *Ganzes Lied*.

Erwartet: Stop springt an den Bereichsanfang, Knopf zeigt wieder *Wiedergabe*; Takt-Sprünge summieren sich; Bereich wirkt sofort, Ansicht springt nicht.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.4 Tempo während der Wiedergabe (A)
1. Wiedergabe starten, Tempo mit −/+ und Schieber ändern (z. B. 60 % → 85 %).

Erwartet: Lied läuft ohne Unterbrechung im neuen Tempo weiter; BPM-Anzeige stimmt; Bewertung bleibt plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.5 Tempo steigern (A)
1. Bereich von 2–4 Takten, *Wiederholen* endlos, Tempo 60 %, *Tempo steigern* an (+5 %, ab 90 % Treffer, bis 100 %).
2. Mehrere Durchläufe gut spielen, einen absichtlich schlecht.

Erwartet: nach guten Durchläufen +5 % mit Meldung; nach dem schlechten bleibt das Tempo; bei 100 % „Zieltempo erreicht“.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.6 Lied wartet auf dich (A)
1. Spielmodus *Lied wartet auf dich*, auch Stellen mit Akkorden.

Erwartet: Wiedergabe hält an jeder eigenen Note bzw. jedem Akkord, läuft nach dem richtigen Ton/Akkord weiter; Einzeltöne am Akkord lösen nichts aus.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-5.7 Metronom und Soundfont (C)
1. Metronom an/aus, Lautstärke ändern; eigenen Soundfont wählen, App neu starten.

Erwartet: Metronom und Vorzähler in der eingestellten Lautstärke; Soundfont bleibt nach Neustart gewählt.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 6. Stufe Ultra und Rhythmus

### T-6.1 Rhythmus-Übung erzeugen (A)
1. Stufe *Ultra*, Quelle *Zufall*, Rhythmus *einfach*, 8 Takte, 60 BPM, *Start*.
2. *Beenden*, Rhythmus *mittel* und *schwer* je einmal starten.

Erwartet: Spielmodus springt auf *Rhythmus (Notenlängen)*; Noten und Tab mit passenden Notenwerten (einfach: Ganze/Halbe/Viertel; mittel: + Achtel, Pausen; schwer: + Sechzehntel, Punktierungen); jeder Start erzeugt eine neue Übung.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.2 Rhythmus spielen 📼 (A)
1. Diagnose-Aufnahme an. Übung *mittel* mit Vorzähler mitspielen.

Erwartet: Bewertung jeder Note im engen Fenster (±0,08 Viertel); Pausen werden nicht als verpasst gewertet; Tempo und *Tempo steigern* funktionieren wie im Song-Modus.

- [ ] OK  [ ] Fehler  [ ] n. g. — Diagnose-Datei: — Notiz:

### T-6.3 Rhythmus mit Tonleiter (B)
1. Quelle *Tonleiter* (z. B. A Moll-Pentatonik, auf und ab), Spielmodus *Rhythmus*.

Erwartet: Tonleiter in Reihenfolge mit Rhythmus; Statistik zeigt „Rhythmus“ mit der Tonleiter.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-6.4 Ultra mit Lied (B)
1. Stufe *Ultra*, Quelle *Lied*.

Erwartet: Standard-Spielmodus *Lied mitspielen*; Fenster enger als bei *Sehr schwer*.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 7. Nachanalyse und Review

### T-7.1 Endwert nach dem Durchgang (A)
1. Einen getakteten Durchgang (1–2 min) spielen, *Beenden*.

Erwartet: „Nachanalyse der Aufnahme läuft …“, danach „Live x % → Endwert y %“ innerhalb weniger Sekunden; Werte plausibel.

- [ ] OK  [ ] Fehler  [ ] n. g. — Live: ___ % Endwert: ___ % — Notiz:

### T-7.2 Schnelle Passage (A)
1. Getaktet, Tempo *Sehr schnell* (Achtel) oder ein schnelles Lied, bis die Live-Erkennung Noten verpasst.

Erwartet: Endwert erkennt mehr gespielte Noten als live (Endwert ≥ Live bei sauberem Spiel).

- [ ] OK  [ ] Fehler  [ ] n. g. — Live: ___ % Endwert: ___ % — Notiz:

### T-7.3 Review ansehen und anhören (A)
1. *Review ansehen*; auf Markierungen und Zeilen klicken; *nur Fehler* aus- und einschalten.

Erwartet: Wellenform mit farbigen Markierungen (grün/gelb/rot/grau) und erkannten Noten darunter; Klick spielt die Stelle über das Audio-Interface ab; *Stopp* beendet die Wiedergabe.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-7.4 Review aus der Statistik (B)
1. *Statistik → Letzte Durchgänge*, auf einen Endwert klicken.

Erwartet: Review des Durchgangs öffnet sich; ältere Durchgänge (ab dem 26.) haben keine Aufnahme mehr.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 8. Statistik und Einstellungen

### T-8.1 Statistik (B)
1. *Statistik* öffnen, Heatmaps, Verwechslungen und Durchgänge ansehen.

Erwartet: Durchgänge aller Modi erscheinen (warten, getaktet, Lied, Rhythmus, Tonleiter) mit Quote, Endwert und Dauer; Heatmap passt zum Gespielten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.2 Einstellungen bleiben erhalten (B)
1. Stufe, Quelle, Tonleiter, Rhythmus-Einstellungen, Song-Tempo, Tempo steigern, Mischpult, Stimmung ändern; App neu starten.

Erwartet: alles ist wie vor dem Neustart.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

### T-8.3 Stimmung und Instrument (B)
1. Instrument wechseln (Gitarre ↔ Bass), Stimmung z. B. Drop D, ein Lied in anderer Stimmung laden.

Erwartet: Übungsbereich und Erkennung passen sich an; *Stimmung übernehmen* wird angeboten.

- [ ] OK  [ ] Fehler  [ ] n. g. — Notiz:

---

## 9. Effekte (Phase 9)

Wird nach Fertigstellung von Phase 9 ergänzt.

---

## Zusammenfassung

| Bereich | OK | Fehler | n. g. |
|---|---|---|---|
| 1 Audio und Grundlagen | | | |
| 2 Zufallsnoten | | | |
| 3 Tonleiter | | | |
| 4 Lieder ohne Notenlängen | | | |
| 5 Song-Modus | | | |
| 6 Ultra und Rhythmus | | | |
| 7 Nachanalyse und Review | | | |
| 8 Statistik und Einstellungen | | | |

Diagnose-Aufnahmen: 

Weitere Beobachtungen:
