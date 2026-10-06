import { type Camera, Vector3 } from 'three';
import './comic.css';

/** Sound-effect lettering colours: cream, amber, pink, cyan, hot red. */
const WORD_COLORS = ['#F4E2B8', '#FFC23D', '#FF7FCB', '#5FE3FF', '#FF5A3C'];
const SHADOW_COLORS = ['#FF4FA3', '#2FD0FF', '#FFB020', '#FF5A3C'];
const WORD_POOL = 10;

export interface WordStyle {
  /** 0 light tap … 1 knockout blow: size, tilt and shake grow with it. */
  strength: number;
  /** Lettering colour; random from the comic palette when omitted. */
  color?: string;
}

/**
 * Screen-space comic layer: sound-effect words that never look the same twice, the
 * transformation panel, banners (CRIME STOPPED) and the letterbox frame for slow-motion
 * finishing blows. Plain DOM and CSS, drawn over the game.
 */
export class ComicFx {
  readonly root: HTMLElement;
  private readonly words: HTMLElement[] = [];
  private readonly transformPanel: HTMLElement;
  private readonly transformName: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly letterbox: HTMLElement;
  private readonly letterboxCaption: HTMLElement;
  private readonly flashLayer: HTMLElement;
  private readonly projected = new Vector3();
  private nextWord = 0;
  private wordSeed = 0;
  private bannerTime = -1;
  private bannerDuration = 0;

  constructor(parent: HTMLElement) {
    const el = (className: string, tag = 'div'): HTMLElement => {
      const node = document.createElement(tag);
      node.className = className;
      return node;
    };
    this.root = el('comic');
    for (let i = 0; i < WORD_POOL; i++) {
      const word = el('comic-word');
      word.hidden = true;
      word.addEventListener('animationend', () => {
        word.hidden = true;
      });
      this.words.push(word);
      this.root.append(word);
    }
    this.flashLayer = el('comic-flash');
    this.transformPanel = el('comic-transform');
    this.transformPanel.hidden = true;
    this.transformName = el('comic-transform-name');
    this.transformPanel.append(el('comic-transform-dots'), this.transformName);
    this.transformPanel.addEventListener('animationend', (event) => {
      if (event.target === this.transformPanel) this.transformPanel.hidden = true;
    });
    this.banner = el('comic-banner');
    this.banner.hidden = true;
    this.bannerTitle = el('comic-banner-title');
    this.bannerSub = el('comic-banner-sub');
    this.banner.append(this.bannerTitle, this.bannerSub);
    this.letterbox = el('comic-letterbox');
    this.letterboxCaption = el('comic-letterbox-caption');
    this.letterbox.append(el('comic-letterbox-dots'), this.letterboxCaption);
    this.root.append(this.flashLayer, this.transformPanel, this.banner, this.letterbox);
    parent.append(this.root);
  }

  /**
   * A sound-effect word at a screen point (px). Each one gets its own size, tilt, skew, colour,
   * print-offset shadow and per-letter jitter, so the same word never looks the same twice.
   */
  word(text: string, x: number, y: number, style: WordStyle): void {
    const word = this.words[this.nextWord]!;
    this.nextWord = (this.nextWord + 1) % this.words.length;
    const s = Math.min(Math.max(style.strength, 0), 1);
    const r = () => {
      this.wordSeed = (this.wordSeed * 9301 + 49297) % 233280;
      return this.wordSeed / 233280;
    };
    const color = style.color ?? WORD_COLORS[Math.floor(r() * WORD_COLORS.length)]!;
    const shadow = SHADOW_COLORS[Math.floor(r() * SHADOW_COLORS.length)]!;
    const tilt = (r() * 2 - 1) * (8 + 10 * s);
    const skew = (r() * 2 - 1) * 12;
    const size = 30 + 52 * s + r() * 10;
    word.replaceChildren();
    for (const letter of text) {
      const span = document.createElement('span');
      span.textContent = letter;
      span.style.setProperty('--ly', `${((r() * 2 - 1) * (2 + 6 * s)).toFixed(1)}px`);
      span.style.setProperty('--lr', `${((r() * 2 - 1) * (4 + 8 * s)).toFixed(1)}deg`);
      word.append(span);
    }
    word.style.setProperty('--x', `${x.toFixed(0)}px`);
    word.style.setProperty('--y', `${y.toFixed(0)}px`);
    word.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
    word.style.setProperty('--skew', `${skew.toFixed(1)}deg`);
    word.style.setProperty('--size', `${size.toFixed(0)}px`);
    word.style.setProperty('--color', color);
    word.style.setProperty('--shadow', shadow);
    word.style.setProperty('--shake', `${(2 + 7 * s).toFixed(1)}px`);
    word.style.setProperty('--life', `${(0.55 + 0.45 * s).toFixed(2)}s`);
    word.hidden = false;
    word.classList.remove('play');
    void word.offsetWidth;
    word.classList.add('play');
  }

  /** A word at a world point; skipped when the point is behind the camera. */
  wordAt(text: string, at: Vector3, camera: Camera, style: WordStyle): void {
    this.projected.copy(at).project(camera);
    if (this.projected.z > 1 || this.projected.z < -1) return;
    const x = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    this.word(text, x, y, style);
  }

  /** Mode switch: a comic panel slashes across with halftone dots in the mode colour. */
  transform(name: string, color: string): void {
    this.transformName.textContent = name;
    this.transformPanel.style.setProperty('--mode', color);
    this.transformPanel.hidden = false;
    this.transformPanel.classList.remove('play');
    void this.transformPanel.offsetWidth;
    this.transformPanel.classList.add('play');
    this.flash(color, 0.35);
  }

  /** A full-screen colour flash that fades out at once. */
  flash(color: string, strength: number): void {
    this.flashLayer.style.setProperty('--flash', color);
    this.flashLayer.style.setProperty('--strength', String(strength));
    this.flashLayer.classList.remove('play');
    void this.flashLayer.offsetWidth;
    this.flashLayer.classList.add('play');
  }

  /** A comic caption banner across the top (CRIME STOPPED, crime alerts). */
  showBanner(title: string, subtitle: string, duration: number, tone: 'win' | 'alert' = 'win'): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.banner.dataset.tone = tone;
    this.banner.hidden = false;
    this.banner.classList.remove('out');
    this.banner.classList.remove('play');
    void this.banner.offsetWidth;
    this.banner.classList.add('play');
    this.bannerTime = 0;
    this.bannerDuration = duration;
  }

  /** Letterbox bars, a panel border and halftone corners: a comic frame for a slow-motion beat. */
  setLetterbox(on: boolean, caption = ''): void {
    this.letterbox.classList.toggle('on', on);
    this.letterboxCaption.textContent = caption;
  }

  /** `dt`: real seconds. */
  update(dt: number): void {
    if (this.bannerTime >= 0) {
      this.bannerTime += dt;
      if (this.bannerTime > this.bannerDuration && !this.banner.classList.contains('out')) this.banner.classList.add('out');
      if (this.bannerTime > this.bannerDuration + 0.4) {
        this.banner.hidden = true;
        this.bannerTime = -1;
      }
    }
  }
}
