# Process overview

A reading-guide to how the 8-Bit Orchestra came together: the moments where a
real decision or a real check shaped the build, each pointing at the commit that
carries the evidence.

## What I built

An 8-Bit Orchestra: a client-side chiptune instrument that looks like a pixel-art
theatre. You part the curtain, wake the conductor, then tap each musician to
write their part on a step grid; the ensemble loops live through a Web Audio
synth while the stage lights follow whatever is actually sounding. The whole
thing hangs off one pure sequencer model — the audio, the grids, and the stage
lighting are all projections of it, so a lit musician can never disagree with
what you hear.

## The moments that mattered

1. **Making the model the single source of truth, and proving it with a
   contract.** The tempting shape was to let the DOM hold the state and read the
   grid cells back when playing. Instead I kept a pure `SequencerState` that the
   audio, lighting, and DOM all *read from*, so there is one thing to be right.
   The test of that decision was the Load/Save pair: Load drops a premade tune
   onto every section, and Save reads the live stage back out as pasteable
   source. I made Save the exact *inverse* of Load (`serializeTune` inverts
   `applyTune`) and proved it with a round-trip contract — load every tune,
   serialize it, reload it, assert the grids come back identical. I know it
   holds because the contract was written first and went red before the code
   made it green.
   [`f6608bf`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/f6608bf)
   is that test committed red on its own; the Save inverse and its round-trip
   land in
   [`fca91a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/fca91a6).

2. **Fixing the Stop bug at the source, not the symptom.** Pressing Stop left a
   few spotlights glowing. The obvious patch was to clear the stray classes
   again inside the light-refresh. I traced it instead: the lookahead scheduler
   queues each step's lighting on its own `setTimeout`, up to 100 ms ahead, and
   `stop()` only cancelled the interval — so a paint already in flight relit a
   beam *after* the rig had gone dark, with nothing left running to clear it.
   The real fix was to track those pending paint timers and cancel them in
   `stop()`. What told me I had the right cause: the leftover glow only ever
   appeared on the busiest beat, exactly where a late paint was most likely to
   still be queued.
   [`fad15a1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/commit/fad15a1)

3. **Checking the lighting against real pixels, not my mental model.** The
   conductor's spotlight fought me — first it bled over the audience seats, then
   it stopped reaching him at all. Nothing in `pnpm check` can see whether the
   stage *looks* right, so I drove headless Chromium to screenshot the beams in
   forced light states and measured the proscenium frame in the actual art
   (x = 126 of 384) rather than guessing. That is what surfaced the real cause:
   the conductor stands *downstage*, in front of the frame, so his beam can
   never work sat behind the frame with the section rig. The non-obvious fix was
   a front follow-spot on its own layer, plus a **valance-only** overlay
   (`arcs.png`, generated from the same geometry as the baked valance) so the
   rooftop arcs occlude the cone's top cleanly — a clipped copy of the full
   front-of-house overlay had left an ugly box where it cut across the beam. The
   arc from the first frame-clip to the finished follow-spot is
   [`4e15c89...af35937`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/compare/4e15c89...af35937).

4. **Self-hosting the typeface instead of reaching for a CDN.** Switching the
   whole instrument to Departure Mono, the quick path was a Google Fonts link.
   That adds an external request and a thing that breaks offline, so I
   self-hosted the font under `src/assets/` and referenced it with a relative
   `url()` — Vite fingerprints it at build and carries the GitHub Pages base
   path automatically, which a root-absolute path would have silently broken.
   The finer glyphs then read smaller than the old display font, so I resized the
   greeter, the controls, and every pop-up and re-checked them at both 1920×1080
   and 390×844.
   [`34c485c...2480885`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-Yimche/compare/34c485c...2480885)
