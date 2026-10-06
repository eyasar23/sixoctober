export interface LoopHandlers {
  /** One fixed simulation step of `dt` seconds. */
  step(dt: number): void;
  /**
   * Once per animation frame. `alpha` (0..1) blends the last two simulation states for smooth
   * motion at any refresh rate; `frameDt` is the real time since the previous frame.
   */
  render(alpha: number, frameDt: number): void;
}

/**
 * Fixed-timestep game loop: the simulation always advances in equal steps (stable physics at
 * any frame rate) and rendering interpolates between them. `timeScale` slows simulated time
 * (slow motion, hit stop) without changing the step size.
 */
export class GameLoop {
  timeScale = 1;
  /** Test hook: when > 0, every frame advances exactly this many steps, ignoring real time. */
  lockstepSteps = 0;
  /** Frame cap (Film 24 / 30), 0 = every screen refresh. */
  maxFps = 0;
  private accumulator = 0;
  private last = 0;

  constructor(
    private readonly stepRate: () => number,
    private readonly maxStepsPerFrame: () => number,
    private readonly handlers: LoopHandlers,
  ) {}

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    if (this.maxFps > 0 && this.lockstepSteps === 0 && now - this.last < 1000 / this.maxFps - 2) {
      requestAnimationFrame(this.frame);
      return;
    }
    const frameDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const dt = 1 / this.stepRate();
    let alpha = 1;
    if (this.lockstepSteps > 0) {
      for (let i = 0; i < this.lockstepSteps; i++) this.handlers.step(dt);
      this.accumulator = 0;
    } else {
      this.accumulator += frameDt * this.timeScale;
      const max = this.maxStepsPerFrame();
      let steps = 0;
      while (this.accumulator >= dt && steps < max) {
        this.handlers.step(dt);
        this.accumulator -= dt;
        steps++;
      }
      // Too slow to keep up: drop the backlog instead of spiralling.
      if (steps >= max) this.accumulator = 0;
      alpha = this.accumulator / dt;
    }
    this.handlers.render(alpha, frameDt);
    requestAnimationFrame(this.frame);
  };
}
