import type { Color } from '../core/color';
import { readString, writeString } from './local-store';

/**
 * All sound is synthesised with Web Audio; there are no audio files.
 *
 * - Ambient: a slow pad wandering between chords of A minor pentatonic, with
 *   an occasional soft bell, through a generated reverb. Very quiet.
 * - Chimes: one note per beam colour, played when a target is satisfied.
 * - Small ticks and taps for turning and placing pieces.
 *
 * The AudioContext is created on the first user gesture (browser autoplay
 * rules) and suspended while the tab is hidden.
 */

const KEY = 'puzzle-light:sound';

/** A minor pentatonic, as semitones above A. */
const SCALE = [0, 3, 5, 7, 10];
const A3 = 220;
const freq = (step: number): number => A3 * 2 ** ((SCALE[((step % 5) + 5) % 5]! + 12 * Math.floor(step / 5)) / 12);

/** Chime pitch for each colour mask: primaries low, mixes higher, white on top. */
const CHIME: Record<number, number> = {
  1: 440, // red    A4
  2: 523.25, // green  C5
  3: 587.33, // yellow D5
  4: 659.25, // blue   E5
  5: 783.99, // magenta G5
  6: 880, // cyan   A5
  7: 1046.5, // white  C6
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private on: boolean;
  private ambientTimer = 0;
  private chord = 0;

  constructor() {
    this.on = readString(KEY) !== 'off'; // on unless turned off (or storage unavailable)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on) void this.ctx.resume();
    });
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Call from a user gesture: creates the audio graph the first time. */
  unlock(): void {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.build(this.ctx);
      this.scheduleAmbient();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): boolean {
    this.on = !this.on;
    writeString(KEY, this.on ? 'on' : 'off');
    if (this.on) this.unlock();
    else if (this.ctx) void this.ctx.suspend();
    return this.on;
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 3.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
  }

  private ready(): AudioContext | null {
    return this.on && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  // ── ambient ──────────────────────────────────────────────────────────────

  private scheduleAmbient(): void {
    const tick = () => {
      const ctx = this.ready();
      if (ctx) {
        // Wander to a neighbouring chord and voice it as root, third and fifth of the scale.
        this.chord = (this.chord + [1, 2, 3, -1, -2][Math.floor(Math.random() * 5)]! + 5) % 5;
        const t = ctx.currentTime + 0.05;
        for (const [i, step] of [this.chord, this.chord + 2, this.chord + 4].entries()) this.pad(ctx, freq(step), t, 9, 0.022 - i * 0.004);
        if (Math.random() < 0.7) this.bell(ctx, freq(this.chord + 10 + Math.floor(Math.random() * 4)), t + 2 + Math.random() * 4, 0.018);
      }
      this.ambientTimer = window.setTimeout(tick, 7000 + Math.random() * 3000);
    };
    window.clearTimeout(this.ambientTimer);
    tick();
  }

  /** A soft, slowly breathing voice: two detuned oscillators through a lowpass. */
  private pad(ctx: AudioContext, f: number, t: number, dur: number, level: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.3;
    g.connect(lp).connect(this.music);
    for (const [type, detune] of [
      ['sine', -5],
      ['triangle', 6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private bell(ctx: AudioContext, f: number, t: number, level: number, out: AudioNode = this.music): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    g.connect(out);
    // Fundamental plus an inharmonic partial gives a glassy bell.
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.28],
      [5.4, 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    }
  }

  // ── effects ──────────────────────────────────────────────────────────────

  private blip(f0: number, f1: number, dur: number, level: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  rotate(dir: number): void {
    this.blip(dir > 0 ? 1900 : 1600, 1200, 0.045, 0.035);
  }

  place(): void {
    this.blip(260, 160, 0.12, 0.09, 'triangle');
  }

  lift(): void {
    this.blip(320, 480, 0.08, 0.05, 'triangle');
  }

  undo(): void {
    this.blip(700, 500, 0.06, 0.03);
  }

  /** A target received exactly its colour. */
  chime(color: Color, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.bell(ctx, CHIME[color] ?? 440, ctx.currentTime + delay, 0.08, this.sfx);
  }

  /** The level is solved: each target's note in turn, then the root an octave up. */
  solved(colors: Color[]): void {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = [...new Set(colors)].sort((a, b) => (CHIME[a] ?? 0) - (CHIME[b] ?? 0));
    notes.forEach((c, i) => this.chime(c, 0.25 + i * 0.14));
    this.bell(ctx, 880, ctx.currentTime + 0.25 + notes.length * 0.14 + 0.1, 0.06, this.sfx);
  }

  /** A whole world is complete: the solve's notes, then a slow rising arpeggio. */
  world(): void {
    const ctx = this.ready();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(ctx, f, ctx.currentTime + 1.1 + i * 0.18, 0.05, this.sfx));
  }

  hint(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.bell(ctx, 659.25, ctx.currentTime, 0.035, this.sfx);
    this.bell(ctx, 880, ctx.currentTime + 0.12, 0.03, this.sfx);
  }
}

/** A generated room: stereo noise with an exponential tail. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  return buf;
}
