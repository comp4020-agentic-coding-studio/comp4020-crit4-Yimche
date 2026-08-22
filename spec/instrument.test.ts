import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// C4 "An instrument" — the mechanically checkable lines of the published spec:
// https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/04-instrument/
//
// These assert the CONTRACT (what the page must do), not the implementation, so
// they survive changing the instrument or the stack. They run against the BUILT
// site for the same reason the invariants do: it is what actually ships.
//
// Four spec lines are NOT here, on purpose:
//   - "deployed and live at its public URL" — CI and the sweep verify this
//   - "there is no way to play it wrong" — judged; a word blacklist would be
//     theatre, not backpressure
//   - "a stranger can play it uninstructed" — judged. The invite test below is
//     only a floor: it proves an invitation EXISTS, never that it works
//   - "you can account for how you directed the work" — judged, at the crit
const DIST = resolve("dist");

function files(dir: string = DIST): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const shipped = files().map((path) => relative(DIST, path).split(sep).join("/"));

const pages = shipped
  .filter((name) => name.endsWith(".html"))
  .map((name) => ({
    name,
    doc: new JSDOM(readFileSync(join(DIST, name), "utf8")).window.document,
  }));

const scripts = shipped
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(join(DIST, name), "utf8"))
  .join("\n");

const inlineScripts = pages
  .flatMap(({ doc }) => [...doc.querySelectorAll("script:not([src])")])
  .map((node) => node.textContent ?? "")
  .join("\n");

const code = `${scripts}\n${inlineScripts}`;

describe("spec: the browser is the instrument", () => {
  // "sound is made live in the page by the player, not played back"
  it("synthesises through the Web Audio API", () => {
    expect(
      /AudioContext/.test(code),
      "nothing in the shipped JS builds an AudioContext, so nothing can sound",
    ).toBe(true);
  });

  it("ships no recorded audio to play back", () => {
    const media = shipped.filter((name) =>
      /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(name),
    );
    expect(
      media,
      "playback is not synthesis: the sound must be made in the page",
    ).toEqual([]);
  });

  it("has no audio element standing in for synthesis", () => {
    for (const { name, doc } of pages) {
      expect(
        doc.querySelector("audio"),
        `${name} plays a file back rather than making the sound`,
      ).toBeNull();
    }
    expect(/new Audio\s*\(/.test(code)).toBe(false);
  });
});

describe("spec: playable with whatever is at hand", () => {
  // "mouse, keyboard or touch". Mark every playable control data-play.
  const NATIVELY_FOCUSABLE = new Set([
    "A",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
  ]);

  it("exposes playable controls", () => {
    const controls = pages.flatMap(({ doc }) => [
      ...doc.querySelectorAll("[data-play]"),
    ]);
    expect(
      controls.length,
      "mark each playable control data-play so this contract can see it",
    ).toBeGreaterThan(0);
  });

  it("every playable control is reachable by keyboard", () => {
    for (const { name, doc } of pages) {
      for (const control of doc.querySelectorAll("[data-play]")) {
        const tabindex = control.getAttribute("tabindex");
        const focusable =
          NATIVELY_FOCUSABLE.has(control.tagName) ||
          (tabindex !== null && Number(tabindex) >= 0);
        expect(
          focusable,
          `${name}: <${control.tagName.toLowerCase()}> can be played by mouse but not reached by keyboard`,
        ).toBe(true);
        expect(
          control.getAttribute("aria-hidden"),
          `${name}: a playable control is hidden from assistive tech`,
        ).not.toBe("true");
      }
    }
  });

  it("responds to pointer input, which covers mouse and touch alike", () => {
    expect(
      /pointer(down|up|move|enter)/i.test(code),
      "mouse-only handlers leave a phone silent; pointer events cover both",
    ).toBe(true);
  });

  it("responds to keyboard input", () => {
    expect(/key(down|up|press)/i.test(code)).toBe(true);
  });
});

describe("spec: the opening screen invites the first sound", () => {
  // A floor, not the judged line. The AudioContext starts suspended until a
  // user gesture, so a page with nothing inviting one is silent on arrival.
  it("offers an invitation before any sound has been made", () => {
    const invites = pages.flatMap(({ doc }) => [
      ...doc.querySelectorAll("[data-invite]"),
    ]);
    expect(
      invites.length,
      "mark the opening invitation data-invite — the thing that asks for the first gesture",
    ).toBeGreaterThan(0);
    for (const invite of invites) {
      expect(
        (invite.textContent ?? "").trim(),
        "an empty invitation invites nothing",
      ).not.toBe("");
    }
  });
});

describe("spec: it is expressive", () => {
  // "the player's choices shape what they hear, and two players sound
  // different". Only testable if the mapping from gesture to sound is a PURE
  // function, separate from the audio side effects — which is the right shape
  // anyway. Keep `voiceFor` pure and this stays honest.
  //
  // Dynamic import so a missing module fails THIS test rather than typecheck:
  // the harness allows a red spec test, not a red typecheck.
  interface Voice {
    frequency: number;
    gain: number;
  }
  type VoiceFor = (gesture: { x: number; y: number }) => Voice;

  async function load(): Promise<VoiceFor> {
    const specifier = new URL("../src/lib/instrument.ts", import.meta.url).href;
    const mod: unknown = await import(/* @vite-ignore */ specifier);
    return (mod as { voiceFor: VoiceFor }).voiceFor;
  }

  const sample = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0, y: 0.5 },
    { x: 1, y: 1 },
    { x: 0.25, y: 0.75 },
  ];

  it("maps a gesture to a voice through a pure function", async () => {
    const voiceFor = await load();
    for (const gesture of sample) {
      expect(voiceFor(gesture)).toEqual(voiceFor(gesture));
    }
  });

  it("different gestures sound different", async () => {
    const voiceFor = await load();
    const voices = sample.map((gesture) => JSON.stringify(voiceFor(gesture)));
    expect(
      new Set(voices).size,
      "if distinct gestures collapse to one voice, the player's choices shape nothing",
    ).toBe(sample.length);
  });

  it("every voice it can produce is audible", async () => {
    const voiceFor = await load();
    for (const gesture of sample) {
      const { frequency, gain } = voiceFor(gesture);
      expect(frequency).toBeGreaterThan(20);
      expect(frequency).toBeLessThan(20000);
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThanOrEqual(1);
    }
  });
});
