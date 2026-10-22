import { describe, expect, it } from "vitest";
import { parseAlphaTex } from "./gpImport";
import { channelGains, coreSong } from "./songMidi";

const TEX = String.raw`
\tempo 120
.
\track "Bass"
\tuning (G2 D2 A1 E1)
\instrument 33
:4 3.4 r 5.4 r | \tempo 60 :4 0.4 r r r |
\track "Gitarre"
\tuning (E4 B3 G3 D3 A2 E2)
:1 0.1 | 0.1 |
`;

describe("Liedwiedergabe im Kern", () => {
  const score = parseAlphaTex(TEX);

  it("übersetzt Noten, Programme und Tempo in MIDI für den Kern", () => {
    const s = coreSong(score, [0, 1920]);
    const bassCh = score.tracks[0].playbackInfo.primaryChannel;
    const bassOn = s.events.filter((e) => e[1] === (0x90 | bassCh)).map((e) => [e[0], e[2]]);
    expect(bassOn).toEqual([[0, 31], [1920, 33], [3840, 28]]); // G1, A1, E1 (Note-On mit MIDI-Status 0x90)
    expect(s.events.some((e) => e[1] === (0x80 | bassCh) && e[2] === 31)).toBe(true); // Note-Off
    expect(s.events.some((e) => e[1] === (0xc0 | bassCh) && e[2] === 33)).toBe(true); // Programm E-Bass
    expect(s.tempo.map((t) => [t[0], t[1]])).toEqual(expect.arrayContaining([[0, 120], [3840, 60]]));
    expect(s.halts).toEqual([0, 1920]);
  });

  it("bildet das Mischpult auf die MIDI-Kanäle der Spuren ab", () => {
    const [bass, gtr] = score.tracks.map((t) => t.playbackInfo.primaryChannel);
    const mix = [{ volume: 0.3, mute: false, solo: false }, { volume: 1, mute: true, solo: false }];
    const g = channelGains(score, mix);
    expect([g[bass], g[gtr]]).toEqual([0.3, 0]);
    const solo = channelGains(score, [{ volume: 0.5, mute: false, solo: true }, { volume: 1, mute: false, solo: false }]);
    expect([solo[bass], solo[gtr]]).toEqual([0.5, 0]);
  });
});
