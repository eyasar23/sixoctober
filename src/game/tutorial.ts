import type { CombatEvent } from '../combat/combatSystem';
import type { Enemy } from '../combat/enemy';
import { t, tKey } from '../i18n';
import type { PlayerSim, SimEvent } from '../player/playerSim';
import './tutorial.css';

type StepId = 'sprint' | 'jump' | 'swing' | 'release' | 'ledge' | 'wallRun' | 'mode' | 'fight';

interface Step {
  id: StepId;
  /** Seconds before "Enter: skip this step" shows (for the harder moves). */
  skipAfter: number;
}

const STEPS: Step[] = [
  { id: 'sprint', skipAfter: 20 },
  { id: 'jump', skipAfter: 20 },
  { id: 'swing', skipAfter: 30 },
  { id: 'release', skipAfter: 25 },
  { id: 'ledge', skipAfter: 30 },
  { id: 'wallRun', skipAfter: 20 },
  { id: 'mode', skipAfter: 20 },
  { id: 'fight', skipAfter: 30 },
];

export interface TutorialHooks {
  /** A sparring dummy near the hero (passive enemy). */
  spawnDummy(): Enemy;
  removeDummy(dummy: Enemy): void;
  /** Step done: a little stamp sound. */
  stepDone(): void;
  /** Tutorial over (finished or skipped). */
  finished(completed: boolean): void;
}

/**
 * Learn-by-playing start (about a minute or two): one move at a time with a comic caption
 * box, each step done by actually doing it. Hard steps offer "Enter: skip step" after a while;
 * Backspace (or the pause menu) skips the whole tutorial.
 */
export class Tutorial {
  active = false;
  private index = 0;
  private stepTime = 0;
  private progress = 0;
  private dummy: Enemy | null = null;
  private stampTime = -1;
  private readonly box: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly text: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly dots: HTMLElement[] = [];

  constructor(
    parent: HTMLElement,
    private readonly sim: PlayerSim,
    private readonly hooks: TutorialHooks,
  ) {
    this.box = document.createElement('div');
    this.box.className = 'tutorial';
    this.box.hidden = true;
    this.counter = document.createElement('div');
    this.counter.className = 'tutorial-counter';
    this.text = document.createElement('div');
    this.text.className = 'tutorial-text';
    this.hint = document.createElement('div');
    this.hint.className = 'tutorial-hint';
    const dots = document.createElement('div');
    dots.className = 'tutorial-dots';
    for (let i = 0; i < STEPS.length; i++) {
      const dot = document.createElement('span');
      dots.append(dot);
      this.dots.push(dot);
    }
    this.stamp = document.createElement('div');
    this.stamp.className = 'tutorial-stamp';
    this.stamp.textContent = t('tutorial.nice');
    this.stamp.hidden = true;
    this.box.append(this.counter, this.text, dots, this.hint);
    parent.append(this.box, this.stamp);
  }

  start(): void {
    this.active = true;
    this.box.hidden = false;
    this.goTo(0);
  }

  /** Ends the tutorial early. */
  skip(): void {
    this.finish(false);
  }

  /** Enter: skip the current step once it has been shown for a while. */
  skipStep(): void {
    if (!this.active) return;
    const step = STEPS[this.index];
    if (step && this.stepTime >= step.skipAfter) this.next();
  }

  onSim(event: SimEvent): void {
    if (!this.active) return;
    const id = STEPS[this.index]?.id;
    if (id === 'jump' && event.type === 'jump') this.next();
    else if (id === 'release' && event.type === 'ropeRelease' && event.boosted) this.next();
    else if (id === 'ledge' && event.type === 'perch') this.next();
    else if (id === 'wallRun' && event.type === 'wallRunStart') this.next();
  }

  onCombat(event: CombatEvent): void {
    if (!this.active || STEPS[this.index]?.id !== 'fight') return;
    if (event.type === 'hit') {
      this.progress++;
      this.updateText();
      if (this.progress >= 3) this.next();
    }
  }

  onModeChange(): void {
    if (this.active && STEPS[this.index]?.id === 'mode') this.next();
  }

  /** `dt`: real seconds. */
  update(dt: number): void {
    if (this.stampTime >= 0) {
      this.stampTime += dt;
      if (this.stampTime > 0.9) {
        this.stamp.hidden = true;
        this.stampTime = -1;
      }
    }
    if (!this.active) return;
    this.stepTime += dt;
    const step = STEPS[this.index];
    if (!step) return;
    if (step.id === 'sprint' && this.sim.sprinting) {
      this.progress += dt;
      if (this.progress > 0.8) this.next();
    } else if (step.id === 'swing' && this.sim.state === 'swinging') {
      this.progress += dt;
      if (this.progress > 1) this.next();
    }
    this.hint.textContent = this.stepTime >= step.skipAfter ? t('tutorial.skipStep') : t('tutorial.skipAll');
  }

  private next(): void {
    this.hooks.stepDone();
    this.stamp.hidden = false;
    this.stamp.classList.remove('play');
    void this.stamp.offsetWidth;
    this.stamp.classList.add('play');
    this.stampTime = 0;
    if (this.index + 1 >= STEPS.length) this.finish(true);
    else this.goTo(this.index + 1);
  }

  private goTo(index: number): void {
    this.index = index;
    this.stepTime = 0;
    this.progress = 0;
    const step = STEPS[index]!;
    if (step.id === 'fight' && !this.dummy) this.dummy = this.hooks.spawnDummy();
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('done', i < index);
      dot.classList.toggle('now', i === index);
    });
    this.updateText();
    this.box.classList.remove('play');
    void this.box.offsetWidth;
    this.box.classList.add('play');
  }

  private updateText(): void {
    const step = STEPS[this.index];
    if (!step) return;
    this.counter.textContent = t('tutorial.step', { n: this.index + 1, total: STEPS.length });
    this.text.textContent = tKey(`tutorial.${step.id}`, { hits: this.progress });
  }

  private finish(completed: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.box.hidden = true;
    if (this.dummy) {
      this.hooks.removeDummy(this.dummy);
      this.dummy = null;
    }
    this.hooks.finished(completed);
  }
}
