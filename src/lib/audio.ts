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

// A single-cycle pulse (rectangular) wave of a given duty cycle, as a
// PeriodicWave. Two duty cycles give the two NES pulse channels their own
// character: 50% is the full, bright square; 25% is a thinner, reedier tone, so
// the lead and the harmony read as two different instruments, not one doubled.
function makePulse(ctx: AudioContext, duty: number, n = 24): PeriodicWave {
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i++)
    real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private pulse50: PeriodicWave | null = null;
  private pulse25: PeriodicWave | null = null;
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

  /** The first-gesture handshake the autoplay policy requires: build the context
   *  lazily and resume it, so sound is unlocked. It does NOT start the transport
   *  loop; that is the caller's decision (the first wake starts it, Stop halts
   *  it, Play resumes it), so pressing Play never fights an auto-start here. */
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
      this.pulse50 = makePulse(this.ctx, 0.5);
      this.pulse25 = makePulse(this.ctx, 0.25);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
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
      if (section.timbre === "noise") this.playDrum(row, section.rows, gain, time);
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
    if (section.timbre === "triangle") {
      osc.type = "triangle";
    } else if (section.id === "harmony" && this.pulse25) {
      osc.setPeriodicWave(this.pulse25); // reedy 25% pulse
    } else if (this.pulse50) {
      osc.setPeriodicWave(this.pulse50); // bright 50% pulse
    } else {
      osc.type = "square";
    }
    osc.frequency.setValueAtTime(frequency, time);
    // Bass rings a touch longer; leads stay plucky. Never exceed the step.
    const dur = Math.min(section.timbre === "triangle" ? 0.34 : 0.18, stepDuration(state) * 0.95);
    // Attack, a quick decay to a sustain plateau, then release: gives the note
    // an envelope shape instead of a flat beep, without ever clicking.
    const sustain = Math.max(0.0001, gain * 0.6);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.006);
    env.gain.exponentialRampToValueAtTime(sustain, time + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env).connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  // A little drum kit rather than one filtered hiss: the pitch row picks the
  // piece, low to high, so a player can lay down kick / snare / hat patterns.
  private playDrum(row: number, rows: number, gain: number, time: number): void {
    const rel = rows <= 1 ? 0 : row / (rows - 1); // 0 low .. 1 high
    if (rel < 0.34) this.kick(gain, time);
    else if (rel < 0.67) this.snare(gain, time);
    else this.hat(gain, time);
  }

  // Kick: a pitched body that drops fast, no noise, so it thumps.
  private kick(gain: number, time: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.11);
    env.gain.setValueAtTime(Math.min(1, gain * 1.1), time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    osc.connect(env).connect(master);
    osc.start(time);
    osc.stop(time + 0.16);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  // Snare: a band of noise with a little tonal body across it.
  private snare(gain: number, time: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1900, time);
    filter.Q.setValueAtTime(1.1, time);
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    src.connect(filter).connect(env).connect(master);
    src.start(time);
    src.stop(time + 0.15);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  // Hat: a very short slice of bright, high-passed noise.
  private hat(gain: number, time: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7000, time);
    env.gain.setValueAtTime(gain * 0.7, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    src.connect(filter).connect(env).connect(master);
    src.start(time);
    src.stop(time + 0.06);
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
