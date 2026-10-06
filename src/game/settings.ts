import type { Tuning } from '../config/tuning';

export type FrameRate = 'film24' | 'film30' | 'smooth';
export type QualityChoice = 'auto' | 'low' | 'medium' | 'high';

/** What the player sets in the Settings menu (a friendly front for a few tuning values). */
export interface Settings {
  quality: QualityChoice;
  frameRate: FrameRate;
  animateOnTwos: boolean;
  /** 0.25..2.5, multiplies the default mouse sensitivity. */
  sensitivity: number;
  invertY: boolean;
  /** Camera slowly turns behind the direction of travel when the mouse rests. */
  autoRecenter: boolean;
  shake: boolean;
  /** 0..1 */
  volume: number;
  hud: boolean;
  /** Mode switch show, perch shot and the finishing-blow frame. */
  cinematics: boolean;
}

const STORAGE_KEY = 'sixoctober.settings.v1';
const TUTORIAL_KEY = 'sixoctober.tutorialDone';

export function defaultSettings(tuning: Tuning): Settings {
  return {
    quality: tuning.quality.preset,
    frameRate: 'smooth',
    animateOnTwos: tuning.hero.animateOnTwos,
    sensitivity: 1,
    invertY: tuning.camera.invertY,
    autoRecenter: tuning.camera.autoAlign,
    shake: tuning.camera.shake,
    volume: tuning.audio.volume,
    hud: tuning.ui.hud,
    cinematics: true,
  };
}

/** Saved settings over the defaults; anything missing or broken falls back to the default. */
export function loadSettings(tuning: Tuning): Settings {
  const settings = defaultSettings(tuning);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return settings;
    const saved = JSON.parse(raw) as Partial<Settings>;
    for (const key of Object.keys(settings) as Array<keyof Settings>) {
      if (typeof saved[key] === typeof settings[key]) (settings as unknown as Record<string, unknown>)[key] = saved[key];
    }
  } catch {
    // Storage blocked or corrupt: defaults.
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private window or blocked storage: settings last for this visit only.
  }
}

/** Writes the settings into the live tuning (the F1 panel shows the same values). */
export function applySettings(settings: Settings, tuning: Tuning, baseSensitivity: number): void {
  tuning.quality.preset = settings.quality;
  tuning.hero.animateOnTwos = settings.animateOnTwos;
  tuning.camera.mouseSensitivity = baseSensitivity * settings.sensitivity;
  tuning.camera.invertY = settings.invertY;
  tuning.camera.autoAlign = settings.autoRecenter;
  tuning.camera.shake = settings.shake;
  tuning.audio.volume = settings.volume;
  tuning.audio.enabled = settings.volume > 0;
  tuning.ui.hud = settings.hud;
  tuning.fx.modeSwitchShow = settings.cinematics;
  tuning.camera.perchCinematic = settings.cinematics;
  tuning.crime.finalBlowCinematic = settings.cinematics;
}

/** Frames per second for a frame-rate choice (0 = as fast as the screen allows). */
export function frameRateCap(rate: FrameRate): number {
  return rate === 'film24' ? 24 : rate === 'film30' ? 30 : 0;
}

export function tutorialDone(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // Not remembered: the tutorial is offered again next visit.
  }
}
