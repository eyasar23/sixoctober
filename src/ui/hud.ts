import { type Camera, Vector3 } from 'three';
import type { Enemy } from '../combat/enemy';
import { t, tKey } from '../i18n';
import type { MoveState } from '../player/playerSim';
import type { CityData } from '../world/cityGen';
import { Minimap, type MinimapFrame } from './minimap';

const NO_ANCHOR_TIME = 0.9;
const MARKERS = 6;
const KO_LABEL_TIME = 3;

export interface HudCrime {
  distance: number;
  /** Direction to the crime relative to the camera, radians (0 = straight ahead, + = right). */
  bearing: number;
  engaged: boolean;
  left: number;
}

export interface HudFrame {
  state: MoveState;
  sprinting: boolean;
  /** m/s */
  speed: number;
  fps: number;
  qualityLabel: string;
  showFps: boolean;
  slowMo: number | null;
  /** 0..1 */
  health: number;
  modeName: string;
  modeColor: string;
  stopped: number;
  crime: HudCrime | null;
  map: MinimapFrame;
  /** What the crosshair would grab with E. */
  crosshair: 'none' | 'ledge' | 'enemy';
  combo: number;
  enemies: readonly Enemy[];
  /** Next rope anchor while in the air (preview), else null. */
  anchorPreview: Vector3 | null;
  /** Zip target under the crosshair, else null; charge 0..1 is the cooldown. */
  zipTarget: Vector3 | null;
  zipCharge: number;
  /** Titan charge 0..1 while charging, else 0. */
  charge: number;
  /** Enemies close and awake: hints switch to fight controls. */
  fighting: boolean;
}

interface Marker {
  root: HTMLElement;
  warn: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  ko: HTMLElement;
}

/**
 * Gameplay HUD (stage 1B), comic but legible: state tag, health and the wristband mode ring
 * bottom-left, speed bottom-right, crimes stopped and the way to the crime top-left, a round
 * minimap top-right, a small crosshair that lights up over a ledge or an enemy, combo counter,
 * "!!" and health over enemies, and a short context hint. `setVisible(false)` hides it all.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly stateTag: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly healthLag: HTMLElement;
  private readonly mode: HTMLElement;
  private readonly modeName: HTMLElement;
  private readonly crimes: HTMLElement;
  private readonly crimesCount: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveArrow: HTMLElement;
  private readonly objectiveText: HTMLElement;
  private readonly minimap: Minimap;
  private readonly crosshair: HTMLElement;
  private readonly chargeRing: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly comboCount: HTMLElement;
  private readonly anchorMark: HTMLElement;
  private readonly zipMark: HTMLElement;
  private readonly noAnchor: HTMLElement;
  private readonly slowMo: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly hurt: HTMLElement;
  private readonly markers: Marker[] = [];
  private readonly koTimes = new Map<Enemy, number>();
  private readonly projected = new Vector3();
  private readonly head = new Vector3();
  private lastState = '';
  private lastHint = '';
  private lastMode = '';
  private lastStopped = -1;
  private lastCombo = 0;
  private noAnchorTime = -1;
  private textTimer = 0;
  private mapTimer = 0;
  private healthShown = 1;

  constructor(parent: HTMLElement, city: CityData) {
    const el = (className: string, text = '', tag = 'div'): HTMLElement => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    this.root = el('hud');
    this.debug = el('hud-debug');

    // Bottom left: mode ring, health, state.
    const status = el('hud-status');
    this.mode = el('hud-mode');
    this.modeName = el('hud-mode-name');
    this.mode.append(el('hud-mode-ring'), this.modeName);
    const health = el('hud-health');
    this.healthLag = el('hud-health-lag');
    this.healthFill = el('hud-health-fill');
    health.append(this.healthLag, this.healthFill, el('hud-health-label', t('hud.health')));
    this.stateTag = el('hud-state');
    status.append(this.mode, health, this.stateTag);

    this.hint = el('hud-hint');
    const speed = el('hud-speed');
    this.speedValue = el('hud-speed-value', '0', 'span');
    speed.append(this.speedValue, el('hud-speed-unit', t('hud.speedUnit'), 'span'));

    // Top left: crimes stopped and the way to the current crime.
    const crimePanel = el('hud-crime');
    this.crimes = el('hud-crimes');
    this.crimesCount = el('hud-crimes-count', '0', 'span');
    this.crimes.append(el('hud-crimes-label', t('hud.crimesStopped'), 'span'), this.crimesCount);
    this.objective = el('hud-objective');
    this.objectiveArrow = el('hud-objective-arrow');
    this.objectiveText = el('hud-objective-text');
    this.objective.append(this.objectiveArrow, this.objectiveText);
    crimePanel.append(this.crimes, this.objective);

    // Top right: minimap.
    const map = el('hud-map');
    this.minimap = new Minimap(city);
    map.append(this.minimap.canvas, el('hud-map-north'));

    this.crosshair = el('hud-crosshair');
    this.chargeRing = el('hud-charge');
    this.combo = el('hud-combo');
    this.comboCount = el('hud-combo-count', '', 'span');
    this.combo.append(this.comboCount, el('hud-combo-label', t('hud.combo'), 'span'));
    this.combo.hidden = true;
    this.anchorMark = el('hud-anchor');
    this.zipMark = el('hud-zip');
    this.noAnchor = el('hud-noanchor', t('hud.noAnchor'));
    this.slowMo = el('hud-slowmo');
    this.flash = el('hud-flash', t('hud.respawn'));
    this.hurt = el('hud-hurt');
    const markerLayer = el('hud-markers');
    for (let i = 0; i < MARKERS; i++) {
      const root = el('hud-enemy');
      const warn = el('hud-enemy-warn', '!!');
      const bar = el('hud-enemy-bar');
      const fill = el('hud-enemy-fill');
      bar.append(fill);
      const ko = el('hud-enemy-ko', t('hud.ko'));
      root.append(warn, bar, ko);
      root.hidden = true;
      markerLayer.append(root);
      this.markers.push({ root, warn, bar, fill, ko });
    }

    this.root.append(
      markerLayer,
      this.anchorMark,
      this.zipMark,
      this.crosshair,
      this.chargeRing,
      this.debug,
      crimePanel,
      map,
      status,
      this.hint,
      speed,
      this.combo,
      this.noAnchor,
      this.slowMo,
      this.flash,
      this.hurt,
    );
    parent.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  showNoAnchor(ledge = false): void {
    this.noAnchor.textContent = t(ledge ? 'hud.noLedge' : 'hud.noAnchor');
    this.noAnchorTime = 0;
  }

  showRespawn(): void {
    this.flash.classList.remove('show');
    void this.flash.offsetWidth;
    this.flash.classList.add('show');
  }

  /** Red edge flash when the hero takes a hit. */
  showHurt(): void {
    this.hurt.classList.remove('show');
    void this.hurt.offsetWidth;
    this.hurt.classList.add('show');
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
    const hintKey = `hint.${hintFor(f.state, f.modeName, f.fighting)}`;
    if (hintKey !== this.lastHint) {
      this.lastHint = hintKey;
      this.hint.textContent = tKey(hintKey);
      this.hint.hidden = this.hint.textContent === '';
    }
    if (f.modeName !== this.lastMode) {
      this.lastMode = f.modeName;
      this.modeName.textContent = f.modeName;
      this.root.style.setProperty('--mode', f.modeColor);
      this.mode.classList.remove('pop');
      void this.mode.offsetWidth;
      this.mode.classList.add('pop');
    }

    // Health: the bar drops at once, a pale "lag" bar follows (shows how much a hit took).
    const health = Math.min(Math.max(f.health, 0), 1);
    this.healthShown = health < this.healthShown ? this.healthShown + (health - this.healthShown) * (1 - Math.exp(-3 * dt)) : health;
    this.healthFill.style.setProperty('--v', health.toFixed(3));
    this.healthLag.style.setProperty('--v', this.healthShown.toFixed(3));
    this.healthFill.classList.toggle('low', health < 0.3);

    if (f.stopped !== this.lastStopped) {
      this.lastStopped = f.stopped;
      this.crimesCount.textContent = String(f.stopped);
      this.crimes.classList.remove('pop');
      void this.crimes.offsetWidth;
      this.crimes.classList.add('pop');
    }

    // Text that changes every frame only refreshes a few times a second (cheaper layout).
    this.textTimer += dt;
    if (this.textTimer > 0.1) {
      this.textTimer = 0;
      this.speedValue.textContent = String(Math.round(f.speed * 3.6));
      this.debug.hidden = !f.showFps;
      if (f.showFps) this.debug.textContent = `${t('hud.fps', { value: f.fps })} · ${t('hud.quality', { value: f.qualityLabel })}`;
      if (f.crime) {
        this.objectiveText.textContent = f.crime.engaged ? t('hud.objectiveFight', { left: f.crime.left }) : t('hud.objectiveGo', { distance: Math.round(f.crime.distance) });
      }
    }
    this.objective.hidden = !f.crime;
    if (f.crime) {
      this.objectiveArrow.style.setProperty('--a', `${f.crime.bearing.toFixed(3)}rad`);
      this.objective.classList.toggle('engaged', f.crime.engaged);
    }

    this.mapTimer += dt;
    if (this.mapTimer > 1 / 30) {
      this.minimap.draw(f.map, this.mapTimer);
      this.mapTimer = 0;
    }

    this.crosshair.dataset.target = f.crosshair;
    this.chargeRing.hidden = f.charge <= 0;
    if (f.charge > 0) this.chargeRing.style.setProperty('--charge', f.charge.toFixed(3));

    if (f.combo !== this.lastCombo) {
      this.lastCombo = f.combo;
      this.combo.hidden = f.combo < 2;
      this.comboCount.textContent = `×${f.combo}`;
      this.combo.classList.remove('pop');
      void this.combo.offsetWidth;
      this.combo.classList.add('pop');
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
    this.updateMarkers(dt, f.enemies, camera);
  }

  /** "!!" over winding-up enemies, a small health bar once hurt, "K.O." for a while after. */
  private updateMarkers(dt: number, enemies: readonly Enemy[], camera: Camera): void {
    let used = 0;
    for (const enemy of enemies) {
      if (used >= this.markers.length) break;
      let koTime = this.koTimes.get(enemy) ?? 0;
      if (enemy.health <= 0) {
        koTime += dt;
        this.koTimes.set(enemy, koTime);
      }
      const warn = enemy.counterable && enemy.health > 0;
      const hurt = enemy.health > 0 && enemy.health < enemy.maxHealth;
      const ko = enemy.health <= 0 && koTime < KO_LABEL_TIME;
      if (!warn && !hurt && !ko) continue;
      const scale = enemy.role === 'brute' ? 1.18 : 1;
      this.head.set(enemy.position.x, enemy.position.y + (enemy.state === 'down' || enemy.state === 'ko' ? 0.6 : 2.15 * scale), enemy.position.z);
      const marker = this.markers[used]!;
      if (!this.place(marker.root, this.head, camera)) continue;
      used++;
      marker.root.hidden = false;
      marker.warn.hidden = !warn;
      marker.bar.hidden = !hurt || warn;
      marker.ko.hidden = !ko;
      if (hurt) marker.fill.style.setProperty('--v', (enemy.health / enemy.maxHealth).toFixed(3));
    }
    for (let i = used; i < this.markers.length; i++) this.markers[i]!.root.hidden = true;
    for (const enemy of this.koTimes.keys()) if (!enemies.includes(enemy)) this.koTimes.delete(enemy);
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

function hintFor(state: MoveState, mode: string, fighting: boolean): string {
  const base = state === 'landing' || state === 'mantle' ? 'grounded' : state;
  if (fighting && (base === 'grounded' || base === 'action')) return 'fight';
  // Titan has its own hints where its moves differ.
  if (mode === tKey('mode.titan') && (base === 'grounded' || base === 'airborne')) return `${base}Titan`;
  return base;
}
