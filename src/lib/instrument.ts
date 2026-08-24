// The pure heart of the instrument: gesture -> voice, with no Web Audio in
// sight so `spec/instrument.test.ts` can import and exercise it directly. Every
// pitch snaps to a pentatonic ladder, so there is no wrong note to play, and
// both axes of the gesture move the output so two players sound different.

export const A4 = 440;

/** Equal-tempered frequency of a MIDI note number. */
export function midiToFrequency(midi: number): number {
  return A4 * 2 ** ((midi - 69) / 12);
}

// Major pentatonic: semitone offsets within one octave. No semitone clashes,
// so any combination of these is consonant. This is the "no fail state".
const PENTATONIC = [0, 2, 4, 7, 9];

/** A wide pentatonic ladder in MIDI, low to high, so each section can sit in
 *  its own register by indexing a slice of the same shared scale. */
export const SCALE_MIDI: number[] = buildScale(33, 6); // ~A1 upward, 6 octaves

function buildScale(rootMidi: number, octaves: number): number[] {
  const notes: number[] = [];
  for (let octave = 0; octave < octaves; octave++) {
    for (const step of PENTATONIC) notes.push(rootMidi + octave * 12 + step);
  }
  return notes;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export interface Voice {
  frequency: number;
  gain: number;
}

/**
 * Map a normalised gesture to a voice.
 *
 * `y` (0 bottom, 1 top) picks a pitch from the pentatonic ladder; `x` (0 soft,
 * 1 loud) sets the dynamics. Both stay comfortably inside 20-20000 Hz and
 * (0, 1], so every voice it can produce is audible.
 */
export function voiceFor({ x, y }: { x: number; y: number }): Voice {
  const index = Math.round(clamp01(y) * (SCALE_MIDI.length - 1));
  return {
    frequency: midiToFrequency(SCALE_MIDI[index]),
    gain: 0.5 + 0.4 * clamp01(x), // (0.5 .. 0.9], never silent, never clipping
  };
}

export type Timbre = "square" | "triangle" | "noise";

export interface Section {
  id: string;
  label: string;
  timbre: Timbre;
  /** Pitch rows in this section's grid, bottom (low) to top (high). */
  rows: number;
  /** Index into SCALE_MIDI for this section's bottom row, so each section
   *  occupies its own register. */
  pitchBase: number;
}

// The four NES voices under an orchestra skin: two pulse leads, a triangle
// bass, a noise percussion. Registers are spaced so the ensemble stacks.
export const SECTIONS: readonly Section[] = [
  { id: "lead", label: "Pulse Lead", timbre: "square", rows: 5, pitchBase: 22 },
  {
    id: "harmony",
    label: "Pulse Harmony",
    timbre: "square",
    rows: 5,
    pitchBase: 15,
  },
  {
    id: "bass",
    label: "Triangle Bass",
    timbre: "triangle",
    rows: 5,
    pitchBase: 4,
  },
  { id: "perc", label: "Noise Drums", timbre: "noise", rows: 3, pitchBase: 12 },
];

/** The normalised gesture for a cell in a section's grid, so the DOM/audio
 *  layers drive `voiceFor` rather than reinventing the mapping. `row` counts
 *  from the bottom (0 = lowest pitch). `velocity` is 0..1. */
export function gestureForCell(
  section: Section,
  row: number,
  velocity = 1,
): { x: number; y: number } {
  const index = section.pitchBase + row;
  return { x: velocity, y: index / (SCALE_MIDI.length - 1) };
}
