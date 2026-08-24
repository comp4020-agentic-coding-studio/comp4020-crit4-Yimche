// Wire the DOM to the pure sequencer model and the audio engine. The model is
// the single source of truth; the stage lighting and the grids are both
// projections of it. Pointer events cover mouse and touch; keydown covers the
// keyboard; a <button> for every control means Space/Enter already work.

import {
  DEFAULT_STEPS,
  activeSections,
  createState,
  isActive,
  setTempo,
  toggle,
} from "../lib/sequencer.ts";
import { SECTIONS } from "../lib/instrument.ts";
import { AudioEngine } from "../lib/audio.ts";

let state = createState(DEFAULT_STEPS);
const label = new Map(SECTIONS.map((s) => [s.id, s.label]));

const engine = new AudioEngine(
  () => state,
  (col) => paintStep(col),
);

const theatre = document.querySelector<HTMLElement>("[data-theatre]");
const invite = document.querySelector<HTMLElement>("[data-invite]");
const bpmLabel = document.querySelector<HTMLElement>("[data-bpm]");
const transportBtn = document.querySelector<HTMLButtonElement>("[data-transport]");
const transportPanel = document.querySelector<HTMLElement>("[data-transport-panel]");
const editor = document.querySelector<HTMLElement>("[data-editor]");
const editorTitle = document.querySelector<HTMLElement>("[data-editor-title]");

const CONTROL =
  "[data-cell],[data-group],[data-conductor],[data-transport],[data-tempo],[data-done]";

async function activate(el: Element): Promise<void> {
  await engine.wake(); // any interaction is the user gesture the autoplay policy needs
  dismissInvite();

  if (el instanceof HTMLElement && el.hasAttribute("data-cell")) {
    const section = el.dataset.section ?? "";
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    state = toggle(state, section, row, col);
    setPressed(el, isActive(state, section, row, col));
    refreshLights();
    return;
  }
  if (el instanceof HTMLElement && el.dataset.group) {
    bounce(el);
    openEditor(el.dataset.group);
    return;
  }
  if (el.hasAttribute("data-conductor")) {
    toggleTransportPanel();
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
  if (el.hasAttribute("data-done")) {
    closeEditor();
    return;
  }
  if (el instanceof HTMLElement && el.dataset.tempo) {
    state = setTempo(state, state.bpm + Number(el.dataset.tempo));
    if (bpmLabel) bpmLabel.textContent = `${state.bpm} BPM`;
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

function bounce(el: HTMLElement): void {
  el.classList.remove("bounce");
  void el.offsetWidth; // restart the animation
  el.classList.add("bounce");
}

// The conductor's transport is his panel: tapping him pops it up over the
// podium and taps it away again, mirroring how a musician opens their part.
function toggleTransportPanel(): void {
  if (!transportPanel) return;
  const open = transportPanel.hasAttribute("hidden");
  transportPanel.toggleAttribute("hidden", !open);
  const conductor = document.querySelector<HTMLElement>("[data-conductor]");
  conductor?.setAttribute("aria-expanded", String(open));
  if (open) transportPanel.querySelector<HTMLElement>("[data-transport]")?.focus();
}

// ---- the music layer: hidden until a musician is picked -----------------

function openEditor(sectionId: string): void {
  if (!editor) return;
  for (const rack of editor.querySelectorAll<HTMLElement>("[data-rack]"))
    rack.toggleAttribute("hidden", rack.dataset.rack !== sectionId);
  if (editorTitle) editorTitle.textContent = label.get(sectionId) ?? "Part";
  editor.dataset.section = sectionId;
  editor.removeAttribute("hidden");
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.toggle("editing", group.dataset.group === sectionId);
  editor
    .querySelector<HTMLElement>(`[data-rack="${sectionId}"] .cell`)
    ?.focus();
}

function closeEditor(): void {
  if (!editor) return;
  editor.setAttribute("hidden", "");
  const section = editor.dataset.section;
  document
    .querySelector<HTMLElement>(`[data-group="${section}"]`)
    ?.focus();
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.remove("editing");
}

// ---- transport + lighting (derived from the model) ----------------------

function syncTransport(): void {
  if (!transportBtn) return;
  const running = engine.isRunning;
  transportBtn.textContent = running ? "Stop" : "Play";
  transportBtn.setAttribute("aria-pressed", String(running));
}

// Lights are recomputed from the model, never stored, so a lit musician can't
// drift from what is actually scheduled.
function refreshLights(): void {
  const live = engine.isRunning ? new Set(activeSections(state)) : new Set<string>();
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.toggle("lit", live.has(group.dataset.group ?? ""));
  theatre?.classList.toggle("full", live.size === SECTIONS.length);
}

let painted: number | null = null;
function paintStep(col: number): void {
  if (painted !== null) {
    for (const c of document.querySelectorAll(`.cell[data-col="${painted}"]`))
      c.classList.remove("beat");
  }
  for (const c of document.querySelectorAll(`.cell[data-col="${col}"]`))
    c.classList.add("beat");
  painted = col;

  // Flash whichever musicians are sounding on this beat.
  const firing = new Set<string>();
  for (const cell of document.querySelectorAll<HTMLElement>(
    `.cell.on[data-col="${col}"]`,
  )) {
    if (cell.dataset.section) firing.add(cell.dataset.section);
  }
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.toggle("flash", firing.has(group.dataset.group ?? ""));
}

// ---- input --------------------------------------------------------------

// Pointer covers mouse and touch; one delegated listener for every control.
document.addEventListener("pointerdown", (event) => {
  const el = (event.target as Element | null)?.closest(CONTROL);
  if (el) {
    event.preventDefault(); // stop the trailing synthetic click double-firing
    void activate(el);
  }
});

// Keyboard: Space/Enter activate the focused control; arrows walk the grid;
// Escape closes the music layer.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editor && !editor.hasAttribute("hidden")) {
    closeEditor();
    return;
  }
  const el = (event.target as Element | null)?.closest(CONTROL);
  if (!el) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void activate(el);
    return;
  }
  if (el instanceof HTMLElement && el.hasAttribute("data-cell")) {
    if (walkGrid(el, event.key)) event.preventDefault();
  }
});

function walkGrid(cell: HTMLElement, key: string): boolean {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const section = cell.dataset.section;
  let r = row;
  let c = col;
  if (key === "ArrowLeft") c -= 1;
  else if (key === "ArrowRight") c += 1;
  else if (key === "ArrowUp") r += 1; // up = higher pitch
  else if (key === "ArrowDown") r -= 1;
  else return false;
  const next = document.querySelector<HTMLElement>(
    `.cell[data-section="${section}"][data-row="${r}"][data-col="${c}"]`,
  );
  next?.focus();
  return next !== null;
}

// Cold start: transport reads "Play", stage dim, invite showing.
syncTransport();
