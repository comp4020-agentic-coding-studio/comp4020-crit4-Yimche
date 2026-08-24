// The side-effecting layer: one AudioContext, a lookahead scheduler, and the
// synth voices. Everything musical is decided by the pure model
// (`voiceFor`, `cellsAt`, `stepDuration`); this file only turns those numbers
// into sound. Nothing here is imported by the spec, so the impurity is fenced
// off from the contract.

import { type Section, gestureForCell, voiceFor } from "./instrument.ts";
import { type SequencerState, cellsAt, stepDuration } from "./sequencer.ts";

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.1; // how far ahead of currentTime it schedules

type StepListener = (col: number) => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private running = false;

  constructor(
    private readonly getState: () => SequencerState,
    private readonly onStep: StepListener,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  get isAwake(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** The first-gesture handshake the autoplay policy requires: build the
   *  context lazily, resume it, and start the loop so the metronome ticks and
   *  the playhead moves the instant the orchestra wakes. */
  async wake(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      // Headroom so four stacked sections never clip. Set once, before play.
      this.master.gain.setValueAtTime(0.22, this.ctx.currentTime);
      this.master.connect(this.ctx.destination);
      this.noise = this.buildNoise(this.ctx);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (!this.running) this.start();
  }

  start(): void {
    if (!this.ctx || this.running) return;
    this.running = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  toggleTransport(): void {
    if (this.running) this.stop();
    else this.start();
  }

  // The lookahead scheduler: queue every step that falls inside the window,
  // timed against ctx.currentTime so it never drifts the way a bare setInterval
  // would.
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const state = this.getState();
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(state, this.step, this.nextStepTime);
      this.nextStepTime += stepDuration(state);
      this.step = (this.step + 1) % state.steps;
    }
  }

  private scheduleStep(
    state: SequencerState,
    col: number,
    time: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const velocity = col % 4 === 0 ? 1 : 0.7; // accent the downbeats
    for (const { section, row } of cellsAt(state, col)) {
      const { frequency, gain } = voiceFor(gestureForCell(section, row, velocity));
      if (section.timbre === "noise") this.playNoise(gain, frequency, time);
      else this.playTone(section, frequency, gain, time, state);
    }
    if (col % 4 === 0) this.click(time);
    // Fire the lighting near the moment the step actually sounds.
    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => this.onStep(col), delayMs);
  }

  private playTone(
    section: Section,
    frequency: number,
    gain: number,
    time: number,
    state: SequencerState,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = section.timbre === "triangle" ? "triangle" : "square";
    osc.frequency.setValueAtTime(frequency, time);
    // Bass rings a touch longer; leads stay plucky. Never exceed the step.
    const dur = Math.min(section.timbre === "triangle" ? 0.32 : 0.16, stepDuration(state) * 0.95);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.006); // soft attack, no click
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env).connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private playNoise(gain: number, frequency: number, time: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = this.noise;
    filter.type = "bandpass";
    // Pitch row colours the drum: higher row -> brighter hit.
    filter.frequency.setValueAtTime(frequency, time);
    filter.Q.setValueAtTime(0.8, time);
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    src.connect(filter).connect(env).connect(master);
    src.start(time);
    src.stop(time + 0.14);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private click(time: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1600, time);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.05, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(env).connect(master);
    osc.start(time);
    osc.stop(time + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
