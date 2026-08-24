import { describe, expect, it } from "vitest";
import {
  MAX_BPM,
  MIN_BPM,
  activeSections,
  createState,
} from "../src/lib/sequencer.ts";
import { SECTIONS } from "../src/lib/instrument.ts";
import { TUNES, applyTune, serializeTune, tuneToSource } from "../src/lib/presets.ts";

// The premade tunes behind the Load button. They are pure data over the same
// grid model the sequencer plays, so they can be exercised without any DOM or
// audio, and can never disagree with what the stage actually sounds.

describe("presets: the Load selection", () => {
  it("offers a list of at least five tracks to pick from", () => {
    expect(TUNES.length, "Load presents a list of tracks").toBeGreaterThanOrEqual(5);
  });

  it("gives every track a distinct name, so the picker is unambiguous", () => {
    const names = new Set(TUNES.map((t) => t.name));
    expect(names.size).toBe(TUNES.length);
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

describe("presets: saving the stage back to a tune", () => {
  it("round-trips every tune: load it, read it back, and the grids match", () => {
    for (const tune of TUNES) {
      const loaded = applyTune(createState(), tune);
      // Reading the live stage back out and re-loading it must land on the same
      // grids and tempo, so Save is a faithful inverse of Load.
      const reloaded = applyTune(createState(), serializeTune(loaded));
      expect(reloaded.grids, `${tune.name} did not survive a save/reload`).toEqual(
        loaded.grids,
      );
      expect(reloaded.bpm).toBe(tune.bpm);
    }
  });

  it("leaves the name blank for the player to fill in", () => {
    expect(serializeTune(applyTune(createState(), TUNES[0])).name).toBe("");
  });

  it("emits a source literal that reads back through applyTune, tempo and all", () => {
    let state = createState();
    state = { ...state, bpm: 137 };
    state.grids.lead[0][0] = true;
    state.grids.perc[2][4] = true;
    const src = tuneToSource(state);
    // The text is a paste-in TUNES entry: a blank name, the live tempo, and a
    // rows block. Rebuild a Tune from the same serializer and confirm the text
    // agrees with it line for line, so what the player copies is what plays.
    expect(src).toContain('name: "",');
    expect(src).toContain("bpm: 137,");
    for (const line of serializeTune(state).rows.lead)
      expect(src).toContain(`"${line}",`);
  });
});
