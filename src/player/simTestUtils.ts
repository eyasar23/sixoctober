/** Helpers for movement tests: build a small world, script input, step the simulation. */
import { tuning, type Tuning } from '../config/tuning';
import { grappleMode } from '../modes';
import type { ModeDefinition } from '../modes/modeBand';
import { CollisionWorld, ANCHORABLE, CLIMBABLE } from '../world/collision';
import { createSimInput, PlayerSim, type SimEvent, type SimInput } from './playerSim';

export const STEP = 1 / 120;

export function makeTuning(edit?: (t: Tuning) => void): Tuning {
  const copy = structuredClone(tuning);
  edit?.(copy);
  return copy;
}

export function makeWorld(boxes: Array<[number, number, number, number, number, number]> = []): CollisionWorld {
  const world = new CollisionWorld();
  for (const [x0, y0, z0, x1, y1, z1] of boxes) world.addBox(x0, y0, z0, x1, y1, z1, ANCHORABLE | CLIMBABLE);
  return world;
}

export function makeSim(world: CollisionWorld, t: Tuning = makeTuning(), mode: ModeDefinition = grappleMode): PlayerSim {
  return new PlayerSim(world, t, mode, 2000);
}

export interface ScriptedInput {
  forward?: number;
  right?: number;
  shift?: boolean;
  jumpHeld?: boolean;
  jumpPressed?: boolean;
  divePressed?: boolean;
  launchPressed?: boolean;
  /** Camera looks along −Z unless set. */
  camYaw?: number;
  aimOrigin?: [number, number, number];
  aimDir?: [number, number, number];
}

/** Runs the simulation for `seconds`; `script(t)` gives the input at time t. Collects events. */
export function run(
  sim: PlayerSim,
  seconds: number,
  script: (t: number) => ScriptedInput,
  onStep?: (sim: PlayerSim, t: number) => void,
): SimEvent[] {
  const events: SimEvent[] = [];
  const input = createSimInput();
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    fill(input, script(t));
    sim.step(STEP, input);
    events.push(...sim.events);
    sim.events.length = 0;
    onStep?.(sim, t);
  }
  return events;
}

function fill(input: SimInput, s: ScriptedInput): void {
  const yaw = s.camYaw ?? 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const forward = s.forward ?? 0;
  const right = s.right ?? 0;
  let mx = fx * forward + rx * right;
  let mz = fz * forward + rz * right;
  const length = Math.hypot(mx, mz);
  if (length > 1) {
    mx /= length;
    mz /= length;
  }
  input.moveX = mx;
  input.moveZ = mz;
  input.forward = forward;
  input.right = right;
  input.camForwardX = fx;
  input.camForwardZ = fz;
  input.shiftHeld = s.shift ?? false;
  input.jumpHeld = s.jumpHeld ?? false;
  input.jumpPressed = s.jumpPressed ?? false;
  input.divePressed = s.divePressed ?? false;
  input.launchPressed = s.launchPressed ?? false;
  input.respawnPressed = false;
  if (s.aimOrigin) input.aimOrigin.set(...s.aimOrigin);
  if (s.aimDir) input.aimDir.set(...s.aimDir).normalize();
  else input.aimDir.set(fx, 0, fz);
}

/** True only during the first step at or after time t0 (a key press). */
export function pressAt(t: number, t0: number): boolean {
  return t >= t0 && t < t0 + STEP * 0.999;
}
