# AGENTS.md

The working harness for this repo — standing rules for any agent (and me). Read
it before planning or building, and re-read when a check keeps catching you out.
It's also read as process evidence, so keep it honest and current: a correction
about *how the work is run* lands here as a new rule, not in a retry.

> `CLAUDE.md` is the map; keep operating rules here so the two don't drift.

Carried forward from `comp4020-ass1-Yimche`. The harness log at the bottom is
cumulative across the course; the sections above are re-answered each week.

## What this is

A **musical instrument in the browser** a stranger can pick up and play. Static,
client-side, Web Audio, deployed to GitHub Pages.

- **The instrument:** *(not chosen yet — name it here before building, in one
  sentence a stranger would understand.)*
- **The player acts and the page sounds** — live synthesis, not file playback.

Everything in scope serves playability. If a feature doesn't make the thing
better to play, it's out.

## What's marked

A **crit week**, 2% total, two halves scored independently:

1. **1 mark — shipped at the cutoff.** The sweep runs **15 min after** Wed 12:00
   and needs all three: pushed, live at the derived URL, and
   `reflections/crit-4.md` present. Full mark only if checks had **gone green**
   by the sweep — red, still running, or none is 0.5. Ship with time for CI.
2. **1 mark — contribution in the session.** Present to the pod, give real
   critique, work the riff, account for how the agent produced the work.
   **Attendance is a condition of both marks.**

`PROCESS.md` and the reflection aren't graded weekly (reflection counts as
present or not), but A2 reads this repo's history — write them for a reader.

No sensor holds the judged part: whether the opening screen **invites the first
sound**, whether the thing is **expressive**, whether playing feels good. That's
what the pod plays cold.

## The core interaction (state it testably)

Name the one thing the player does, plainly enough to write a test for, and back
it with a `spec/*.test.ts`. If you can't write the test, the interaction isn't
defined yet.

- **Interaction:** *(fill in: what gesture makes what sound, and how the
  player's choices shape it.)*
- **Fit both marked viewports.** A gesture that works with a mouse may not with a
  thumb. Pointer events cover both; verify by playing it at each size.
- **Testable claim:** *(fill in, naming the spec files.)*

Keep this line and its test in sync with the page. A passing test describing old
behaviour is a lie in the harness.

## Hard constraints

- **Static and client-side only.** No server, backend, or secrets. A build step
  needing a network call is a smell — stop and reconsider.
- **Both viewports count in full.** Verify desktop **and** phone every layout
  change; don't assume one from the other.
- **GitHub Pages base path.** The site lives under `…github.io/<repo>/`. Astro's
  `base` is set in `astro.config.ts` and the dev server serves under it, so path
  bugs reproduce locally. Internal links must be relative or
  `import.meta.env.BASE_URL`-prefixed; root-absolute paths 404 live. See the
  harness log for the trailing-slash trap.
- **Commit `pnpm-lock.yaml`.** CI installs with `--frozen-lockfile`; a dependency
  change not in the committed lockfile fails the build though it works locally.
- **Keyboard and resize are part of "working."** Controls must be focusable and
  keyboard-operable, and state must survive a resize. The spec asks for it this
  week ("mouse, keyboard or touch"); no automated sensor catches it.
- **No fail state.** No score, no losing, no punishing wrong note. If a decision
  makes a player feel they played it wrong, it's out.
- **Never commit secrets.** The pre-commit hook is the sensor; if something
  leaks, rotate it.

## Web Audio, specifically

Stack facts easy to get wrong. Add to these as they bite.

- **The `AudioContext` starts suspended.** Autoplay policy means nothing sounds
  until a real user gesture resumes it. Create it lazily or `resume()` on the
  first pointer/key event — a context built at page load is silent, and silent
  looks identical to broken.
- **One `AudioContext` for the page.** They're expensive and browsers cap them.
  Build one, hang everything off it.
- **Never set an audio param by bare assignment during play.** Stepping
  `gain.value` or `frequency.value` mid-note clicks. Use `setValueAtTime` /
  `linearRampToValueAtTime` / `setTargetAtTime` on `ctx.currentTime`, and give
  every note a short attack/release envelope.
- **Schedule against `ctx.currentTime`,** not `Date.now()` or a timer. Anything
  sequenced off `setInterval` drifts and jitters.
- **Oscillators are single-use.** `start()` once, `stop()` once, throw it away.
  Disconnect stopped nodes or they accumulate.

## The working loop

0. The shell is **fish**, not bash. Compound commands must be fish-compatible or
   run through `bash -c`.
1. Keep `pnpm dev` running; open it at `/comp4020-crit4-Yimche/`, under the base
   path.
2. **Verify against the rendered page, not your mental model.** Use
   `agent-browser` to look at the real DOM before believing a change worked.
3. **Then listen.** No check here can hear the instrument, and an agent can't at
   all. A test proving an `OscillatorNode` exists says nothing about whether the
   result is musical or the attack clicks. My ear is the harness this week: every
   audible change gets played before it's accepted.
4. Before every push run **`pnpm check`** (typecheck → build → lint → spec). The
   CI link check crawls `astro preview` under the base path.
5. **Commit when checks pass. Never commit a red state** — except a *new spec
   test encoding a not-yet-built contract*, committed red on its own, because the
   red→green is the process evidence the course reads. The rule protects the
   build, typecheck, lint, existing contracts, and the branch tip at ship time.
   Small, frequent commits.
6. Ship with time for CI. "Still running" counts as not green at the sweep.

## When a check goes red

- **Read the failure output first.** It names the file, line, or contract — an
  instruction, not noise.
- **Fix at the source, not the symptom.** A type error is a false claim in the
  code — make it true, don't cast it away.
- Treat red as authoritative: the page is wrong until the check is green.
- If a class of failure recurs, the fix is a **new rule here or a new check**.

## Sensors (`pnpm check` roster)

`typecheck` · `build` · `deploy/online` · `spec` (invariants + this week's
`spec/*.test.ts`) · `lint` (stylelint, oxlint) · `tests` · `evidence`
(`check:evidence`) · `links` · `secrets`.

Nothing measures **accessibility**, **performance**, or — this week — **anything
audible**. The whole point of the artefact passes through a sense no sensor here
has.

## Process evidence (marked, unseen by checks)

- **Commit legibly and as you go.** History that grew with the code is the
  strongest evidence; a night-before dump is the weakest.
- **`PROCESS.md`: 400–600 words, three or four moments.** Each says what you did
  *instead of* the obvious thing, and how you knew the result was right. Cite each
  to a commit/range (`check:evidence` verifies). Strongest moments are
  corrections that landed in the **harness**, not retries.
- **Reflection: `reflections/crit-4.md`.** The breakthrough that moved the work
  forward and what it changed about the developer you want to be. Due at the
  cutoff. Open the pod crit with thirty seconds on it.

## Harness log (grow this)

When work gets corrected at the harness level, the rule lands here so it holds
next time. Cumulative across the course.

- Never use em-dashes, "--", or any AI-isms.
- **Test-first reds may be committed; nothing else red may.** The course wants
  the red→green of a spec test visible in history, but the branch tip must be
  green at the cutoff and CI must not be left red. A new `spec/*.test.ts` for a
  not-yet-built contract may be committed failing, on its own; the next commits
  turn it green. Never applies to the build, typecheck, lint, or an existing
  contract.
- **Keep the harness in the repo, not `~/.claude/`.** Config, skills, settings,
  and self-edits belong in this repo (`CLAUDE.md`, `AGENTS.md`, `.claude/`,
  `spec/`). It's process evidence a marker reads directly, and it must travel with
  the repo when it goes public. Global config is invisible to both.
- **One source of truth per fact.** `CLAUDE.md` keeps the high-level version;
  this file keeps the detail. So they can't drift.
- **Generalise the model before scaling the data.** When a change asks for "more
  and finer", push the new structure through the pure model and its contract
  first, land bulk data last against contracts that already generalised. (A1:
  grouping the lanes, then 22 civilisations to 60.)
- **Measure the rendered page before choosing a fit, and split by viewport.**
  "Make it fit" isn't one problem at 1920 and 390. Measure first, let each
  viewport have its own answer. Fit has no pure-model sensor — the real check is a
  screenshot at each size, not a passing unit test. (A1.)
- **A relative URL resolved against the base path drops its last segment.**
  `BASE_URL` is `/comp4020-crit4-Yimche` with no trailing slash, so
  `new URL("card.png", BASE_URL)` yields `/card.png` — fine locally, 404s on
  Pages. Join the base explicitly, and make `og:image` absolute since a scraper
  resolves it against nothing. The card invariant asserts the tag is **present**,
  not that it resolves. (C4, first commit.)
- **A green check is not a verified output — know which sense the sensor lacks.**
  The conversion script reported success while silently dropping the head's
  description and card meta; invariants caught those (they assert presence) and
  missed the broken path (nothing asserts resolution). For every artefact, name
  what the roster can't see and verify that part by hand. This week the artefact
  is audible and the roster is deaf. (C4.)
