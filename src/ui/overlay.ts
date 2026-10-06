import { tuning } from '../config/tuning';
import { t } from '../i18n';

/** How often the text refreshes, s. */
const REFRESH_INTERVAL = 0.25;

/** Small debug text (stage label, speed, FPS) plus a control hint while the mouse is free. */
export class Overlay {
  private readonly speedLine: HTMLElement;
  private readonly fpsLine: HTMLElement;
  private readonly hint: HTMLElement;
  private frames = 0;
  private windowStart = performance.now();

  constructor(parent: HTMLElement) {
    const panel = document.createElement('div');
    panel.className = 'overlay';
    const label = document.createElement('div');
    label.textContent = t('hud.stageLabel');
    this.speedLine = document.createElement('div');
    this.fpsLine = document.createElement('div');
    panel.append(label, this.speedLine, this.fpsLine);

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = t('hud.hint');
    parent.append(panel, this.hint);
  }

  /** `speed` in m/s; shown in km/h. */
  update(speed: number, pointerLocked: boolean): void {
    this.hint.hidden = pointerLocked;
    this.frames++;
    const now = performance.now();
    const seconds = (now - this.windowStart) / 1000;
    if (seconds < REFRESH_INTERVAL) return;

    this.speedLine.textContent = t('hud.speed', { value: Math.round(speed * 3.6) });
    this.fpsLine.hidden = !tuning.debug.showFps;
    this.fpsLine.textContent = t('hud.fps', { value: Math.round(this.frames / seconds) });
    this.frames = 0;
    this.windowStart = now;
  }
}
