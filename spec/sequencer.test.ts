import { describe, expect, it } from "vitest";
import {
  MAX_BPM,
  MIN_BPM,
  activeSections,
  cellsAt,
  createState,
  isActive,
  setTempo,
  stepDuration,
  toggle,
} from "../src/lib/sequencer.ts";

// The pure sequencer model, exercised without any DOM or audio. It is the
// single source of truth the stage lighting and the scheduler both read, so
// these guard the properties the rest of the page leans on.

describe("sequencer: placing notes", () => {
  it("starts empty", () => {
    const state = createState();
    expect(activeSections(state)).toEqual([]);
  });

  it("toggle adds then removes a note without mutating the input", () => {
    const empty = createState();
    const on = toggle(empty, "lead", 0, 0);
    expect(isActive(on, "lead", 0, 0)).toBe(true);
    expect(isActive(empty, "lead", 0, 0)).toBe(false); // input untouched
    const off = toggle(on, "lead", 0, 0);
    expect(isActive(off, "lead", 0, 0)).toBe(false);
  });

  it("ignores out-of-range coordinates rather than throwing", () => {
    const state = createState();
    expect(toggle(state, "lead", 999, 0)).toBe(state);
    expect(toggle(state, "nope", 0, 0)).toBe(state);
    expect(toggle(state, "lead", 0, -1)).toBe(state);
  });
});

describe("sequencer: tempo", () => {
  it("clamps tempo into the sane range", () => {
    const state = createState();
    expect(setTempo(state, 5).bpm).toBe(MIN_BPM);
    expect(setTempo(state, 9000).bpm).toBe(MAX_BPM);
    expect(setTempo(state, 128).bpm).toBe(128);
  });

  it("derives a positive step duration that falls as tempo rises", () => {
    const slow = setTempo(createState(), 60);
    const fast = setTempo(createState(), 240);
    expect(stepDuration(slow)).toBeGreaterThan(stepDuration(fast));
    expect(stepDuration(fast)).toBeGreaterThan(0);
  });
});

describe("sequencer: what plays and what lights", () => {
  it("activeSections reflects which sections hold notes", () => {
    let state = createState();
    state = toggle(state, "bass", 1, 2);
    expect(activeSections(state)).toEqual(["bass"]);
    state = toggle(state, "lead", 0, 0);
    expect(new Set(activeSections(state))).toEqual(new Set(["lead", "bass"]));
  });

  it("cellsAt returns the notes firing on a given step", () => {
    let state = createState();
    state = toggle(state, "lead", 0, 3);
    state = toggle(state, "bass", 2, 3);
    state = toggle(state, "lead", 1, 7);
    const hits = cellsAt(state, 3);
    expect(hits.map((h) => `${h.section.id}:${h.row}`).sort()).toEqual([
      "bass:2",
      "lead:0",
    ]);
    expect(cellsAt(state, 0)).toEqual([]);
  });
});
