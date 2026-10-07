import type { Tuning } from '../config/tuning';

/**
 * Sounds made in code with Web Audio (no audio files): wind that rises with speed, the city's
 * hum, a crime alarm that grows as you get closer, rope shots, zips, landings, transformations
 * and fight hits. Proper music and sound design come in stage 6. The audio context starts on the
 * first click (browsers require a user gesture).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private humGain: GainNode | null = null;
  private alarmGain: GainNode | null = null;
  private alarmOsc: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  /** 0..1: a quiet beat (perched on a ledge): wind ducks, the city hum comes forward. */
  private quiet = 0;
  private alarm = 0;
  private alarmPhase = 0;

  constructor(private readonly tuning: Tuning) {}

  /** Call from a user gesture (click / key press). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    const length = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // City hum: a low, distant rumble that is always there.
    const hum = ctx.createBufferSource();
    hum.buffer = this.noise;
    hum.loop = true;
    hum.playbackRate.value = 0.5;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 170;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(humFilter).connect(this.humGain).connect(this.master);
    hum.start();

    // Crime alarm: a warbling two-tone, louder the closer the crime.
    this.alarmOsc = ctx.createOscillator();
    this.alarmOsc.type = 'triangle';
    this.alarmOsc.frequency.value = 700;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    this.alarmOsc.connect(this.alarmGain).connect(this.master);
    this.alarmOsc.start();
  }

  /** 0..1: duck the wind and lift the city hum (a breath after landing on a ledge). */
  setQuiet(amount: number): void {
    this.quiet = amount;
  }

  /** 0..1: how loud the crime alarm is (distance to the crime). */
  setAlarm(level: number): void {
    this.alarm = level;
  }

  /** `speed` in m/s, `dt` real seconds. */
  update(speed: number, dt = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.windGain || !this.windFilter) return;
    const a = this.tuning.audio;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(a.enabled ? a.volume : 0, now, 0.05);
    const t = Math.min(Math.max((speed - 12) / 36, 0), 1);
    this.windGain.gain.setTargetAtTime(t * t * 0.55 * (1 - 0.85 * this.quiet), now, 0.12);
    this.windFilter.frequency.setTargetAtTime(280 + speed * 28, now, 0.12);
    this.humGain?.gain.setTargetAtTime(0.05 + 0.14 * this.quiet, now, 0.3);
    if (this.alarmGain && this.alarmOsc) {
      this.alarmPhase += dt;
      const warble = Math.sin(this.alarmPhase * Math.PI * 2 * 1.6) > 0 ? 880 : 660;
      this.alarmOsc.frequency.setTargetAtTime(warble, now, 0.02);
      this.alarmGain.gain.setTargetAtTime(this.alarm * this.alarm * 0.06 * (1 - 0.6 * this.quiet), now, 0.2);
    }
  }

  /** Mode switch: Titan clanks in low and heavy, Kanca rings up bright. */
  transform(heavy: boolean): void {
    if (heavy) {
      this.tone(150, 48, 0.42, 'sine', 0.7);
      this.noiseBurst(0.09, 'bandpass', 2600, 0.35);
      this.tone(320, 90, 0.25, 'square', 0.08);
    } else {
      this.tone(520, 1560, 0.22, 'triangle', 0.22);
      this.sweep(500, 3200, 0.3, 0.3);
    }
  }

  /** A blow landing; `strength` 0..1, heavy = Titan. */
  hit(strength: number, heavy: boolean): void {
    const low = heavy ? 0.6 : 1;
    this.tone(220 * low, 55 * low, 0.1 + strength * 0.12, 'sine', 0.45 + strength * 0.4);
    this.noiseBurst(0.05 + strength * 0.07, 'lowpass', (heavy ? 900 : 1600) + strength * 800, 0.35 + strength * 0.35);
  }

  /** A swing that hits nothing. */
  swish(): void {
    this.sweep(900, 2600, 0.14, 0.12);
  }

  /** The hero takes a hit. */
  hurt(): void {
    this.tone(160, 70, 0.22, 'sawtooth', 0.12);
    this.noiseBurst(0.12, 'bandpass', 700, 0.35);
  }

  /** Enemy wind-up warning ("!!"). */
  alert(): void {
    this.tone(1500, 1500, 0.05, 'square', 0.05);
    window.setTimeout(() => this.tone(1500, 1500, 0.05, 'square', 0.05), 90);
  }

  counter(): void {
    this.tone(2400, 1200, 0.12, 'triangle', 0.25);
    this.sweep(3000, 700, 0.25, 0.25);
  }

  /** Titan shockwave; `size` 0..1. */
  shockwave(size: number): void {
    this.tone(80, 28, 0.6 + size * 0.6, 'sine', 0.6 + size * 0.4);
    this.noiseBurst(0.4 + size * 0.5, 'lowpass', 380, 0.5 + size * 0.4);
  }

  chargeStart(): void {
    this.sweep(200, 900, 0.8, 0.12);
  }

  superJump(charge: number): void {
    this.tone(120, 40, 0.3 + charge * 0.3, 'sine', 0.4 + charge * 0.4);
    this.sweep(400, 2400, 0.4, 0.25 + charge * 0.2);
  }

  /** Tutorial step done. */
  ding(): void {
    this.tone(880, 880, 0.12, 'triangle', 0.18);
    window.setTimeout(() => this.tone(1320, 1320, 0.18, 'triangle', 0.16), 90);
  }

  ko(): void {
    this.tone(330, 110, 0.5, 'triangle', 0.3);
  }

  /** A short rising sting (crime stopped). */
  sting(): void {
    [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => this.tone(f, f, 0.16, 'triangle', 0.2), i * 80));
  }

  ropeShot(): void {
    this.noiseBurst(0.07, 'highpass', 1800, 0.45);
    this.tone(1300, 420, 0.09, 'triangle', 0.18);
  }

  ropeRelease(): void {
    this.noiseBurst(0.12, 'bandpass', 900, 0.2);
  }

  zip(): void {
    this.sweep(400, 2400, 0.32, 0.35);
  }

  /** `weight` 0..1. */
  land(weight: number): void {
    this.tone(95, 38, 0.18 + weight * 0.25, 'sine', 0.35 + weight * 0.55);
    this.noiseBurst(0.1 + weight * 0.2, 'lowpass', 500, 0.25 + weight * 0.4);
  }

  noAnchor(): void {
    this.tone(210, 160, 0.07, 'square', 0.08);
  }

  whoosh(): void {
    this.sweep(1600, 500, 0.35, 0.25);
  }

  private tone(from: number, to: number, duration: number, type: OscillatorType, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noiseBurst(duration: number, type: BiquadFilterType, frequency: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + duration + 0.02);
  }

  private sweep(from: number, to: number, duration: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + duration + 0.02);
  }
}
