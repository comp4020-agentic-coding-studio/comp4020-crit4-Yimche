# Process overview

## What I built
I created a funky little instrument, called the '8-Bit Orchestra': a chiptune
instrument that looks like a pixel-art theatre.
You part the curtain, wake the conductor, then tap each musician to
write their part on a step grid; the ensemble loops live through a Web Audio
synth while the stage lights follow whatever is actually sounding.
The whole thing hangs off one pure sequencer model: the audio, the grids, and
the stage lighting are all projections of it, such that it feels very responsive
and alive.

## The moments that mattered

1. **Shifting to a test-first direction for Load/Save, instead of wiring the
   DOM straight to `presets.ts`.** The obvious order was: add a Load button,
   read a track literal, stuff it into the grids, done. Instead I wrote the
   contract first: `f6608bf` asserts that applying a tune from `TUNES` fills
   every section's grid and sets the tempo, committed red on its own because
   `src/lib/presets.ts` didn't exist yet. That habit paid off harder on Save:
   rather than hand-writing a serializer and eyeballing the result, I wrote
   `serializeTune` as the deliberate *inverse* of `applyTune` and proved it with
   a round-trip contract. Load every tune, read the live stage back out,
   reload that, and assert the grids and tempo come back identical. I know Save is
   honest because the test would fail if it silently dropped a beat, not
   because a textarea looked plausible.
   [`f6608bf`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/f6608bf)
   is the red contract; the inverse and its round-trip land in
   [`fca91a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/fca91a6).

2. **Checking the conductor's spotlight against real pixels, not my mental
   model.** The beam fought me twice: first it bled over the audience seats,
   then a clip fix stopped it reaching the conductor at all. Nothing in
   `pnpm check` can see whether the stage *looks* right, so I drove headless
   Chromium to screenshot the beams in forced light states and measured the
   proscenium frame in the actual art (x = 126 of 384) instead of guessing.
   That surfaced the real cause: the conductor stands *downstage*, in front of
   the frame, so a beam clipped to the section rig behind it can never reach
   him. The fix was a front follow-spot on its own layer, plus a valance-only
   overlay generated from the same geometry as the baked valance, so the
   rooftop arcs occlude the cone's top cleanly instead of a clipped copy
   leaving an ugly box across the beam.
   [`4e15c89...af35937`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/compare/4e15c89...af35937)
   is that arc, with the music stands tucked back behind the beam in
   [`3d01cf9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/3d01cf9).

3. **Stopping the constant repositioning of the stage art by turning
   performer position into a formula instead of a guess.** The scenery went
   through round after round of redrawing: decks arcing the wrong way, the
   crowd clumping instead of filling the house, curtain legs sitting in front
   of the stage when they should hang behind it, harmony and perc's feet
   floating off the back deck. Each got "fixed" by hand-nudging a performer's
   pixel offset to match whatever the art now looked like, which is exactly
   why it kept recurring: the art and the DOM performers were two independent
   sets of numbers, and only one moved when I redrew the deck. The real fix was
   `deckY()`: a performer's feet are computed by sampling the same arc curve
   the art generator paints the deck with, at that performer's own x, instead
   of a fixed y per performer. Lowering the whole platform later was then one
   set of shared constants changed once, with every performer's feet following
   the new curve on their own instead of being chased individually again.
   [`ac23109...a2198cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/compare/ac23109...a2198cd)
   spans introducing `deckY()` and the later stage-lowering commit that proves
   it held.

4. **Fixing the Stop bug at the source, not the symptom.** Pressing Stop left a
   few spotlights glowing. The obvious patch was to clear the stray classes
   again inside the light-refresh. I traced it instead: the lookahead
   scheduler queues each step's lighting on its own `setTimeout`, up to 100 ms
   ahead, and `stop()` only cancelled the interval, so a paint already in
   flight relit a beam *after* the rig had gone dark. The real fix was to track
   those pending paint timers and cancel them in `stop()`. What told me I had
   the right cause: the leftover glow only ever appeared on the busiest beat,
   exactly where a late paint was most likely to still be queued.
   [`fad15a1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/fad15a1)
