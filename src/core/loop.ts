/** Longest step passed to `update`, s. Stops physics from jumping after a tab switch. */
const MAX_STEP = 0.1;

/** Calls `update` once per animation frame with the elapsed time in seconds. */
export function startLoop(update: (dt: number) => void): void {
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, MAX_STEP);
    last = now;
    update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
