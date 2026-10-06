/**
 * Keyboard state plus mouse movement while the pointer is locked.
 * Keys use KeyboardEvent.code, so WASD works the same on every keyboard layout.
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private locked = false;

  /** Clicking `lockTarget` captures the mouse; Esc releases it (browser default). */
  constructor(lockTarget: HTMLElement) {
    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement) return; // typing in the tuning panel
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
      if (event.code === 'Space') event.preventDefault();
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
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseX += event.movementX;
      this.mouseY += event.movementY;
    });
  }

  get pointerLocked(): boolean {
    return this.locked;
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** True only during the frame in which the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Mouse movement since the previous call, in pixels. */
  takeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
  }
}
