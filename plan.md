# Crit 4 plan — 8-Bit Orchestra

## Context

Crit 4 asks for a static, client-side **musical instrument** synthesised live in
the browser (Web Audio), deployed to GitHub Pages, playable cold by a stranger
at 1920×1080 and 390×844, with no fail state. The spec (`spec/instrument.test.ts`,
already committed red) fixes the contract: a pure `voiceFor({x,y}) → {frequency,
gain}` in `src/lib/instrument.ts`, `data-play` controls reachable by keyboard, a
`data-invite` opening, pointer **and** keyboard handling, live synthesis with no
recorded-audio files.

The instrument is an **8-Bit Orchestra**: a side-on pixel-art theatre where the
player conducts a looping chiptune ensemble. You place notes on each section's
pitch×beat grid and set the tempo with the conductor; the orchestra plays the
loop live, and the stage lighting tracks what is actually sounding. Chosen
because chiptune *is* oscillator synthesis (square/triangle/noise map straight
onto Web Audio primitives, so "synthesise live" is nearly free) and the pixel-art
theatre gives the silent, autoplay-suspended opening screen the personality it
needs to invite the first tap.

Decisions locked with the user: **melodic** pixel grid (pitch × beat);
**authentic NES voices under an orchestra skin** (2 pulse leads, a triangle bass,
a noise percussion); **side-on cross-section** theatre layout; and lighting that
starts dim and lights up in response to play.

## The instrument (one sentence for AGENTS.md)

A pixel-art chiptune orchestra you conduct: tap notes onto each section's grid,
set the tempo, and the ensemble loops live in the browser while the stage lights
follow what plays.

## Core interaction (testable)

**Gesture:** tap/click (or keyboard-toggle) a cell in a section's pitch×beat
grid to place or remove a note at that pitch and beat; the conductor's tempo
buttons set BPM; the running loop plays every active cell live via Web Audio.
Two players' grids sound clearly different, and every pitch snaps to a pentatonic
scale so there is no wrong note.

**Testable claim:** `voiceFor` (pure, `src/lib/instrument.ts`) and the pure
sequencer model (`src/lib/sequencer.ts`) — covered by `spec/instrument.test.ts`
(unchanged contract) plus a new pure-model test file.

## Architecture — new files

- **`src/lib/instrument.ts`** (NEW, pure). `voiceFor({x,y})`: `y` = pitch →
  frequency snapped to a pentatonic scale over ~2 octaves (`440*2^((midi-69)/12)`,
  well inside 20–20000 Hz); `x` = velocity/dynamics → gain in `(0,1]`
  (e.g. `0.5 + 0.4*x`). Both axes affect the output so the spec's 5 sample points
  stay distinct. Also export the scale table and section definitions. **No Web
  Audio here — stays pure and importable by the test.**
- **`src/lib/sequencer.ts`** (NEW, pure). Grid state model: sections, steps,
  active cells; `toggle(state, section, row, col)`, `setTempo(bpm)` clamped to a
  sane range (e.g. 40–240), `stepAt(...)`, plus a derived `activeSections(state)`
  the lighting reads. Pure so it is unit-testable and keeps the DOM/audio thin.
- **`src/lib/audio.ts`** (NEW, side-effects). One lazy `AudioContext` (created/
  `resume()`d on first gesture). Per section: oscillator type (`square` for the
  two pulse leads, `triangle` for bass) or a programmatically-generated noise
  `AudioBufferSourceNode` for percussion (NOT a shipped `.wav`); plus a short
  metronome click voice. Each note gets a short attack/release envelope via
  `setValueAtTime`/`linearRampToValueAtTime` — no bare `.value` assignment. A
  **lookahead scheduler** (`setInterval` ~25ms scheduling ~100ms ahead against
  `ctx.currentTime`) fires active cells; each firing calls `voiceFor(velocity,
  row)` for its `{frequency,gain}`, so the pure function drives real sound (no
  decoration). Oscillators are single-use: `start`/`stop` once, disconnect.
- **`src/scripts/main.ts`** (REWRITE). Wire DOM ↔ sequencer ↔ audio: `pointerdown`
  on cells and controls (covers mouse + touch), `keydown` for toggle/transport
  and live play, resume `AudioContext` on first gesture, dismiss the invite,
  drive the pixel-art beat animation (conductor baton / playhead) and the stage
  lighting off the scheduler's per-beat callback.

## Staging & lighting (state made visible)

The theatre scene doubles as the instrument's state display — lighting is driven
by real play state, so the deaf sensor roster is not the only witness to whether
it works:

- **Cold start = dim.** House lights down, stage dark, `data-invite` overlay. The
  `AudioContext` is suspended; dim *is* silence made visible.
- **Wake via the conductor.** Interacting with the conductor (tap podium / set
  BPM) resumes the `AudioContext`, drops a **spotlight on the director**, and
  starts a **metronome tick** (a short synth click voice, `ctx.currentTime`-
  scheduled — not a file). This is the first-gesture handshake the autoplay
  policy requires.
- **Per-section spotlights track activity.** A section's light turns on when it is
  currently sounding (has active notes and the transport is running); it turns
  off when that section has no notes to play or is silent. Light state is derived
  from the sequencer model each beat, not stored separately (single source of
  truth).
- **Full stage light** when all four sections are in effect at once.
- **Crowd** is purely aesthetic (pixel silhouettes, maybe idle bob); no reaction
  logic, no state.

**Layout — side-on cross-section (chosen).** The theatre seen from the side:
raked seats rising in the foreground/left with crowd silhouettes; a tiered stage
on the right where the four sections sit at different heights (so each spotlight
lands on a distinct tier); conductor mid-stage on the podium. Spotlight cones
come from the top. The note grids sit in a control strip below the scene.

Implementation: lighting is CSS classes (`.lit`, `.dim`, `.spotlight`) toggled
from the scheduler's per-beat callback off the pure sequencer state; no separate
lighting state to drift. `prefers-reduced-motion` respected for flicker/bob.

## UI / layout — `src/pages/index.astro` + `src/styles/global.css`

- The side-on pixel theatre scene up top (crowd, conductor, tiered orchestra,
  spotlights) with a control strip below: conductor transport (tempo −/+ showing
  BPM, play/stop) and the four sections (Pulse lead, Pulse harmony, Triangle
  bass, Noise percussion), each a pitch×beat grid of `<button data-play>` cells
  (native focusable + keyboard-operable; Space/Enter toggles). A `data-invite`
  overlay with real text ("Tap the conductor to wake the orchestra") that clears
  on first sound.
- **Desktop 1920×1080:** full side-on scene as a wide banner; all four section
  grids visible below; 16 beats.
- **Phone 390×844:** the tiered scene compresses vertically into a tall banner
  (tiers stack naturally on a tall screen); one section's grid at a time via
  tabs below; 8 beats so cells stay ≥~40px; conductor pinned. The lit tier
  mirrors the selected/active section. Grid state survives tab switch and resize.
- Pixel-art look via CSS (`image-rendering: pixelated`, chunky borders, limited
  palette) and a retro display font. Playhead column highlights on the beat.
- Measure both viewports with `agent-browser` before accepting layout; per the
  harness log, treat 1920 and 390 as two separate problems.

## Accessibility & no-fail

- Cells are real `<button>`s: focusable, Space/Enter toggle, not `aria-hidden`.
  Arrow-key navigation within a grid is a nice-to-have. Global `keydown` also
  enables live play (satisfies the keyboard-input spec line and is genuinely
  playable).
- No score, no losing, pentatonic scale → every combination is consonant.

## Spec & harness updates

- `spec/instrument.test.ts`: **unchanged** — this design turns the red contract
  green (voiceFor pure/distinct/audible, data-play focusable, data-invite,
  pointer+keydown, no media). This is the headline red→green for evidence.
- `spec/starter.test.ts`: delete/replace (worked example) once the starter intro
  is gone.
- **New** `spec/sequencer.test.ts`: pure-model tests (toggle adds/removes a cell;
  `setTempo` clamps; `activeSections` reflects the grid). Commit red first, then
  green — process evidence.
- `AGENTS.md`: fill in "The instrument", core interaction, and testable claim
  lines; add harness-log entries for anything that bites (likely: Web Audio
  scheduler gotchas, phone grid sizing).
- `Layout`/page `description` + **`public/card.png`** (1200×630): replace with a
  pixel-art orchestra card. Invariant checks presence only; verify the deployed
  head/card by hand (harness log: the roster can't see a broken card path).
- `reflections/crit-4.md` (required at cutoff) and `PROCESS.md` (3–4 moments,
  each cited to a commit; `pnpm check:evidence` must resolve).

## Build order (small green commits; test-first reds allowed solo)

1. `voiceFor` + scale in `instrument.ts` → turns the expressiveness spec green.
2. `sequencer.ts` pure model + `spec/sequencer.test.ts` (red → green).
3. `audio.ts` engine + scheduler; wire one section end-to-end; **listen**.
4. Full side-on stage + all four sections; desktop layout; lighting; listen.
5. Phone tabs layout; verify at 390.
6. Card, description, reflection, PROCESS.

## Verification

- `pnpm check` (typecheck → build → vitest) green before every commit; CI link
  check crawls the base path.
- **Listen** to every audible change (no sensor hears it): attack has no click,
  tempo changes are smooth, sections are distinguishable, the loop is musical.
- `agent-browser` at 1920×1080 and 390×844: stage starts dim, invite shows on
  load and clears on first sound; conductor wakes audio + spotlight + metronome;
  section lights track activity; cells toggle by mouse, touch, and keyboard;
  state survives a resize and (phone) a tab switch.
- Confirm deployed `<head>` description and `card.png` resolve on the live URL.
- Ship with time for CI; `reflections/crit-4.md` present at the sweep.
