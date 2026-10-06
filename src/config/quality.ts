import type { QualityPreset } from './tuning';

export type QualityLevel = Exclude<QualityPreset, 'auto'>;

export interface QualitySettings {
  /** Upper limit for devicePixelRatio. */
  pixelRatio: number;
  smaa: boolean;
  chromaticAberration: boolean;
  /** Share of cars drawn. */
  traffic: number;
  lampPools: boolean;
}

/** BRIEF.md §5.5: heavy effects switch off on lower presets. */
export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatio: 0.85, smaa: false, chromaticAberration: false, traffic: 0.5, lampPools: false },
  medium: { pixelRatio: 1.15, smaa: true, chromaticAberration: true, traffic: 1, lampPools: true },
  high: { pixelRatio: 1.6, smaa: true, chromaticAberration: true, traffic: 1, lampPools: true },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];
const WARMUP = 3;
const WINDOW = 2;
const TARGET_FPS = 52;

/**
 * Auto quality: starts on High and steps down while the average frame rate stays below
 * the target. It never steps back up, so it cannot flip-flop.
 */
export class AutoQuality {
  level: QualityLevel = 'high';
  private elapsed = 0;
  private frames = 0;
  private windowTime = 0;

  /** Feed real frame times; returns true when the level changed. */
  update(frameDt: number): boolean {
    this.elapsed += frameDt;
    if (this.elapsed < WARMUP) return false;
    this.frames++;
    this.windowTime += frameDt;
    if (this.windowTime < WINDOW) return false;
    const fps = this.frames / this.windowTime;
    this.frames = 0;
    this.windowTime = 0;
    const index = ORDER.indexOf(this.level);
    if (fps < TARGET_FPS && index < ORDER.length - 1) {
      this.level = ORDER[index + 1] ?? this.level;
      this.elapsed = WARMUP - 1; // let the new level settle before measuring again
      return true;
    }
    return false;
  }
}
