import type { CombatTuning } from '../config/tuning';

export type StrikeKind = 'punch' | 'kick';

export type ComboEvent =
  /** A strike begins (wind-up): `step` is 1–3 in the chain. */
  | { type: 'start'; kind: StrikeKind; step: number; duration: number }
  /** The strike connects now (hit detection). */
  | { type: 'hit'; kind: StrikeKind; step: number }
  /** The chain is over (window missed or finisher done). */
  | { type: 'reset' };

/**
 * The hero's strike chain: left click punch, right click kick, three in a row make a combo
 * (the third is the finisher). Presses are buffered: one pressed during a strike starts the next
 * strike at `chainAt` of the current one; one pressed within `comboWindow` after a strike ends
 * continues the chain; later presses start over at step 1. Pure timing, no rendering, so it runs
 * in tests.
 */
export class ComboTracker {
  /** Current strike in the chain (0 = none). */
  step = 0;
  kind: StrikeKind = 'punch';
  /** Seconds into the current strike (or since it ended). */
  time = 0;
  duration = 0;
  private striking = false;
  private hitDone = false;
  private buffered: StrikeKind | null = null;
  /** Strikes run this much slower (Titan). */
  timeScale = 1;

  constructor(private readonly tuning: CombatTuning) {}

  get busy(): boolean {
    return this.striking;
  }

  /** A click. */
  press(kind: StrikeKind): void {
    this.buffered = kind;
  }

  /** Drops the chain (the hero got hit, knocked out, or left the ground). */
  cancel(): void {
    this.striking = false;
    this.buffered = null;
    this.step = 0;
    this.time = 0;
  }

  update(dt: number, out: ComboEvent[]): void {
    const c = this.tuning;
    this.time += dt;
    if (this.striking) {
      if (!this.hitDone && this.time >= this.duration * c.hitAt) {
        this.hitDone = true;
        out.push({ type: 'hit', kind: this.kind, step: this.step });
      }
      const chainReady = this.time >= this.duration * c.chainAt && this.step < 3;
      if (this.buffered && chainReady) {
        this.begin(this.buffered, this.step + 1, out);
        return;
      }
      if (this.time >= this.duration) {
        this.striking = false;
        this.time = 0;
        if (this.step >= 3) {
          this.step = 0;
          out.push({ type: 'reset' });
        }
      }
      return;
    }
    if (this.buffered) {
      const next = this.step > 0 && this.time <= c.comboWindow ? this.step + 1 : 1;
      this.begin(this.buffered, next, out);
      return;
    }
    if (this.step > 0 && this.time > c.comboWindow) {
      this.step = 0;
      out.push({ type: 'reset' });
    }
  }

  private begin(kind: StrikeKind, step: number, out: ComboEvent[]): void {
    const c = this.tuning;
    this.buffered = null;
    this.kind = kind;
    this.step = step;
    this.time = 0;
    this.hitDone = false;
    this.striking = true;
    const base = kind === 'punch' ? c.punchTime : c.kickTime;
    this.duration = (base + (step === 3 ? c.finisherExtra : 0)) * this.timeScale;
    out.push({ type: 'start', kind, step, duration: this.duration });
  }
}
