# Fretboard Trainer

Desktop-Anwendung zum Trainieren des Notenlesens auf Saiteninstrumenten. Das Instrument wird über ein Audio-Interface angeschlossen; die App zeigt Noten an, erkennt den gespielten Ton und bewertet ihn.

Die vollständige Spezifikation steht in [SPEC.md](SPEC.md).

**Stand:** Version **00.00.02** (zweite interne Version) – alle Phasen 1–9 der SPEC umgesetzt: Audio, Tonerkennung, Stimmgerät, Kalibrierung, Üben (Zufall, Tonleitern, Lieder), getaktete Modi, Statistik, Akkorde und Hammer-on/Pull-off, Song-Modus mit Wiedergabe, Spielmodus Rhythmus, Aufnahme mit Nachanalyse und Review, Effekte und VST3-Plugins.

Für Anwender: [ANLEITUNG.md](ANLEITUNG.md). Kurse erstellen: [MODULE.md](MODULE.md). Zum Testen: [TESTPROTOKOLL.md](TESTPROTOKOLL.md).

**Kurse (Module):** Seite *Kurse* – Übungsreihen aus Ordnern (Standard `Dokumente\Fretboard Trainer\Module`, weitere
Ordner frei hinzufügbar). Ein Kurs ist ein Ordner mit `module.json` und Übungsdateien (Guitar Pro oder alphaTex);
Fortschritt je Übung in der Statistik (Quelle `course`). Format: [MODULE.md](MODULE.md).

**Versionen** haben die Form **VV.BB.II** – VV = öffentliche Releases, BB = Beta-Releases, II = interne Releases. Die
Version steht in `CMakeLists.txt` (`FT_VERSION_LABEL`, dazu die numerische Form im `project()`-Aufruf) und erscheint in
der App oben rechts.

## Aufbau

```
CMakeLists.txt
cmake/        Hilfsskripte (UI-Build einbetten)
src/app/      JUCEApplication, MainWindow, WebView + Bridge, Einstellungen
src/audio/    AudioEngine, NoiseGate, LevelMeter, Analyse (PitchDetector, OnsetDetector,
              NoteTracker, Analyzer, AnalysisWorker)
tests/        Catch2-Tests, Testsignal-Synthese, WAV-Ein-/Ausgabe
tests/data/   Test-WAVs mit erwarteten Noten (siehe tests/data/README.md)
tools/        ft_wavtool: Test-WAVs erzeugen, Aufnahmen analysieren
ui/           Vite + React + TypeScript
```

## Tonerkennung

- **Tonhöhe:** YIN mit FFT-Kreuzkorrelation. Das Analysefenster richtet sich nach dem tiefsten
  Ton (Einstellungen → Tonerkennung): 55 Hz → 2048 Samples (43 ms bei 48 kHz),
  28 Hz (tiefes H des Basses) → 4096 Samples (85 ms).
- **Anschlag:** spektraler Fluss + Hüllkurve, Zeitpunkt auf ~1 ms genau. Ein Tonwechsel ohne
  Anschlag wird als `legato` (Hammer-on/Pull-off) gemeldet.
- **Latenz** vom Anschlag bis zur Note (synthetische Signale, 48 kHz): Gitarre ~55 ms,
  Legato ~30 ms, Bass bis tiefes H ~100 ms.
- Analysiert wird in einem eigenen Thread; der Audio-Thread reicht das Signal nur lock-frei weiter.

```bash
build/tests/Release/ft_wavtool analyze aufnahme.wav 55 1500
```

## Üben (Phase 3)

Reiter *Üben*: Die App zeigt eine Note im Notensystem (plus drei kommende); die nächste erscheint
erst, wenn der richtige Ton erkannt wurde – die Oktave muss stimmen (Warte-Modus). Gemessen
werden Treffer, Fehler, Reaktionszeit und Serie.

| Stufe | Notenname | Griffbrett |
|---|---|---|
| Sehr leicht | ✔ | Griffstelle mit Finger (ein Finger pro Bund: Bund 1–4 → 1–4, ab Bund 5 wieder 1–4; leer = 0), Tonnamen dezent |
| Leicht | ✔ | nur Tonnamen aller Bünde als Nachschlagehilfe, ohne Markierung |
| Mittel | – | – |
| Schwer | – | – |
| Hammer-ons und Pull-offs | – | – |

Bis „Mittel“ kommen nur Stammtöne vor, ab „Schwer“ auch Töne mit Vorzeichen – zufällig als ♯ oder ♭
notiert (deutsch: B♭ = B), damit beide Schreibweisen geübt werden. Ohne Tonart steht das Vorzeichen direkt
vor der Note. Auf „Hammer-ons und Pull-offs“ folgt auf eine angeschlagene Note ab und zu (25 %) eine gebundene auf
derselben Saite, 1–4 Bünde höher (Hammer-on) oder tiefer (Pull-off, auch auf die leere Saite); im
Notensystem mit Bindebogen und H/P. Erwartet wird ein Legato-Ton ohne neuen Anschlag – angeschlagen zählt
der Ton, bringt aber nur die halben Punkte. Getaktet mit engem Fenster (±0,1 Schlag), Stufenfaktor 2,5.

**Spielmodus** (Standard: folgt der Stufe, manuell umschaltbar):

- *Warten* (Sehr leicht, Leicht): nächste Note erst nach dem richtigen Ton; Punkte nach Reaktionszeit.
- *Getaktet* (Mittel, Schwer): Metronom mit Vorzähler (4 Schläge), jede Note fällt auf einen festen Zeitpunkt
  und wird innerhalb von ±¼ Schlag (Schwer: ±0,15 Schlag) bewertet. Tempo Langsam (Ganze), Mittel (Halbe), Schnell (Viertel),
  Sehr schnell (Achtel) bei einstellbarem BPM. Eine Zeitleiste zeigt, wann die nächste Note fällig ist.

Punkte = 100 × Timing-Genauigkeit (0,5–1) × Combo (+5 % je Treffer in Folge, max. ×2) × Stufenfaktor
(1 / 1,25 / 1,5 / 2 / 2,5). Im getakteten Modus zeigt die Statistik außerdem die mittlere Abweichung und ob du
eher zu früh oder zu spät spielst.

Metronom-Schläge und erkannte Töne tragen Zeitstempel auf derselben Sample-Uhr des Audio-Kerns; die
Latenz des Treibers wird ausgeglichen, zusätzlich gibt es einen einstellbaren *Timing-Ausgleich*. Unter *Übungsbereich & Stimmung* lassen sich je Instrument
Stimmung (Vorlagen wie Drop D, Es, D-Standard, Drop C, H-Standard, DADGAD, Open G, BEAD oder frei
pro Saite), Schlüssel (Violin-, Bass-, Alt-, Tenorschlüssel, Violin/Bass auch oktavierend 8vb) sowie
Saiten- und Bundbereich wählen. Die Stimmung gilt auch für Kalibrierung, Griffbrett und den
Standard-Tonbereich der Erkennung. Gespeichert wird alles im Kern (`settings.xml`).

Die Notenschrift ist Noto Music (SIL Open Font License); Notensatz für Guitar-Pro-Dateien folgt
mit alphaTab in Phase 5.

UI-Tests (Musiklogik, Generator, Warte-Modus):

```bash
cd ui && npm test
```

## Tonleitern

Notenquelle *Tonleiter* (Umschalter auf der Übungsseite): Grundton und Tonleiter wählen (Dur, Moll
natürlich/harmonisch/melodisch, Dur- und Moll-Pentatonik, Blues, die Kirchentonarten, chromatisch).
Gespielt wird im Übungsbereich, ab dem tiefsten Grundton über 1–3 Oktaven oder so weit der Bereich
reicht, *auf und ab*, *aufwärts*, *abwärts* oder *zufällig* (dann auch adaptiv); *Wiederholen* läuft
endlos. Die Griffstellen wählt die App so, dass möglichst in einer Lage gespielt wird; Vorzeichen stehen
nach der Tonart (F-Dur mit B, D-Dur mit F♯). Das Griffbrett zeigt alle Leitertöne im Bereich, den Grundton
hervorgehoben. Warten und getaktet funktionieren wie beim Zufall; die Statistik merkt sich die Tonleiter.

## Akkorde (Phase 6)

Erwartet die Übung mehrere Töne gleichzeitig, prüft der Kern nach jedem Anschlag je Akkordton, ob er neu
angeschlagen wurde: Vorlage aus den Teiltönen 1–6 des Tons, ohne die, die mit Teiltönen anderer
Akkordtöne zusammenfallen; gemessen wird die durch den Anschlag neu entstandene Energie (Fenster vor
gegen nach dem Anschlag, 85–170 ms je nach Abstand der Akkordtöne). Saiten, die nur nachklingen, zählen
nicht; ein geschlagener Akkord (Saiten kurz nacheinander) zählt als ein Anschlag. Oktavverdopplungen
(z. B. das hohe E im offenen E-Dur) lassen sich so nicht einzeln prüfen und zählen nicht mit. Das Ergebnis
kommt etwa 150 ms nach dem Anschlag als `chord`-Event.

Bewertet wird je Akkordton: bis *Leicht* genügt die Hälfte der Akkordtöne, bei *Mittel* darf einer
fehlen (ab drei Tönen), darüber müssen alle klingen; die Punkte gibt es anteilig. Fehlende Töne nennt die
Rückmeldung. Das gilt im Song-Modus und in der Tonfolge eines Lieds (getaktet); dort steht der
Akkord als Notenstapel mit Akkordsymbol (z. B. Am, E5, G7, C/E) im System und als Griff auf dem Griffbrett.

## Lieder (Guitar Pro, Phase 5)

Notenquelle *Zufall*, *Tonleiter* oder *Lied* (Umschalter auf der Übungsseite). *Lied öffnen …* (startet im zuletzt benutzten Ordner) liest .gp, .gpx,
.gp5, .gp4 und .gp3 (über alphaTab, erst beim ersten Lied nachgeladen); die letzten 8 Lieder stehen in
einer Liste und werden beim Start wieder geladen. Die Spur wählt die App passend zum Instrument (gleiche
Stimmung, sonst gleiche Saitenzahl, dann der Name, z. B. „Bass“) und stellt sie beim Instrumentwechsel
um; frei wählbar sind Spur und Taktbereich, *Wiederholen*
beginnt am Ende des Bereichs von vorn (zum Üben schwieriger Stellen).

Geübt wird die reine Tonfolge der Spur (ohne Notenlängen): Pausen, Bindebogen-Fortsetzungen und Dead
Notes entfallen, Akkorde werden je Akkordton bewertet (siehe Akkorde). Vorzeichen stehen wie im Lied (ausdrücklich
oder nach der Tonart des Takts). Ist die Spur für eine andere Stimmung geschrieben, schlägt die App die
Stimmung der Spur vor (*Stimmung übernehmen*); sonst bestimmt sie die Griffstellen selbst (tiefster
Bund), Töne außerhalb des Instruments entfallen. Beide Spielmodi und alle Stufen funktionieren mit
Liedern; die Statistik merkt sich das Lied je Durchgang.

Getaktet läuft das Metronom im *Liedtempo* (Tempo am Anfang des gewählten Taktbereichs, wählbar 50–100 %)
oder mit eigenem BPM. Jeder Versuch speichert seinen Takt: Eine Leiste mit allen Takten zeigt die
Trefferquote aus allen Durchgängen mit diesem Lied und dieser Spur (Klick = diesen Takt in Schleife
üben), darunter die *Problemstellen* (mindestens 3 Versuche, unter 90 %, schwächste zuerst; Klick = mit
dem Takt davor und danach in Schleife üben). Ohne Kern (Browser-Vorschau) öffnet *Lied
öffnen …* ein eingebautes Beispiel-Lied.

### Song-Modus (Wiedergabe mit Notenlängen)

Mit einem Lied gibt es zwei weitere Spielmodi: Das Lied wird mit allen Spuren wiedergegeben, Noten und
Tabulatur der eigenen Spur laufen mit Cursor mit. Die Wiedergabe läuft im Audio-Kern (SongPlayer mit
TinySoundFont, Soundfont Sonivox) über das Audio-Gerät der App – zusammen mit
Mithören und Metronom und auf derselben Stream-Uhr wie die Erkennung; die Latenz des Treibers wird beim
Bewerten ausgeglichen. alphaTab liefert nur die MIDI-Daten und den Notensatz, sein Cursor folgt der
Position des Kerns; die Notenzeile mit dem Cursor steht immer oben im Notenfenster (Autoscroll).

Übungsbereich im Song-Modus: ein **grüner Balken** (Start) und ein **roter Balken** (Ende) in der
Notenansicht, an Taktgrenzen eingerastet und per Ziehen verschiebbar. *Start setzen* / *Ende setzen*: der
Balken folgt danach dem Mauszeiger über den Noten, ein Klick setzt ihn (Esc bricht ab) – so muss man nicht
erst zum Ende scrollen. *Ganzes Lied* setzt den Bereich zurück. *Wiederholen* mit Anzahl der Durchläufe
(2×–10× oder endlos). Änderungen gelten sofort, auch während der Wiedergabe (außerhalb des neuen Bereichs
springt sie an dessen Anfang).

Neben Wiedergabe/Pause: *Stop* (beendet die Wiedergabe, zurück an den Anfang des Bereichs) sowie *◀ Takt* und
*Takt ▶* (je ein Takt in Wiedergabe-Reihenfolge, mehrere Klicks summieren sich; auch während der Wiedergabe).

*Klang der Liedwiedergabe* (Einstellungen → Audio & Erkennung): eingebauter Soundfont Sonivox (1,3 MB,
einfacher Klang) oder eine eigene **.sf2**-Datei (z. B. GeneralUser GS, FluidR3_GM, MuseScore_General; .sf3
wird nicht unterstützt). Die Wahl gilt sofort, auch während ein Lied läuft, und wird gespeichert. Metronom zuschaltbar (Lautstärke auch für den Vorzähler); Taktbereich und *Wiederholen* gelten auch hier. Unter den
Noten liegt ein Mischpult wie in Guitar Pro: jede Spur mit Stumm (M), Solo (S) und Lautstärke (0–150 %,
wirkt sofort; je Lied gespeichert, die eigene Spur anfangs leise). Ein Klick auf einen Spurnamen macht sie
zur Übungsspur: Noten und Tabulatur zeigen dann diese Spur, die Wiedergabe läuft ohne Unterbrechung weiter
und bewertet wird ab der aktuellen Stelle (Töne außerhalb des eigenen Instruments werden nicht erwartet).
Verweise auf fehlende Akkord-Diagramme in GPX-Dateien werden beim Einlesen entfernt (sonst bliebe das
Notenbild leer). Wiederholungszeichen und Tempowechsel des Lieds werden befolgt.

- *Lied mitspielen*: nach dem Vorzähler läuft das Lied durch; jede Note der eigenen Spur wird mit ihrer
  echten Länge und Position im Toleranzfenster bewertet (Mittel ±¼, Schwer ±0,15 Viertel), Akkorde je
  Akkordton. Abgleich über die Stream-Uhr des Kerns (`getStreamTime`), Rest über den
  *Timing-Ausgleich*.
- *Lied wartet auf dich*: die Wiedergabe hält an jeder Note der eigenen Spur, bis sie gespielt ist (bis
  zu einer Viertel früher zählt auch). Der Kern hält sample-genau vor der Note; die Oberfläche gibt sie frei.

**Tempo:** 20–150 % des Liedtempos in 5er-Schritten (Schieber oder −/+, mit BPM-Anzeige), auch während der
Wiedergabe – das Lied läuft ohne Unterbrechung im neuen Tempo weiter, die Bewertung rechnet mit. *Tempo
steigern*: nach jedem Durchlauf mit mindestens 80/90/95/100 % Treffern wird das Tempo um 2/5/10 % erhöht,
bis zum Zieltempo (am besten zusammen mit *Wiederholen* auf einem Taktbereich) – langsam anfangen und
steigern. Die Rückmeldung nennt Trefferquote und neues Tempo.

## Spielmodus Rhythmus (Phase 8)

Mit Zufall und Tonleiter lässt sich auf jeder Stufe der Spielmodus **Rhythmus (Notenlängen)** wählen
(die frühere Stufe *Ultra* ist entfallen; gespeicherte Einstellungen und Statistik-Einträge mit „Ultra“
gelten als „Hammer-ons und Pull-offs“):

- Je Start erzeugt die App eine Übung aus der Notenquelle mit echten Notenlängen und Pausen, 4, 8 oder 16
  Takte im 4/4-Takt. *Rhythmus einfach*: Ganze, Halbe, Viertel; *mittel*: dazu Achtel, punktierte Halbe,
  Pausen; *schwer*: dazu Sechzehntel, punktierte Viertel, Synkopen. Gebundene Töne (Stufe „Hammer-ons und Pull-offs“)
  stehen als H/P-Bogen in den Noten.
- Gespielt wird wie ein Lied im Song-Modus: Noten und Tabulatur mit mitlaufendem Cursor, Vorzähler,
  Metronom, Wiedergabe der eigenen Stimme leise zur Orientierung (Mischpult), Tempo und *Tempo steigern*,
  Taktbereich und Wiederholen, Bewertung jeder Note im Zeitfenster, Nachanalyse und Review.
- Tempo bei 100 % = eingestellte BPM. Die Statistik führt die Durchgänge als *Rhythmus*.

## Statistik und adaptive Auswahl

Jeder Übungsdurchgang und jeder Versuch (Treffer, falscher Ton, zu früh, verpasst) wird in
`stats.sqlite` im Datenordner gespeichert – Tabellen `session`, `attempt` und `note_stats` wie in
SPEC Abschnitt 10. Die Griffposition wird nur gespeichert, wenn sie angezeigt wurde (Stufe „Sehr
leicht“). SQLite wird als gemeinfreie Amalgamation (3.54.1) beim Konfigurieren geladen.

Reiter *Statistik* (je Instrument): Durchgänge, Übungszeit, Trefferquote und Punkte; Töne mit
Quote, Reaktionszeit und Timing, schwächste zuerst; häufigste Verwechslungen; letzte Durchgänge. Heatmaps zeigen die Trefferquote je Ton auf dem
Griffbrett (rot → gelb → grün, grau = noch nicht geübt) und im Notensystem von tief nach hoch.

*Adaptiv* (Schalter auf der Übungsseite, Standard an): Töne kommen umso öfter, je höher ihre
Fehlerquote, je langsamer die Reaktion bzw. je ungenauer das Timing und je länger sie nicht geübt
wurden; noch unbekannte Töne kommen anfangs ebenfalls häufiger.

**Oktavprüfung beim Üben:** Klingt der vorige Ton nach, wiederholt sich das Signal oft erst im
gemeinsamen Grundmuster beider Töne – eine Oktave unter dem neuen Ton. Da beim Üben bekannt ist,
welcher Ton erwartet wird, prüft der Kern bei einer Abweichung um ganze Oktaven das Spektrum und
korrigiert, wenn der erwartete Grundton klar vorhanden ist. Eine wirklich falsch gespielte Oktave
bleibt ein Fehler.

**Lautstärke bewerten** (Schalter auf der Übungsseite, beide Spielmodi): Wie gleichmäßig sind die
Anschläge? Bezug ist der Median der letzten 8 Treffer im Durchgang (die ersten 3 Treffer werden nicht
bewertet). Liegt ein Treffer außerhalb des Fensters (±10 … ±2 dB, Standard ±6), gibt es ¾ der Punkte,
aber keinen Fehler; die Rückmeldung zeigt Abweichung und Lage im Fenster. *Automatisch enger*: nach
einem Durchgang mit mindestens 20 bewerteten Treffern, davon 80 % im Fenster, das nächstengere
Fenster. Die Statistik zeigt je Durchgang den Anteil im Fenster und die Streuung, je Ton die mittlere
Abweichung (zeigt z. B. Saiten, die über den Tonabnehmer lauter klingen).

Leise Fehlerkennungen: Ein falscher Ton, der mehr als 15 dB leiser ist als der Median der letzten
Anschläge, zählt nicht als Fehler – das sind mitschwingende Saiten oder Griffgeräusche, kein Anschlag.
Der Zielton zählt auch leise (außer er ist erst durch die Korrektur anhand des Zieltons entstanden).

## Effekte (Phase 9)

Seite *Effekte*: eine Effektkette für das Mithören in fester Reihenfolge – **Kompressor** (Schwelle,
Verhältnis, Attack, Release, Aufholen) → **Verzerrung** (Overdrive weich, Distortion asymmetrisch, Fuzz hart;
Gain, Ton, Pegel, Clean-Anteil für den Bass) → **Equalizer** (Bässe 100 Hz, Mitten mit einstellbarer
Frequenz, Höhen 3 kHz) → **Chorus** (stereo) → **Delay** → **Hall** (stereo, Freeverb). Jeder Effekt lässt
sich einzeln schalten; Umschalten blendet weich, Delay und Hall klingen nach dem Ausschalten aus. Kein Effekt
fügt Latenz hinzu. Eingebaute Presets (Trocken, Clean mit Hall, Crunch, Lead, Ambient, Bass clean, Bass Drive)
und eigene Presets unter einem Namen; die aktuelle Einstellung bleibt nach dem Neustart erhalten.

Die Effekte wirken **nur auf das Mithören**: Tonerkennung, Aufnahme und Nachanalyse bekommen weiterhin das
unbearbeitete Eingangssignal, Liedwiedergabe und Metronom bleiben unverändert.

**VST3-Plugins** (z. B. Guitar Rig, Phasis, Replika): *Plugins suchen* durchsucht die üblichen VST3-Ordner
(`C:\Program Files\Common Files\VST3`) im Hintergrund; die Liste wird gespeichert (`<Datenordner>/plugins.xml`),
ein Plugin, das die Suche abstürzen lässt, kommt auf die Sperrliste. Gefundene Effekt-Plugins (keine Instrumente)
lassen sich in eine Kette nach den eigenen Effekten einsetzen, verschieben, schalten und entfernen; *Oberfläche*
öffnet das Plugin in einem eigenen Fenster. Kette und Zustand jedes Plugins (sein Preset) werden in
`<Datenordner>/plugin-rack.json` gespeichert – bei jeder Änderung, beim Schließen eines Plugin-Fensters und beim
Beenden – und beim Start wiederhergestellt. Eigene Effekt-Presets enthalten die Plugins nicht. Die Latenz der
Plugins wird angezeigt; sie verzögert nur das Mithören, die Bewertung misst weiterhin den trockenen Eingang.
Ein fehlerhaftes Plugin kann die App mitreißen (wie in jeder DAW); verursacht ein Plugin beim Start Probleme,
`plugin-rack.json` löschen.

## Aufnahme, Nachanalyse und Review (Phase 7)

Jeder Übungsdurchgang wird verlustfrei mitgeschnitten (bis 10 min, Eingang nach Gain). Nach dem Ende
wertet der Kern die Aufnahme im Hintergrund noch einmal aus – diesmal mit Blick auf den ganzen Durchgang:

- **Tonfolge:** Die Tonhöhen-Frames (YIN) gehen in ein Hidden-Markov-Modell mit einem Zustand je Ton und
  Stille; Viterbi bestimmt die wahrscheinlichste Tonfolge. Tonwechsel sind nur an einem Anschlag billig,
  einzelne Ausreißer (Oktavsprünge, Einschwingen, kurze Aussetzer) glättet das Modell. Der Beginn jeder
  Note wird rückwirkend auf ihren Anschlag gelegt; ein Anschlag mitten in einer Note teilt sie
  (wiederholter Ton). So werden auch schnelle Passagen vollständig erkannt (Test: Sechzehntel bei 160 BPM).
  Eine echte pYIN-Mehrkandidatenschätzung ist es nicht – das Modell arbeitet mit dem besten YIN-Kandidaten
  je Frame.
- **Ausrichtung:** Dynamic Time Warping legt die erkannten Noten an die erwartete Notenfolge
  (Einfüge-/Auslasskosten). Getaktet zählt auch der Zeitpunkt (gleiches Fenster wie live), im
  Warte-Modus und im Song-Modus die Reihenfolge. Zusätzlich gespielte, deutlich angeschlagene Noten
  zählen als Fehlversuche.
- **Endwert:** Treffer / (erwartete Noten + Fehlversuche). Die Übungsseite zeigt nach dem Durchgang
  „Live … % → Endwert … %“, die Statistik eine eigene Spalte *Endwert*.

**Review** (*Review ansehen* nach dem Durchgang bzw. Klick auf den Endwert in der Statistik): Wellenform
der Aufnahme, darüber die erwarteten Noten (grün Treffer, gelb zu früh/spät, rot falscher Ton/Oktave,
grauer Ring nicht gespielt), darunter die erkannten Noten (orange: zusätzlich gespielt). Ein Klick
spielt die Stelle über das Audio-Interface ab (auf hörbaren Pegel angehoben); die Liste zeigt Fehler
und Stellen, an denen Live-Wertung und Nachanalyse auseinanderliegen.

Ablage: `<Datenordner>/recordings/session-<id>.wav` (16 Bit) und `.json` (Ergebnis); behalten werden
die 25 neuesten Durchgänge, die es in der Statistik noch gibt. Die Diagnose-Aufnahme nutzt denselben
Mitschnitt.

## Diagnose-Aufnahme

Schalter *Diagnose-Aufnahme* auf der Übungsseite: jeder Durchgang (bis 10 min) wird mit einem
Protokoll aller erkannten Töne, Zieltöne und Wertungen gespeichert – unter
`Dokumente/Fretboard Trainer/Diagnose/<Datum_Uhrzeit>.wav` und `.json`. Damit lassen sich
Fehlerkennungen (z. B. mitklingende leere Saiten) an echten Aufnahmen untersuchen:

```
python tools/diagnose.py "<Dokumente>/Fretboard Trainer/Diagnose/<Datei>.json"
```

zeigt die Fehler mit Umgebung (`--alle`: ganze Zeitleiste) und passende `ft_wavtool`-Aufrufe für
Tonhöhe und Spektrum an den betroffenen Stellen.

## Instrumente

Das Instrument wird zentral unter *Einstellungen → Audio & Erkennung* gewählt (auch in der
Kalibrierung umschaltbar). Jedes Instrument hat ein eigenes Profil mit Tonbereich und
kalibrierten Erkennungsparametern; der Standard-Tonbereich ergibt sich aus Stimmung und
Bundzahl (z. B. Bass (4) EADG: 32–390 Hz). Den Bereich anzupassen ändert nur das Profil –
das Instrument bleibt gewählt. Die Cent-Toleranz gilt instrumentübergreifend.

## Kalibrierung

Unter *Einstellungen → Kalibrierung* spielt man kurze Vorgaben nach (Stufe 0 Ruhe-Messung,
1 Einzeltöne, 2 Lagen & Oktaven, 3 Legato, 4 Tempo & Wiederholungen). Die App
nimmt dabei auf, vergleicht die Erkennung mit der Vorgabe (Reihenfolge, Tonhöhe inkl.
Oktave, Anschlag/Legato) und kann daraus die Erkennungsparameter optimieren:

- **Ruhe-Messung:** misst das Grundrauschen und schlägt eine Gate-Schwelle vor.
- **Optimierung:** probiert 360 Parameterkombinationen auf allen Aufnahmen durch. Die
  Aufnahmen werden dafür nur einmal analysiert und danach mit jedem Parametersatz neu
  bewertet, was schnell geht. Der Vorschlag wird erst nach Bestätigung übernommen.
- **Hinweise:** Misslungene Aufnahmen (wahrscheinlich verspielt oder zu leise) werden zur
  Wiederholung vorgeschlagen, nach geschaffter Stufe die nächste, ältere Aufnahmen nach
  60 Tagen. Auf der Stimmgerät-Seite erscheint gelegentlich ein Hinweis (für 3 Tage ausblendbar).

Während der Aufnahme zeigt ein Griffbrett, wo welcher Ton gegriffen wird (Reihenfolge als
Zahl, aktueller Ton hervorgehoben, Legato-Bögen zum aktuellen Ton). Werden mehrere Töne
genau um Oktaven versetzt erkannt, schlägt die App ein passendes Instrument vor (z. B. Bass
statt Gitarre); bei fast übersteuertem Eingang erscheint eine Warnung.

Je Aufnahme gibt es drei Dateien – Beschreibung (`.json`), Aufnahme (`.wav`, Float 32 Bit)
und Erwartungsdatei (`.txt`, selbes Format wie `tests/data`) – unter `%APPDATA%\FretboardTrainer\calibration\` bzw.
`~/.config/FretboardTrainer/calibration/` und können so auch als Testfälle dienen.

## Voraussetzungen

- CMake ≥ 3.24
- Node.js ≥ 20 mit npm (für die Oberfläche)
- Git (CMake lädt JUCE 8 und Catch2 per `FetchContent`)

### Windows

- Visual Studio 2022 mit Workload „Desktopentwicklung mit C++“ (inkl. Windows-SDK)
- WebView2 wird statisch gelinkt; die WebView2-Runtime ist in Windows 10/11 enthalten.

```bash
cd ui && npm install && cd ..
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
ctest --test-dir build -C Release
```

Die App liegt danach unter `build/FretboardTrainer_artefacts/Release/Fretboard Trainer.exe`.

### Linux (Debian/Ubuntu)

```bash
sudo apt install build-essential cmake git nodejs npm pkg-config \
  libasound2-dev libjack-jackd2-dev libwebkit2gtk-4.1-dev libgtk-3-dev \
  libcurl4-openssl-dev libfreetype-dev libfontconfig1-dev
cd ui && npm install && cd ..
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build
```

## Dev- und Release-Modus der Oberfläche

- **Release** (Standard): CMake ruft `npm run build` in `ui/` auf und bettet das Ergebnis (`ui/dist`) als Binärdaten in die App ein. Ausgeliefert wird es über den Resource-Provider von `WebBrowserComponent`.
- **Dev:** `-DFT_UI_DEV_SERVER=ON` – die App lädt `http://localhost:5173`. Vorher in `ui/` `npm run dev` starten; Änderungen an der UI erscheinen dann sofort (Hot Reload).

## CMake-Optionen

| Option | Standard | Bedeutung |
|---|---|---|
| `FT_UI_DEV_SERVER` | `OFF` | UI vom Vite-Dev-Server laden statt eingebettet |
| `FT_BUILD_TESTS` | `ON` | Catch2-Tests bauen |

Die App nutzt unter Windows WASAPI/DirectSound, unter Linux ALSA bzw. JACK (auch über PipeWire-JACK).

Die MSVC-Laufzeit wird statisch eingebunden; die EXE braucht kein Visual-C++-Redistributable.

### Installer (Windows)

Voraussetzungen: Release-Build, Python mit `markdown` (`pip install markdown`), [Inno Setup 6](https://jrsoftware.org/isinfo.php).

```powershell
cmake --build build --config Release
powershell -ExecutionPolicy Bypass -File installer\build_installer.ps1
```

Ergebnis: `build\installer\FretboardTrainer-<Version>-Setup.exe` – installiert ohne Administratorrechte für den
aktuellen Benutzer, mit Startmenü-Einträgen für App und Anleitung (HTML aus `ANLEITUNG.md`), optionaler
Desktop-Verknüpfung und Deinstallation; prüft, ob die WebView2-Laufzeit vorhanden ist.

## Einstellungen

Gerät, Gain, Mithören und Gate werden beim Beenden bzw. bei jeder Änderung gespeichert:

- Windows: `%APPDATA%\FretboardTrainer\settings.xml`
- Linux: `~/.config/FretboardTrainer/settings.xml`

## Lizenz

AGPLv3 – siehe [LICENSE](LICENSE). Verwendet JUCE 8 (AGPLv3), alphaTab 1.8.4 (MPL-2.0, Guitar-Pro-Import,
Notensatz und Wiedergabe) mit der Schrift Bravura (SIL OFL 1.1) und dem Soundfont Sonivox (Apache 2.0),
TinySoundFont (MIT, Liedwiedergabe im Kern)
sowie SQLite (gemeinfrei).
