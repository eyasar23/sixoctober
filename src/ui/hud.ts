import { type Camera, Vector3 } from 'three';
import { t, tKey } from '../i18n';
import type { MoveState } from '../player/playerSim';

const COMIC_TIME = 0.9;
const NO_ANCHOR_TIME = 0.9;

export interface HudFrame {
  state: MoveState;
  sprinting: boolean;
  /** m/s */
  speed: number;
  fps: number;
  qualityLabel: string;
  showFps: boolean;
  slowMo: number | null;
  /** Next rope anchor while in the air (preview), else null. */
  anchorPreview: Vector3 | null;
  /** Zip target under the crosshair, else null; charge 0..1 is the cooldown. */
  zipTarget: Vector3 | null;
  zipCharge: number;
}

/**
 * Stage 1A HUD (the full gameplay HUD comes in 1B): state tag bottom-left, context hint
 * bottom-centre, speed bottom-right, rope/zip markers, comic landing text and the start screen.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly stateTag: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly anchorMark: HTMLElement;
  private readonly zipMark: HTMLElement;
  private readonly noAnchor: HTMLElement;
  private readonly slowMo: HTMLElement;
  private readonly comic: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly start: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly projected = new Vector3();
  private lastState = '';
  private lastHint = '';
  private comicTime = -1;
  private noAnchorTime = -1;
  private tipTime = -1;
  private textTimer = 0;

  constructor(parent: HTMLElement) {
    const el = (className: string, text = '', tag = 'div'): HTMLElement => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    this.root = el('hud');
    this.debug = el('hud-debug');
    this.stateTag = el('hud-state');
    this.hint = el('hud-hint');
    const speed = el('hud-speed');
    this.speedValue = el('hud-speed-value', '0', 'span');
    speed.append(this.speedValue, el('hud-speed-unit', t('hud.speedUnit'), 'span'));
    this.anchorMark = el('hud-anchor');
    this.zipMark = el('hud-zip');
    this.noAnchor = el('hud-noanchor', t('hud.noAnchor'));
    this.slowMo = el('hud-slowmo');
    this.comic = el('hud-comic');
    this.flash = el('hud-flash', t('hud.respawn'));
    this.tip = el('hud-tip', t('hud.startTip'));
    this.start = el('hud-start');
    this.start.append(el('hud-start-title', t('hud.startTitle')), el('hud-start-click', t('hud.startClick')), el('hud-start-controls', t('hud.startControls')), el('hud-start-tip', t('hud.startTip')));
    const keys = el('hud-keys', t('hud.keys'));
    this.root.append(this.debug, keys, this.stateTag, this.hint, speed, this.anchorMark, this.zipMark, this.noAnchor, this.slowMo, this.comic, this.flash, this.tip, this.start);
    parent.append(this.root);
  }

  /** The start screen disappears once the mouse is captured; a short tip follows. */
  setPlaying(playing: boolean): void {
    this.start.hidden = playing;
    if (playing && this.tipTime < 0) this.tipTime = 0;
  }

  showNoAnchor(): void {
    this.noAnchorTime = 0;
  }

  showRespawn(): void {
    this.flash.classList.remove('show');
    void this.flash.offsetWidth;
    this.flash.classList.add('show');
  }

  /** Comic lettering popping out where the hero landed. */
  showComic(text: string, at: Vector3, camera: Camera): void {
    if (!this.place(this.comic, at, camera)) return;
    this.comic.textContent = text;
    this.comicTime = 0;
  }

  update(dt: number, f: HudFrame, camera: Camera): void {
    const stateKey = f.state === 'grounded' && f.sprinting ? 'sprint' : stateLabel(f.state);
    if (stateKey !== this.lastState) {
      this.lastState = stateKey;
      this.stateTag.textContent = tKey(`state.${stateKey}`);
      this.stateTag.classList.remove('pop');
      void this.stateTag.offsetWidth;
      this.stateTag.classList.add('pop');
    }
    const hintKey = `hint.${hintFor(f.state)}`;
    if (hintKey !== this.lastHint) {
      this.lastHint = hintKey;
      this.hint.textContent = tKey(hintKey);
    }

    // Text that changes every frame only refreshes a few times a second (cheaper layout).
    this.textTimer += dt;
    if (this.textTimer > 0.1) {
      this.textTimer = 0;
      this.speedValue.textContent = String(Math.round(f.speed * 3.6));
      const parts = [t('hud.stage'), t('hud.quality', { value: f.qualityLabel })];
      if (f.showFps) parts.splice(1, 0, t('hud.fps', { value: f.fps }));
      this.debug.textContent = parts.join(' · ');
    }
    this.slowMo.hidden = f.slowMo === null;
    if (f.slowMo !== null) this.slowMo.textContent = t('hud.slowMo', { value: f.slowMo });

    this.anchorMark.hidden = !(f.anchorPreview && this.place(this.anchorMark, f.anchorPreview, camera));
    this.zipMark.hidden = !(f.zipTarget && this.place(this.zipMark, f.zipTarget, camera));
    this.zipMark.style.setProperty('--charge', String(f.zipCharge));
    this.zipMark.classList.toggle('ready', f.zipCharge >= 1);

    this.noAnchor.hidden = this.noAnchorTime < 0;
    if (this.noAnchorTime >= 0) {
      this.noAnchorTime += dt;
      this.noAnchor.style.opacity = String(1 - this.noAnchorTime / NO_ANCHOR_TIME);
      if (this.noAnchorTime >= NO_ANCHOR_TIME) this.noAnchorTime = -1;
    }
    this.comic.hidden = this.comicTime < 0;
    if (this.comicTime >= 0) {
      this.comicTime += dt;
      const p = this.comicTime / COMIC_TIME;
      this.comic.style.setProperty('--p', String(p));
      if (p >= 1) this.comicTime = -1;
    }
    this.tip.hidden = this.tipTime < 0 || this.tipTime > 7;
    if (this.tipTime >= 0) this.tipTime += dt;
  }

  /** Moves an element to a world point's screen position; false if it is behind the camera. */
  private place(element: HTMLElement, point: Vector3, camera: Camera): boolean {
    this.projected.copy(point).project(camera);
    if (this.projected.z > 1 || this.projected.z < -1) return false;
    const x = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    element.style.setProperty('--x', `${x.toFixed(1)}px`);
    element.style.setProperty('--y', `${y.toFixed(1)}px`);
    return true;
  }
}

function stateLabel(state: MoveState): string {
  if (state === 'landing') return 'grounded';
  if (state === 'mantle') return 'wallClimb';
  return state;
}

function hintFor(state: MoveState): string {
  if (state === 'landing' || state === 'mantle') return 'grounded';
  return state;
}
