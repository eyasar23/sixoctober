/** Keys whose presses are remembered until a game system consumes them. */
const TRACKED = new Set(['Space', 'KeyC', 'KeyE', 'KeyQ', 'KeyH', 'KeyR', 'KeyT', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Enter', 'Backspace']);
/** Accumulated wheel delta that counts as one notch (mouse wheels send ~100, touchpads less). */
const WHEEL_NOTCH = 40;
/** Keys whose browser default (scrolling, focus change) is blocked. */
const BLOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Keyboard state, buffered key presses and mouse movement while the pointer is locked.
 * Keys use KeyboardEvent.code, so WASD works the same on every keyboard layout.
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private wheel = 0;
  private locked = false;
  private readonly lockListeners: Array<(locked: boolean) => void> = [];

  /** Clicking `lockTarget` captures the mouse; Esc releases it (browser default). */
  constructor(lockTarget: HTMLElement) {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (BLOCKED.has(event.code)) event.preventDefault();
      if (!event.repeat && TRACKED.has(event.code)) this.pressed.add(event.code);
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.held.delete(event.code));
    window.addEventListener('blur', () => this.held.clear());

    lockTarget.addEventListener('click', () => {
      if (this.locked) return;
      lockTarget.requestPointerLock().catch(() => {
        // Chrome refuses a re-lock right after Esc; the next click tries again.
      });
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === lockTarget;
      for (const listener of this.lockListeners) listener(this.locked);
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseX += event.movementX;
      this.mouseY += event.movementY;
    });
    window.addEventListener(
      'wheel',
      (event) => {
        if (this.locked) this.wheel += event.deltaY;
      },
      { passive: true },
    );
  }

  /** One mouse-wheel notch since the last call: +1 away (scroll down), −1 toward, 0 none. */
  takeWheelStep(): number {
    if (Math.abs(this.wheel) < WHEEL_NOTCH) return 0;
    const step = Math.sign(this.wheel);
    this.wheel = 0;
    return step;
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  onPointerLockChange(listener: (locked: boolean) => void): void {
    this.lockListeners.push(listener);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  get shiftHeld(): boolean {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  /** True once per key press: the next call returns false until the key goes down again. */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Mouse movement since the previous call, in pixels. */
  takeMouseDelta(out: { x: number; y: number }): { x: number; y: number } {
    out.x = this.mouseX;
    out.y = this.mouseY;
    this.mouseX = 0;
    this.mouseY = 0;
    return out;
  }
}
