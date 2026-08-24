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
    openEditor(el.dataset.group, el);
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

// The panel is a transient pop-up, not a permanent HUD: tapping anything that
// isn't the panel or the conductor dismisses it.
function closeTransportPanel(): void {
  if (!transportPanel || transportPanel.hasAttribute("hidden")) return;
  transportPanel.setAttribute("hidden", "");
  document
    .querySelector<HTMLElement>("[data-conductor]")
    ?.setAttribute("aria-expanded", "false");
}

// ---- the music layer: hidden until a musician is picked -----------------

// The group the popup currently belongs to, kept so it can be re-anchored above
// the same musician when the viewport changes.
let editingGroup: HTMLElement | null = null;

function openEditor(sectionId: string, groupEl: HTMLElement): void {
  if (!editor) return;
  for (const rack of editor.querySelectorAll<HTMLElement>("[data-rack]"))
    rack.toggleAttribute("hidden", rack.dataset.rack !== sectionId);
  if (editorTitle) editorTitle.textContent = label.get(sectionId) ?? "Part";
  editor.dataset.section = sectionId;
  // Tint the popup's frame with this section's stage-light colour, so the card
  // reads as belonging to the musician you tapped.
  editor.style.setProperty("--hue", `var(--hue-${sectionId})`);
  editor.removeAttribute("hidden");
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.toggle("editing", group.dataset.group === sectionId);
  editingGroup = groupEl;
  positionEditor(groupEl);
  editor
    .querySelector<HTMLElement>(`[data-rack="${sectionId}"] .cell`)
    ?.focus();
}

// Float the popup above the tapped musician's head, centred on them, then clamp
// it to the viewport so a wide part never runs off screen. Fixed positioning
// keeps it clear of the stage's own overflow clip.
function positionEditor(groupEl: HTMLElement): void {
  if (!editor) return;
  const g = groupEl.getBoundingClientRect();
  const margin = 8;
  const left = clamp(
    g.left + g.width / 2 - editor.offsetWidth / 2,
    margin,
    window.innerWidth - editor.offsetWidth - margin,
  );
  // Clear the musician's dashed selection outline: a gap between the card and
  // the tapped player, rather than the two touching.
  const top = Math.max(margin, g.top - editor.offsetHeight - 20);
  editor.style.left = `${Math.round(left)}px`;
  editor.style.top = `${Math.round(top)}px`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}

function closeEditor(): void {
  if (!editor) return;
  editor.setAttribute("hidden", "");
  const section = editor.dataset.section;
  const group = document.querySelector<HTMLElement>(`[data-group="${section}"]`);
  for (const g of document.querySelectorAll<HTMLElement>("[data-group]"))
    g.classList.remove("editing");
  editingGroup = null;
  // Return focus to the musician only for keyboard users. A pointer tap on Done
  // should not leave a white focus ring around the group while it plays; instead
  // let focus fall away from the now-hidden Done button.
  if (keyboardMode) group?.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
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
  const running = engine.isRunning;
  const live = running ? new Set(activeSections(state)) : new Set<string>();
  // The whole rig hangs off the running state: Stop clears it, Play brings it
  // back. The director beam is the one light not keyed to a section, so it rides
  // the `running` class in CSS rather than the live set below.
  theatre?.classList.toggle("running", running);
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]"))
    group.classList.toggle("lit", live.has(group.dataset.group ?? ""));
  for (const beam of document.querySelectorAll<HTMLElement>("[data-beam]"))
    beam.classList.toggle("on", live.has(beam.dataset.beam ?? ""));
  theatre?.classList.toggle("full", live.size === SECTIONS.length);
  updateGroupsEnabled();
  // Stopping kills every light: also clear the per-beat flashes and the
  // playhead, so nothing is left glowing from the last step that sounded.
  if (!running) {
    for (const el of document.querySelectorAll(".flash")) el.classList.remove("flash");
    for (const cell of document.querySelectorAll(".cell.beat")) cell.classList.remove("beat");
    painted = null;
  }
}

// The musicians stay locked until the show has actually started: you wake the
// conductor and press Play first. Once it has run, they stay unlocked so you can
// still edit a part while stopped.
let groupsUnlocked = false;
function updateGroupsEnabled(): void {
  if (!groupsUnlocked && engine.isRunning) groupsUnlocked = true;
  for (const g of document.querySelectorAll<HTMLButtonElement>("[data-group]"))
    g.disabled = !groupsUnlocked;
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
  for (const beam of document.querySelectorAll<HTMLElement>("[data-beam]"))
    beam.classList.toggle("flash", firing.has(beam.dataset.beam ?? ""));
}

// ---- input --------------------------------------------------------------

// Which device drove the last activation, so closeEditor knows whether to
// restore a visible focus ring (keyboard) or leave focus alone (pointer).
let keyboardMode = false;

// Pointer covers mouse and touch; one delegated listener for every control.
document.addEventListener("pointerdown", (event) => {
  const target = event.target as Element | null;
  // Dismiss the transport panel on any tap that isn't the panel itself or the
  // conductor (whose own tap toggles it). So it vanishes when you go elsewhere.
  if (
    target &&
    !target.closest("[data-transport-panel]") &&
    !target.closest("[data-conductor]")
  ) {
    closeTransportPanel();
  }
  const el = target?.closest(CONTROL);
  if (el) {
    event.preventDefault(); // stop the trailing synthetic click double-firing
    keyboardMode = false;
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
  if (event.key === "Escape") closeTransportPanel();
  const el = (event.target as Element | null)?.closest(CONTROL);
  if (!el) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    keyboardMode = true;
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

// Keep an open popup anchored over its musician when the viewport changes, so
// the part survives a resize where the reader expects it.
window.addEventListener("resize", () => {
  if (editor && !editor.hasAttribute("hidden") && editingGroup)
    positionEditor(editingGroup);
});

// Cold start: transport reads "Play", stage dim, invite showing.
syncTransport();
