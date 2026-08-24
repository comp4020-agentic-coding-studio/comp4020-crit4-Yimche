// Wire the DOM to the pure sequencer model and the audio engine. The model is
// the single source of truth; the DOM and the lighting are both projections of
// it. Pointer events cover mouse and touch; keydown covers the keyboard; a
// <button> for every control means Space/Enter already work.

import {
  DEFAULT_STEPS,
  activeSections,
  createState,
  isActive,
  setTempo,
  toggle,
} from "../lib/sequencer.ts";
import { AudioEngine } from "../lib/audio.ts";

let state = createState(DEFAULT_STEPS);

const engine = new AudioEngine(
  () => state,
  (col) => paintStep(col),
);

const theatre = document.querySelector<HTMLElement>("[data-theatre]");
const invite = document.querySelector<HTMLElement>("[data-invite]");
const bpmLabel = document.querySelector<HTMLElement>("[data-bpm]");
const transportBtn = document.querySelector<HTMLButtonElement>("[data-transport]");

// A playable control is any of these; delegation keeps one handler per event.
const CONTROL =
  "[data-play][data-section],[data-conductor],[data-transport],[data-tempo],[data-tab]";

async function activate(el: Element): Promise<void> {
  // Any interaction is a user gesture: wake the context and clear the invite.
  await engine.wake();
  dismissInvite();

  if (el instanceof HTMLElement && el.dataset.section) {
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    state = toggle(state, el.dataset.section, row, col);
    setPressed(el, isActive(state, el.dataset.section, row, col));
    refreshLights();
    return;
  }
  if (el.hasAttribute("data-conductor")) {
    // The conductor tap already woke and started the orchestra.
    syncTransport();
    refreshLights();
    return;
  }
  if (el.hasAttribute("data-transport")) {
    engine.toggleTransport();
    syncTransport();
    refreshLights();
    return;
  }
  if (el instanceof HTMLElement && el.dataset.tempo) {
    state = setTempo(state, state.bpm + Number(el.dataset.tempo));
    if (bpmLabel) bpmLabel.textContent = `${state.bpm} BPM`;
    return;
  }
  if (el instanceof HTMLElement && el.dataset.tab) {
    selectTab(el.dataset.tab);
  }
}

function dismissInvite(): void {
  theatre?.classList.add("awake");
  invite?.setAttribute("hidden", "");
}

function setPressed(el: Element, on: boolean): void {
  el.setAttribute("aria-pressed", String(on));
  el.classList.toggle("on", on);
}

function syncTransport(): void {
  if (!transportBtn) return;
  const running = engine.isRunning;
  transportBtn.textContent = running ? "Stop" : "Play";
  transportBtn.setAttribute("aria-pressed", String(running));
}

// The lights are derived from the model each time it changes, never stored
// separately, so a lit tier can't drift from what is actually playing.
function refreshLights(): void {
  const live = engine.isRunning ? new Set(activeSections(state)) : new Set<string>();
  for (const tier of document.querySelectorAll<HTMLElement>("[data-tier]")) {
    tier.classList.toggle("lit", live.has(tier.dataset.tier ?? ""));
  }
  theatre?.classList.toggle("full", live.size === 4);
}

let painted: number | null = null;
function paintStep(col: number): void {
  // Move the playhead and flash the tiers sounding on this beat.
  if (painted !== null) {
    for (const c of document.querySelectorAll(`.cell[data-col="${painted}"]`))
      c.classList.remove("beat");
  }
  for (const c of document.querySelectorAll(`.cell[data-col="${col}"]`))
    c.classList.add("beat");
  painted = col;

  document
    .querySelector("[data-baton]")
    ?.classList.toggle("swing", col % 2 === 0);

  const firing = new Set<string>();
  for (const cell of document.querySelectorAll<HTMLElement>(
    `.cell.on[data-col="${col}"]`,
  )) {
    if (cell.dataset.section) firing.add(cell.dataset.section);
  }
  for (const tier of document.querySelectorAll<HTMLElement>("[data-tier]")) {
    const on = firing.has(tier.dataset.tier ?? "");
    tier.classList.toggle("flash", on);
  }
}

function selectTab(id: string): void {
  for (const tab of document.querySelectorAll<HTMLElement>("[data-tab]"))
    tab.setAttribute("aria-selected", String(tab.dataset.tab === id));
  for (const rack of document.querySelectorAll<HTMLElement>("[data-rack]"))
    rack.classList.toggle("selected", rack.dataset.rack === id);
  for (const tier of document.querySelectorAll<HTMLElement>("[data-tier]"))
    tier.classList.toggle("selected", tier.dataset.tier === id);
}

// Pointer covers mouse and touch; one delegated listener for every control.
document.addEventListener("pointerdown", (event) => {
  const el = (event.target as Element | null)?.closest(CONTROL);
  if (el) {
    event.preventDefault(); // avoid the trailing synthetic click double-firing
    void activate(el);
  }
});

// Keyboard: Space/Enter activate the focused control; arrows walk the grid.
document.addEventListener("keydown", (event) => {
  const el = (event.target as Element | null)?.closest(CONTROL);
  if (!el) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void activate(el);
    return;
  }
  if (el instanceof HTMLElement && el.dataset.section) {
    const moved = walkGrid(el, event.key);
    if (moved) event.preventDefault();
  }
});

function walkGrid(cell: HTMLElement, key: string): boolean {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const section = cell.dataset.section;
  let nextRow = row;
  let nextCol = col;
  if (key === "ArrowLeft") nextCol = col - 1;
  else if (key === "ArrowRight") nextCol = col + 1;
  else if (key === "ArrowUp") nextRow = row + 1; // up = higher pitch
  else if (key === "ArrowDown") nextRow = row - 1;
  else return false;
  const next = document.querySelector<HTMLElement>(
    `.cell[data-section="${section}"][data-row="${nextRow}"][data-col="${nextCol}"]`,
  );
  next?.focus();
  return next !== null;
}

// Cold start: the transport reads "Play", the stage is dim, the invite shows.
syncTransport();
