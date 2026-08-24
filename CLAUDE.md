# COMP4020 — Crit 4 prototype

A static, client-side **musical instrument** (HTML/CSS/TypeScript on Astro),
deployed to GitHub Pages. Sound is synthesised live in the page. The **deployed
URL** is marked — live in Chrome, at **1920×1080** and **390×844**, both in full.

## Read AGENTS.md first

`AGENTS.md` is the operating harness: the working loop, the sensors `pnpm check`
runs, what to do on a red check, the hard constraints, and the cumulative
harness log. **Read it before planning or building.** Operating rules live there
only, so the two files never drift — this file is the map, `AGENTS.md` is how the
work is run.

## Where things live

- `AGENTS.md` — the operating harness (read first)
- `spec/` — invariants plus this week's spec tests; `spec/README.md` maps checks
  to the brief
- `PROCESS.md` — reading-guide to the process evidence, each moment cited to a
  commit (`pnpm check:evidence` verifies citations resolve)
- `reflections/crit-4.md` — the reflection, due at the cutoff; no file, no
  shipped week
- `src/pages/` — every `.astro` route is a page; `src/layouts/Layout.astro` owns
  the shared `<head>`

## The link-preview card

`public/card.png` (1200×630) is the shared-link image; `src/layouts/Layout.astro`
points at it. Replace it and the page `description`. The layout gives every page
its head, but nothing in CI checks the card resolves — check the deployed head
when you add pages. The layout builds the URL absolute from `BASE_URL`;
`AGENTS.md` says why a relative one silently breaks.

## Critical reminders (detail in AGENTS.md)

- **Never commit secrets.** No keys/tokens/passwords in tracked files; the
  pre-commit hook is the sensor. If one leaks, rotate it.
- **Commit when checks pass; never commit a red state** (except a test-first red;
  see AGENTS.md). The trail is the evidence — small, honest steps.
- **Verify against the rendered page** with `agent-browser`, not your mental
  model. This week, verify by **listening** too: no sensor hears the instrument.
- **No em-dashes, no "--", no AI-isms** in anything shipped or written.
- **No identity files.** No name, student number, or personal profile — the repo
  goes public when shipped.
