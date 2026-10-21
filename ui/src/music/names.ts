// Notennamen (deutsch, mit H statt B).

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "H"];

/** Deutsche Notennamen (H statt B) mit wissenschaftlicher Oktavzahl, z. B. 40 -> "E2". */
export function noteName(midi: number) {
  const pc = ((midi % 12) + 12) % 12;
  return { name: NOTE_NAMES[pc], octave: Math.floor(midi / 12) - 1 };
}
