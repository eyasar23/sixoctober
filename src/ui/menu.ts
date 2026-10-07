import { type FrameRate, type QualityChoice, type Settings } from '../game/settings';
import type { CameraPreset } from '../config/tuning';
import { t, tKey } from '../i18n';
import './menu.css';

export type MenuScreen = 'title' | 'pause' | 'settings' | 'controls';

export interface MenuActions {
  play(): void;
  tutorial(): void;
  resume(): void;
  skipTutorial(): void;
  toTitle(): void;
  settingsChanged(settings: Settings): void;
}

/** The controls, grouped, as [key label, action] pairs (i18n keys). */
const CONTROLS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'controls.move',
    rows: [
      ['controls.key.wasd', 'controls.do.move'],
      ['controls.key.mouse', 'controls.do.look'],
      ['controls.key.shift', 'controls.do.shift'],
      ['controls.key.space', 'controls.do.space'],
      ['controls.key.e', 'controls.do.e'],
      ['controls.key.c', 'controls.do.c'],
      ['controls.key.wheel', 'controls.do.wheel'],
    ],
  },
  {
    title: 'controls.modes',
    rows: [
      ['controls.key.tab', 'controls.do.tab'],
      ['controls.key.titanSpace', 'controls.do.titanSpace'],
      ['controls.key.titanC', 'controls.do.titanC'],
    ],
  },
  {
    title: 'controls.fight',
    rows: [
      ['controls.key.lmb', 'controls.do.lmb'],
      ['controls.key.rmb', 'controls.do.rmb'],
      ['controls.key.combo', 'controls.do.combo'],
      ['controls.key.q', 'controls.do.q'],
      ['controls.key.ePull', 'controls.do.ePull'],
    ],
  },
  {
    title: 'controls.other',
    rows: [
      ['controls.key.r', 'controls.do.r'],
      ['controls.key.h', 'controls.do.h'],
      ['controls.key.t', 'controls.do.t'],
      ['controls.key.f1', 'controls.do.f1'],
      ['controls.key.esc', 'controls.do.esc'],
    ],
  },
];

/** Builds the controls card (used in the menu and for H in game). */
export function buildControlsCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'controls-card';
  for (const group of CONTROLS) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = tKey(group.title);
    section.append(title);
    for (const [key, action] of group.rows) {
      const row = document.createElement('div');
      row.className = 'controls-row';
      const k = document.createElement('kbd');
      k.textContent = tKey(key);
      const a = document.createElement('span');
      a.textContent = tKey(action);
      row.append(k, a);
      section.append(row);
    }
    card.append(section);
  }
  return card;
}

/**
 * Title screen, pause menu, settings and controls: comic art direction drawn with CSS and SVG
 * (no outside images), over the live city. Keyboard (arrows, Enter, Esc) and mouse.
 */
export class Menu {
  readonly root: HTMLElement;
  private readonly panels: Record<MenuScreen, HTMLElement>;
  private screen: MenuScreen | null = null;
  private back: MenuScreen = 'title';
  private readonly skipButton: HTMLButtonElement;
  private readonly settingsBody: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    private readonly actions: MenuActions,
  ) {
    this.root = el('div', 'menu');
    this.root.hidden = true;
    this.root.append(el('div', 'menu-backdrop'), el('div', 'menu-speedlines'));

    // Title screen.
    const title = el('div', 'menu-panel menu-title-screen');
    const art = el('div', 'menu-title-art');
    art.innerHTML = starburstSvg();
    const project = el('div', 'menu-title-project', t('menu.project'));
    const name = el('div', 'menu-title-name', t('menu.title'));
    name.dataset.text = t('menu.title');
    const tagline = el('div', 'menu-caption', t('menu.tagline'));
    art.append(project, name, tagline);
    const titleButtons = el('div', 'menu-buttons');
    titleButtons.append(
      this.button('menu.play', () => this.actions.play(), true),
      this.button('menu.tutorial', () => this.actions.tutorial()),
      this.button('menu.controls', () => this.open('controls', 'title')),
      this.button('menu.settings', () => this.open('settings', 'title')),
    );
    title.append(art, titleButtons, el('div', 'menu-footer', t('menu.footer')));

    // Pause.
    const pause = el('div', 'menu-panel menu-pause');
    const pauseButtons = el('div', 'menu-buttons');
    this.skipButton = this.button('menu.skipTutorial', () => this.actions.skipTutorial());
    pauseButtons.append(
      this.button('menu.resume', () => this.actions.resume(), true),
      this.skipButton,
      this.button('menu.tutorial', () => this.actions.tutorial()),
      this.button('menu.controls', () => this.open('controls', 'pause')),
      this.button('menu.settings', () => this.open('settings', 'pause')),
      this.button('menu.toTitle', () => this.actions.toTitle()),
    );
    pause.append(el('div', 'menu-heading', t('menu.paused')), pauseButtons);

    // Settings.
    const settingsPanel = el('div', 'menu-panel menu-settings');
    this.settingsBody = el('div', 'settings-body');
    settingsPanel.append(el('div', 'menu-heading', t('menu.settings')), this.settingsBody, this.button('menu.back', () => this.open(this.back)));

    // Controls.
    const controlsPanel = el('div', 'menu-panel menu-controls');
    controlsPanel.append(el('div', 'menu-heading', t('menu.controls')), buildControlsCard(), this.button('menu.back', () => this.open(this.back)));

    this.panels = { title, pause, settings: settingsPanel, controls: controlsPanel };
    for (const panel of Object.values(this.panels)) {
      panel.hidden = true;
      this.root.append(panel);
    }
    this.buildSettings();
    parent.append(this.root);

    window.addEventListener('keydown', (event) => this.onKey(event));
  }

  get isOpen(): boolean {
    return this.screen !== null;
  }

  get current(): MenuScreen | null {
    return this.screen;
  }

  setTutorialActive(active: boolean): void {
    this.skipButton.hidden = !active;
  }

  open(screen: MenuScreen, back?: MenuScreen): void {
    if (back) this.back = back;
    this.screen = screen;
    this.root.hidden = false;
    this.root.dataset.screen = screen;
    for (const [key, panel] of Object.entries(this.panels)) panel.hidden = key !== screen;
    if (screen === 'settings') this.syncSettings();
    const first = this.panels[screen].querySelector<HTMLElement>('button:not([hidden]), input');
    first?.focus({ preventScroll: true });
  }

  close(): void {
    this.screen = null;
    this.root.hidden = true;
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    const focusables = [...this.panels[this.screen!].querySelectorAll<HTMLElement>('button:not([hidden]), input')];
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      const step = event.code === 'ArrowDown' ? 1 : -1;
      const next = focusables[(index + step + focusables.length) % focusables.length];
      next?.focus({ preventScroll: true });
    } else if (event.code === 'Escape' && (this.screen === 'settings' || this.screen === 'controls')) {
      this.open(this.back);
    }
  }

  private button(key: string, onClick: () => void, primary = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'menu-button primary' : 'menu-button';
    button.textContent = tKey(key);
    button.addEventListener('click', onClick);
    return button;
  }

  private buildSettings(): void {
    const s = this.settings;
    const body = this.settingsBody;
    const changed = () => this.actions.settingsChanged(s);
    body.append(
      this.choice('settings.quality', ['auto', 'low', 'medium', 'high'], () => s.quality, (v) => {
        s.quality = v as QualityChoice;
        changed();
      }),
      this.choice('settings.frameRate', ['film24', 'film30', 'smooth'], () => s.frameRate, (v) => {
        s.frameRate = v as FrameRate;
        changed();
      }),
      this.toggle('settings.animateOnTwos', () => s.animateOnTwos, (v) => {
        s.animateOnTwos = v;
        changed();
      }),
      this.slider('settings.sensitivity', 0.25, 2.5, 0.05, () => s.sensitivity, (v) => {
        s.sensitivity = v;
        changed();
      }),
      this.toggle('settings.invertY', () => s.invertY, (v) => {
        s.invertY = v;
        changed();
      }),
      this.choice('settings.cameraPreset', ['reference', 'manual'], () => s.cameraPreset, (v) => {
        s.cameraPreset = v as CameraPreset;
        changed();
      }),
      this.toggle('settings.shake', () => s.shake, (v) => {
        s.shake = v;
        changed();
      }),
      this.slider('settings.volume', 0, 1, 0.05, () => s.volume, (v) => {
        s.volume = v;
        changed();
      }),
      this.toggle('settings.hud', () => s.hud, (v) => {
        s.hud = v;
        changed();
      }),
      this.toggle('settings.cinematics', () => s.cinematics, (v) => {
        s.cinematics = v;
        changed();
      }),
    );
  }

  private readonly syncers: Array<() => void> = [];

  private syncSettings(): void {
    for (const sync of this.syncers) sync();
  }

  private row(labelKey: string, control: HTMLElement): HTMLElement {
    const row = el('div', 'settings-row');
    row.append(el('span', 'settings-label', tKey(labelKey)), control);
    return row;
  }

  private choice(labelKey: string, options: string[], get: () => string, set: (v: string) => void): HTMLElement {
    const group = el('div', 'settings-choice');
    const buttons = options.map((option) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tKey(`${labelKey}.${option}`);
      b.addEventListener('click', () => {
        set(option);
        sync();
      });
      group.append(b);
      return b;
    });
    const sync = () => buttons.forEach((b, i) => b.classList.toggle('on', options[i] === get()));
    this.syncers.push(sync);
    sync();
    return this.row(labelKey, group);
  }

  private toggle(labelKey: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'settings-toggle';
    const sync = () => {
      b.classList.toggle('on', get());
      b.textContent = t(get() ? 'settings.on' : 'settings.off');
    };
    b.addEventListener('click', () => {
      set(!get());
      sync();
    });
    this.syncers.push(sync);
    sync();
    return this.row(labelKey, b);
  }

  private slider(labelKey: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.className = 'settings-slider';
    input.addEventListener('input', () => set(Number(input.value)));
    this.syncers.push(() => {
      input.value = String(get());
    });
    input.value = String(get());
    return this.row(labelKey, input);
  }
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A comic starburst behind the title, drawn as SVG. */
function starburstSvg(): string {
  const points: string[] = [];
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 50 : 34 + ((i * 37) % 7);
    points.push(`${(60 + Math.cos(angle) * r * 1.6).toFixed(1)},${(50 + Math.sin(angle) * r).toFixed(1)}`);
  }
  return `<svg class="menu-burst" viewBox="-30 -10 180 120" aria-hidden="true"><polygon points="${points.join(' ')}" /></svg>`;
}
