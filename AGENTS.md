# AGENTS.md

The working harness for this repo. These are standing rules for any agent (and
me) working here — read this before planning or building, and re-read it when a
check keeps catching you out. This file is also read as process evidence, so it
stays honest and current: when a correction belongs to *how the work is run*
rather than to one output, it lands here as a new rule, not in a retry.

> `CLAUDE.md` points at this file; keep the operating rules here so the two
> don't drift.

Carried forward from `comp4020-ass1-Yimche`. The harness log at the bottom is
cumulative across the course; the sections above it are re-answered each week.

## What this is

A **musical instrument in the browser**: something a stranger can pick up and
play. Static, client-side, Web Audio, deployed to GitHub Pages.

- **The instrument:** *(not chosen yet — name it here before building, in one
  sentence a stranger would understand.)*
- **The player acts and the page sounds.** Sound is made live by synthesis in
  the page, not played back from a file.

Everything in scope serves playability. If a feature doesn't make the thing
better to play, it's out — over-scoping reads as an answer without a point of
view.

## What's actually being marked

This is a **crit week**, not an assignment: 2% total, and the two halves are
scored independently.

1. **1 mark — shipped at the cutoff.** The automated sweep runs **fifteen
   minutes after** Wed 12:00 and needs all three: pushed to the repo, live at
   the derived URL, and `reflections/crit-4.md` present. Full mark only if the
   checks had **gone green** by the time the sweep ran — red, still running, or
   no checks at all is 0.5. So ship with time for CI to finish.
2. **1 mark — contribution in the session.** Set from the session, not the
   repo: present to the pod, give real critique, work the riff, and account for
   how the agent produced the work. **Attendance is a condition of both marks.**

Polish is not the lever, and `PROCESS.md` and the reflection are not graded
weekly — the reflection counts as present or not. They are read properly at the
assignments, so write them for a reader anyway; A2 reads this repo's history.

The judged part of the spec no sensor can hold: whether the opening screen
**invites the first sound**, whether the thing is **expressive**, and whether
playing it feels good. That is what the pod plays cold, before I say a word.

## The core interaction (state it testably)

Name the one thing the player does, plainly enough to write a test for it, and
back it with a `spec/*.test.ts`. If you can't write the test, the interaction
isn't defined yet.

- **Interaction:** *(fill in: what gesture makes what sound, and how the
  player's choices shape it.)*
- **Fit to the marked viewports.** Desktop and phone are both marked in full,
  and a gesture that works with a mouse may not work with a thumb. Pointer
  events cover both; verify by playing it at each size.
- **Testable claim:** *(fill in, naming the spec files.)*

Keep this line and its test in sync with what the page actually does. A passing
test that describes an old behaviour is a lie in the harness.

## Hard constraints

- **Static and client-side only.** No server, no runtime backend, no secrets. If
  a build step needs a network call, that's a smell — stop and reconsider.
- **Both viewports count in full.** Verify desktop **and** phone every time the
  layout changes; don't assume one from the other.
- **GitHub Pages base path.** The site lives under `…github.io/<repo>/`. Astro's
  `base` is set in `astro.config.ts` and the dev server serves under it, so path
  bugs reproduce locally. Internal links must be relative or
  `import.meta.env.BASE_URL`-prefixed; root-absolute paths pass local
  eyeballing and 404 live. See the harness log for the trailing-slash trap.
- **Commit `pnpm-lock.yaml`.** CI installs with `--frozen-lockfile`, so a
  dependency change that isn't reflected in the committed lockfile fails the
  build even though it works locally.
- **Keyboard and resize are part of "working."** The marker tabs through it and
  resizes mid-use. Interactive controls must be focusable and operable by
  keyboard, and state must survive a resize. The spec asks for this outright
  this week ("mouse, keyboard or touch"), and no automated sensor catches it.
- **No fail state.** No score, no losing, no wrong note that punishes. If a
  design decision makes a player feel they played it wrong, it's out.
- **Never commit secrets.** No keys, tokens, or passwords in tracked files. The
  pre-commit hook is the sensor that matters; if something leaks, rotate it.

## Web Audio, specifically

The stack facts that are easy to get wrong this week. Add to these as they bite.

- **The `AudioContext` starts suspended.** The autoplay policy means nothing
  sounds until a real user gesture resumes it. Create the context lazily or
  `resume()` it on the first pointer/key event — a context built at page load
  is silent, and silent looks identical to broken.
- **One `AudioContext` for the page.** Contexts are expensive and browsers cap
  them. Build one, hang everything off it.
- **Never set an audio param with a bare assignment during play.** Stepping
  `gain.value` or `frequency.value` mid-note clicks audibly. Use
  `setValueAtTime` / `linearRampToValueAtTime` / `setTargetAtTime` on
  `ctx.currentTime`, and give every note a short attack and release envelope.
- **Schedule against `ctx.currentTime`, not `Date.now()` or a timer.** Audio
  runs on its own clock; anything sequenced off `setInterval` drifts and
  jitters.
- **Oscillators are single-use.** `start()` once, `stop()` once, then throw it
  away and make a new one. Disconnect stopped nodes or they accumulate.

## The working loop

0. The shell here is **fish**, not bash. Scripts and compound commands must be
   fish-compatible, or invoked explicitly through `bash -c`.
1. Keep `pnpm dev` running; watch changes as you make them. Open it at
   `/comp4020-crit4-Yimche/`, under the base path.
2. **Verify against the rendered page, not your mental model of it.** Use
   `agent-browser` to look at the real DOM/output before believing a change
   worked. The rendered page is the truth.
3. **Then listen.** No check in this repo can hear the instrument, and an agent
   cannot hear it at all. A spec test proving an `OscillatorNode` was created
   says nothing about whether the result is musical, whether the attack clicks,
   or whether the gesture is expressive or just exhausting. My ear is the
   harness this week: every audible change gets played before it's accepted.
4. Before every push, run **`pnpm check`** (typecheck → build → lint → spec).
   The CI link check now crawls `astro preview` under the base path, so the old
   `linkinator ./dist` one-liner no longer matches what CI does.
5. **Commit when the checks pass. Never commit a red state** — with one
   deliberate exception: a *new spec test that encodes a contract not yet
   built* may be committed red, on its own, because the red→green transition is
   the process evidence the course reads (see the harness log). The rule
   protects the build, typecheck, lint, existing contracts, and the branch tip
   at ship time; it does not forbid intentional test-first reds. Small, frequent
   commits — the trail is the evidence.
6. Ship with time for CI to finish. "Still running" counts as not green at the
   sweep, fifteen minutes after the cutoff.

## When a check goes red

- **Read the failure output before changing anything.** It names the file, the
  line, or the contract. It's an instruction, not noise.
- **Fix at the source, not the symptom.** A type error is the compiler telling
  you a claim in the code is false — make the claim true, don't cast it away.
- Treat red as authoritative: the page is wrong until the check is green, not
  until you decide it should be.
- If the same class of failure keeps recurring, the fix is a **new rule in this
  file or a new check** — see below.

## Sensors (the roster `pnpm check` runs)

`typecheck` · `build` · `deploy/online` · `spec` (invariants + this week's
`spec/*.test.ts`) · `lint` (stylelint, oxlint) · `tests` · `evidence`
(`check:evidence`) · `links` · `secrets`.

Nothing here measures **accessibility**, **performance**, or — this week, the
big one — **anything audible**. Those are unwatched, and the unwatched gap is
wider than usual: the whole point of the artefact passes through a sense no
sensor in this repo has.

## Process evidence (part of the mark, unseen by the checks)

- **Commit legibly and as you go.** A history that grew with the code is the
  strongest evidence; a night-before dump is the weakest.
- **`PROCESS.md`: 400–600 words, three or four moments — not more.** Each moment
  says what you did *instead of* the obvious thing, and how you knew the result
  was right. Cite each to a commit/range that resolves (`check:evidence`
  verifies this). The strongest moments are corrections that landed in the
  **harness** — a rule added here, a check wired up, an attempt thrown away —
  not retries.
- **Reflection: `reflections/crit-4.md`.** The breakthrough that moved the work
  forward and what it changed about the developer you want to be. Due at the
  cutoff — no file, no shipped week. Open the pod crit with thirty seconds on
  that breakthrough.

## Harness log (grow this)

The gap between this boilerplate and my own version is part of the mark. When
the work gets corrected at the harness level, the rule lands here so it holds
next time. Cumulative across the course.

- Never use emdashes, "--" or any other AI-isms.
- **Test-first reds are allowed to be committed; nothing else red is.** The
  course wants the red→green of a spec test visible in history, but the branch
  tip must be green at the cutoff and CI must not be left red. So a new
  `spec/*.test.ts` that encodes a not-yet-built contract may be committed on its
  own while failing; the very next commits turn it green. This is the only red a
  commit may carry, and it never applies to the build, typecheck, lint, or an
  existing contract. (Reconciles the course `start` skill with step 5 above.)
- **Keep the harness in the repo, not in `~/.claude/`.** Config, skills,
  settings, and self-edits belong in this repo (`CLAUDE.md`, `AGENTS.md`,
  `.claude/`, `spec/`). Two reasons that both bite: the harness is process
  evidence a marker reads directly, and it must travel with the repo when it
  goes public. Global config is invisible to both.
- **One source of truth per fact.** `CLAUDE.md` is the map (what the repo is,
  where things live, a short set of critical reminders); this file is the
  operating harness. Detailed rules live here and only there. When they overlap,
  `CLAUDE.md` keeps the high-level version and this file keeps the detail, so
  the two can't drift.
- **Generalise the model before scaling the data.** When a change asks for
  "more and finer", push the new structure through the pure model and its
  contract first, and land the bulk data last against contracts that already
  generalised. The big data commit then stays green because nothing about its
  shape is new. (From A1: grouping the lanes, then 22 civilisations to 60.)
- **Measure the rendered page before choosing a fit, and split by viewport.**
  "Make it fit" is not one problem at 1920 and 390. Measure first, then let each
  viewport have its own answer rather than forcing one compromise on both. Fit
  is CSS with no pure-model sensor, so the real check is a screenshot at each
  marked size, not a passing unit test; only the navigation contract the fit
  introduces is unit-testable. (From A1.)
- **A relative URL resolved against the base path drops its last segment.**
  `BASE_URL` is `/comp4020-crit4-Yimche` with no trailing slash, so
  `new URL("card.png", BASE_URL)` yields `/card.png` — serves fine locally,
  404s on Pages. Join the base explicitly, and make `og:image` absolute since a
  scraper resolves it against nothing. Found by reading `dist/index.html` after
  the Astro conversion, not by a check: the card invariant asserts the tag is
  **present**, not that it resolves. (C4, first commit.)
- **A green check is not a verified output — know which sense the sensor
  lacks.** The conversion script reported success while having silently dropped
  the head's description and card meta; the invariants caught those two because
  they assert presence, and missed the broken path because nothing asserts
  resolution. Generalise: for every artefact, name what the roster cannot see
  and verify that part by hand. This week the whole artefact is audible and the
  roster is deaf. (C4.)
