import type { Tuning } from '../config/tuning';

/**
 * Sounds made in code with Web Audio (no audio files): wind that rises with speed, rope shots,
 * zips, landings and near misses. Proper music and sound design come in stage 6. The audio
 * context starts on the first click (browsers require a user gesture).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;

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
  }

  /** `speed` in m/s. */
  update(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.windGain || !this.windFilter) return;
    const a = this.tuning.audio;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(a.enabled ? a.volume : 0, now, 0.05);
    const t = Math.min(Math.max((speed - 12) / 36, 0), 1);
    this.windGain.gain.setTargetAtTime(t * t * 0.55, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(280 + speed * 28, now, 0.12);
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
