// The pure grid model the DOM and audio layers both read from, kept free of
// side effects so it is unit-testable and there is one source of truth for
// what is playing. The lighting derives from this too, so a lit section can
// never disagree with what is actually scheduled.

import { SECTIONS, type Section } from "./instrument.ts";

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 120;
export const DEFAULT_STEPS = 16;

export interface SequencerState {
  bpm: number;
  steps: number;
  /** sectionId -> rows x steps grid of active cells. Row 0 is the lowest
   *  pitch, matching `gestureForCell`. */
  grids: Record<string, boolean[][]>;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

function emptyGrid(rows: number, steps: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: steps }, () => false));
}

export function createState(steps: number = DEFAULT_STEPS): SequencerState {
  const grids: Record<string, boolean[][]> = {};
  for (const section of SECTIONS) grids[section.id] = emptyGrid(section.rows, steps);
  return { bpm: DEFAULT_BPM, steps, grids };
}

/** Immutably flip the cell at (row, col) in a section. Out-of-range coordinates
 *  return the state unchanged rather than throwing. */
export function toggle(
  state: SequencerState,
  sectionId: string,
  row: number,
  col: number,
): SequencerState {
  const grid = state.grids[sectionId];
  if (!grid || !grid[row] || col < 0 || col >= state.steps) return state;
  const grids: Record<string, boolean[][]> = {};
  for (const [id, g] of Object.entries(state.grids)) {
    grids[id] =
      id === sectionId
        ? g.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? !c : c)) : r))
        : g;
  }
  return { ...state, grids };
}

export function isActive(
  state: SequencerState,
  sectionId: string,
  row: number,
  col: number,
): boolean {
  return state.grids[sectionId]?.[row]?.[col] ?? false;
}

/** Clamp a requested tempo into the sane range and return the new state. */
export function setTempo(state: SequencerState, bpm: number): SequencerState {
  return { ...state, bpm: clamp(Math.round(bpm), MIN_BPM, MAX_BPM) };
}

/** Section ids that have at least one note anywhere on the grid. The stage
 *  spotlights read this: a section with no notes is dark. */
export function activeSections(state: SequencerState): string[] {
  return SECTIONS.filter((section) =>
    state.grids[section.id]?.some((row) => row.some(Boolean)),
  ).map((section) => section.id);
}

export interface CellHit {
  section: Section;
  row: number;
}

/** Every active cell firing on a given step column, for the scheduler to sound
 *  and for the per-beat lighting flash. */
export function cellsAt(state: SequencerState, col: number): CellHit[] {
  const hits: CellHit[] = [];
  for (const section of SECTIONS) {
    const grid = state.grids[section.id];
    if (!grid) continue;
    for (let row = 0; row < grid.length; row++) {
      if (grid[row][col]) hits.push({ section, row });
    }
  }
  return hits;
}

/** Seconds per step at the current tempo, treating each step as a 16th note. */
export function stepDuration(state: SequencerState): number {
  return 60 / state.bpm / 4;
}
