# COMP4020 — Crit 4 prototype

A static, client-side **musical instrument** built with HTML/CSS/TypeScript on
Astro, deployed to GitHub Pages. Sound is synthesised live in the page by the
player. The **deployed URL** is what's marked — live in Chrome, at **1920×1080**
and **390×844**, both in full.

## Read AGENTS.md first

`AGENTS.md` is the operating harness: the working loop, the sensors `pnpm check`
runs, what to do when a check goes red, the hard constraints, and the harness
log that grows as the work corrects itself. **Read it before planning or
building.** Operating rules live there and only there, so this file and that one
never drift — this file is the map, `AGENTS.md` is how the work is run.

## Where things live

- `AGENTS.md` — the operating harness (read first)
- `spec/` — invariants plus this week's spec tests; `spec/README.md` explains
  how the checks map to the brief and spec
- `PROCESS.md` — the reading-guide to the process evidence, each moment cited to
  a commit (`pnpm check:evidence` verifies the citations resolve)
- `reflections/crit-4.md` — the reflection, due at the cutoff; no file, no
  shipped week
- `src/pages/` — every `.astro` route is a page the build picks up;
  `src/layouts/Layout.astro` owns the shared `<head>`

## The link-preview card

`public/card.png` (1200×630) is the image a shared link shows, and
`src/layouts/Layout.astro` points at it. Replace it and the page's
`description`. Every page gets the head through that layout, so there is no head
block to copy by hand — but nothing in CI checks the card resolves, so look at
the deployed head when you add pages. The layout builds the URL absolute from
`BASE_URL`; `AGENTS.md` says why a relative one silently breaks.

## Critical reminders (detail is in AGENTS.md)

- **Never commit secrets.** No keys, tokens, or passwords in tracked files; the
  pre-commit hook is the sensor that matters. If one leaks, rotate it.
- **Commit when checks pass; never commit a red state.** The trail is the
  evidence, so grow it in small, honest steps.
- **Verify against the rendered page**, not your mental model of it — use
  `agent-browser` to look at the real output before believing a change worked.
  This week, verify by **listening** too: no sensor hears the instrument.
- **No em-dashes, no "--", no AI-isms** in anything shipped or written.
- **No identity files.** No name, student number, or personal profile in this
  repo; the marker already knows whose it is, and it goes public when shipped.
