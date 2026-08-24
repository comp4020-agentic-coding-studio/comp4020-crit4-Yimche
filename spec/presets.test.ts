import { describe, expect, it } from "vitest";
import {
  MAX_BPM,
  MIN_BPM,
  activeSections,
  createState,
} from "../src/lib/sequencer.ts";
import { SECTIONS } from "../src/lib/instrument.ts";
import { TUNES, applyTune } from "../src/lib/presets.ts";

// The premade tunes behind the Load button. They are pure data over the same
// grid model the sequencer plays, so they can be exercised without any DOM or
// audio, and can never disagree with what the stage actually sounds.

describe("presets: the Load selection", () => {
  it("offers a selection to load", () => {
    expect(TUNES.length, "Load needs at least a couple of tunes").toBeGreaterThan(1);
  });

  it("every tune has a name and a sane tempo", () => {
    for (const tune of TUNES) {
      expect(tune.name.trim(), "an unnamed tune").not.toBe("");
      expect(tune.bpm).toBeGreaterThanOrEqual(MIN_BPM);
      expect(tune.bpm).toBeLessThanOrEqual(MAX_BPM);
    }
  });
});

describe("presets: applying a tune", () => {
  it("fills real tracks rather than leaving the stage empty", () => {
    for (const tune of TUNES) {
      const state = applyTune(createState(), tune);
      expect(
        activeSections(state).length,
        `${tune.name} loaded nothing onto the stage`,
      ).toBeGreaterThan(0);
    }
  });

  it("sets the tune's own tempo", () => {
    for (const tune of TUNES) {
      const state = applyTune(createState(), tune);
      expect(state.bpm).toBe(tune.bpm);
    }
  });

  it("replaces whatever was on the grid, so Load is a fresh start", () => {
    const known = SECTIONS[0].id;
    // A tune that only touches one section must still clear the others.
    let state = createState();
    for (const section of SECTIONS)
      state.grids[section.id][0][0] = true; // dirty every track
    state = applyTune(state, TUNES[0]);
    const live = new Set(activeSections(state));
    // The loaded tune decides which sections sound; none of the old stray notes
    // should survive except where the tune itself places one.
    for (const section of SECTIONS) {
      const tuneTouches = Boolean(TUNES[0].rows[section.id]?.some((r) => /x/i.test(r)));
      if (!tuneTouches)
        expect(live.has(section.id), `${section.id} kept a stray note`).toBe(false);
    }
    expect(live.has(known) || live.size > 0).toBe(true);
  });

  it("does not mutate the input state", () => {
    const empty = createState();
    const loaded = applyTune(empty, TUNES[0]);
    expect(activeSections(empty)).toEqual([]);
    expect(loaded).not.toBe(empty);
  });

  it("only places notes on rows the section actually has", () => {
    for (const tune of TUNES) {
      const state = applyTune(createState(), tune);
      for (const section of SECTIONS) {
        const grid = state.grids[section.id];
        expect(grid.length).toBe(section.rows);
      }
    }
  });
});
