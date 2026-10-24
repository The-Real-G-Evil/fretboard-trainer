// Beispiel-Lied für die Browser-Vorschau (ohne Kern gibt es keinen Dateidialog).

import { exporter, Settings } from "@coderline/alphatab";
import { parseAlphaTex } from "./gpImport";

const DEMO = String.raw`
\title "Vorschau-Riff"
\artist "Fretboard Trainer"
\tempo 90
.
\track "Bass"
\tuning (G2 D2 A1 E1)
\instrument 33
\clef F4 \ks Bb
:4 0.4 3.4 5.4 3.4 | 0.3 3.3 5.3 3.3 | 1.3 3.3 0.2 1.2 | 3.2 (5.3 3.2) 0.1 2.1{h} |
\ks G
:4 3.1 2.1 0.1 4.2 | 2.2 0.2 4.3 2.3 | 0.3 4.4 2.4 0.4 | 0.4 r r r |
\track "Gitarre"
\tuning (E4 B3 G3 D3 A2 E2)
:4 0.6 3.6 2.5 0.4 | 2.4 0.3 2.3 1.2 | (3.5 2.4 0.3 1.2 0.1) 3.1 1.1 0.1 | (0.5 2.4 2.3 1.2 0.1) 0.2 2.3 0.3 |
`;

export function demoSongBase64(): string {
  const bytes = new exporter.Gp7Exporter().export(parseAlphaTex(DEMO), new Settings());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
