// The premade tunes behind the Load button: a small hand-written selection a
// first-time player can drop onto the stage and hear the whole ensemble at
// once, instead of facing an empty grid. Each tune is pure data over the same
// grid model the sequencer plays, so it stays unit-testable and can never
// disagree with what the stage actually sounds.

import { SECTIONS } from "./instrument.ts";
import type { SequencerState } from "./sequencer.ts";

// A tune writes each section's part as rows of text, TOP row (highest pitch)
// first, so the shape on the page reads the way a musician would lay it out.
// An "x" (or "X") is a note; every other character is a rest. Percussion's
// three rows are hat / snare / kick, top down, matching how audio.ts maps a
// perc row to a drum piece. A tune carries its own tempo, since a march and a
// stroll want different BPM, and Load applies both.
export interface Tune {
  name: string;
  bpm: number;
  /** sectionId -> rows of "x"/rest text, highest pitch first. */
  rows: Record<string, string[]>;
}

export const TUNES: readonly Tune[] = [
  {
    name: "Boss Rush",
    bpm: 168,
    rows: {
      lead: [
        "x...x...x...x...",
        "..x...x...x...x.",
        "....x.......x...",
        "................",
        "................",
      ],
      harmony: [
        "................",
        "..x...x...x...x.",
        "................",
        "..x...x...x...x.",
        "................",
      ],
      bass: [
        "................",
        "................",
        "..x...x...x...x.",
        "................",
        "x.x.x.x.x.x.x.x.",
      ],
      perc: [
        "xxxxxxxxxxxxxxxx",
        "....x.......x...",
        "x...x...x...x...",
      ],
    },
  },
  {
    name: "Pixel Dawn",
    bpm: 112,
    rows: {
      lead: [
        "......x.......x.",
        "....x.......x...",
        "..x.......x.....",
        "................",
        "x.......x.......",
      ],
      harmony: [
        "................",
        "x.......x.......",
        "................",
        "....x.......x...",
        "................",
      ],
      bass: [
        "................",
        "................",
        "........x.......",
        "................",
        "x...........x...",
      ],
      perc: [
        "x.x.x.x.x.x.x.x.",
        "........x.......",
        "x.......x.......",
      ],
    },
  },
  {
    name: "Arcade Rush",
    bpm: 150,
    rows: {
      lead: [
        "................",
        "..x...x...x..x.x",
        "xx..x..xxx......",
        "..x...x...x..x.x",
        "................",
      ],
      harmony: [
        "........x.......",
        "..x.x.x...x.x.x.",
        "................",
        ".x.x.x.....x.x.x",
        "................",
      ],
      bass: [
        "xxxxx...........",
        "................",
        "..x...x...x...x.",
        "................",
        "x...x...x...x...",
      ],
      perc: [
        "xxxxxxxxxxxxxxxx",
        "....x.......x...",
        "x.....x.x.....x.",
      ],
    },
  },
  {
    name: "Looping Ringtone",
    bpm: 120,
    rows: {
      lead: [
        "................",
        ".......x...x....",
        ".x..x.x..x......",
        "...x........x.x.",
        "................",
      ],
      harmony: [
        "................",
        ".x....xxx....x.x",
        "x........x.xx...",
        "...x..x......x..",
        "................",
      ],
      bass: [
        "................",
        "...x...x...x....",
        "................",
        ".x.......x......",
        "x....x..........",
      ],
      perc: [
        ".xx..xx..xx..xx.",
        "x..xx..xx..xx..x",
        "................",
      ],
    },
  },
  {
    name: "Slow idle time",
    bpm: 70,
    rows: {
      lead: [
        "x...............",
        ".........x....x.",
        "......x.........",
        "...x............",
        "..............x.",
      ],
      harmony: [
        ".......x........",
        "............x...",
        ".x.x............",
        ".......x....x...",
        "................",
      ],
      bass: [
        "...x...x...x...x",
        "................",
        "................",
        "................",
        "xx..xx..xx..xx..",
      ],
      perc: [
        "xxxxxxxxxxxxxxxx",
        ".x..x..x..x..x..",
        "x...x.x.x.......",
      ],
    },
  },
  {
    name: "A bit of pressure",
    bpm: 130,
    rows: {
      lead: [
        "x...x...x...x...",
        "................",
        "................",
        ".x..............",
        ".......x.x.x....",
      ],
      harmony: [
        ".............x.x",
        ".............x.x",
        "......x...x..x.x",
        "..x.....x....x.x",
        ".............x.x",
      ],
      bass: [
        "................",
        "............x...",
        "............x...",
        ".x.x.x.x.x.x.x.x",
        "x.x.x.x.x.x.x.x.",
      ],
      perc: [
        "x.x.x.x.x.x.x.x.",
        "xxxxxxxxx.......",
        "x.x.x.x.x.x.x.x.",
      ],
    },
  },
];

// Read the live grids back out as a Tune: the inverse of applyTune. Each
// section's bottom-first rows are flipped to top-first "x"/"." text, so what
// comes out drops straight back in through applyTune. Save uses this to hand a
// player their current stage as a premade track; the name is theirs to fill in.
export function serializeTune(state: SequencerState, name = ""): Tune {
  const rows: Record<string, string[]> = {};
  for (const section of SECTIONS) {
    const grid = state.grids[section.id] ?? [];
    rows[section.id] = Array.from({ length: section.rows }, (_, i) => {
      // top line first: the highest-pitch row is the last one in the grid.
      const row = grid[section.rows - 1 - i] ?? [];
      return Array.from({ length: state.steps }, (_, c) => (row[c] ? "x" : ".")).join("");
    });
  }
  return { name, bpm: state.bpm, rows };
}

// Format a live stage as a copy-paste Tune literal, matching the indentation of
// the entries already in the TUNES array so it drops in cleanly right before the
// closing bracket. The name is left blank for the player to name.
export function tuneToSource(state: SequencerState, name = ""): string {
  const tune = serializeTune(state, name);
  const out = ["  {", `    name: ${JSON.stringify(tune.name)},`, `    bpm: ${tune.bpm},`, "    rows: {"];
  for (const section of SECTIONS) {
    out.push(`      ${section.id}: [`);
    for (const line of tune.rows[section.id]) out.push(`        ${JSON.stringify(line)},`);
    out.push("      ],");
  }
  out.push("    },", "  },");
  return out.join("\n");
}

// Turn a tune into fresh grids for the current step count, mapping its
// top-first text rows back onto the model's bottom-first rows (row 0 = lowest
// pitch). Every section is rebuilt from scratch, so Load is a clean slate: any
// section the tune leaves out comes back empty rather than keeping stray notes.
// A missing pattern or a short line is read as rests, so a malformed tune can
// never crash the stage. The tune's own tempo rides along.
export function applyTune(state: SequencerState, tune: Tune): SequencerState {
  const grids: Record<string, boolean[][]> = {};
  for (const section of SECTIONS) {
    const pattern = tune.rows[section.id];
    const grid = Array.from({ length: section.rows }, (_, r) =>
      Array.from({ length: state.steps }, (_, c) => {
        // top-first text -> bottom-first grid: row r counts up from the bottom.
        const line = pattern?.[section.rows - 1 - r] ?? "";
        const mark = line[c];
        return mark === "x" || mark === "X";
      }),
    );
    grids[section.id] = grid;
  }
  return { ...state, bpm: tune.bpm, grids };
}
