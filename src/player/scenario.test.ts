import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { buildCollision, generateCity } from '../world/cityGen';
import { CollisionWorld } from '../world/collision';
import type { MoveState, SimEvent } from './playerSim';
import { makeSim, run } from './simTestUtils';

const KMH = 1 / 3.6;

/**
 * Whole-city gameplay run without a renderer: sprint off the spawn roof, hold Shift and W to
 * chain swings down the main avenue, let go, dive and land. This is the route the PR asks
 * Emirhan to try, played by a script.
 */
describe('scripted run through city v1', () => {
  const city = generateCity(tuning.city);
  const world = new CollisionWorld();
  buildCollision(city, world);
  const sim = makeSim(world);
  sim.spawn(city.spawn.x, city.spawn.y, city.spawn.z, city.spawn.yaw);

  const swingSpeeds: number[] = [];
  const states = new Set<MoveState>();
  let maxSpeed = 0;
  let nanSteps = 0;
  let outside = 0;
  const events: SimEvent[] = run(
    sim,
    24,
    (t) => ({ forward: 1, shift: t < 18, divePressed: t >= 18.5 && t < 18.5 + 1 / 120 }),
    (s) => {
      states.add(s.state);
      const p = s.position;
      if (!Number.isFinite(p.x + p.y + p.z + s.velocity.x + s.velocity.y + s.velocity.z)) nanSteps++;
      if (Math.abs(p.x) > city.halfSize || Math.abs(p.z) > city.halfSize || p.y < -0.01) outside++;
      maxSpeed = Math.max(maxSpeed, s.speed);
      if (s.state === 'swinging') swingSpeeds.push(s.speed / KMH);
    },
  );
  const count = (type: SimEvent['type']) => events.filter((e) => e.type === type).length;

  it('never produces NaN and never leaves the city', () => {
    expect(nanSteps).toBe(0);
    expect(outside).toBe(0);
    expect(count('respawn')).toBe(0);
  });

  it('chains several swings down the avenue at cruising speed', () => {
    expect(count('ropeAttach')).toBeGreaterThanOrEqual(5);
    expect(sim.position.z).toBeLessThan(city.spawn.z - 400);
    swingSpeeds.sort((a, b) => a - b);
    const median = swingSpeeds[Math.floor(swingSpeeds.length / 2)] ?? 0;
    expect(median).toBeGreaterThan(100);
    expect(median).toBeLessThan(165);
    expect(maxSpeed / KMH).toBeLessThanOrEqual(tuning.movement.topSpeed + 0.5);
  });

  it('dives and lands at the end', () => {
    expect(states.has('dive')).toBe(true);
    expect(count('land')).toBeGreaterThanOrEqual(1);
    expect(['grounded', 'landing']).toContain(sim.state);
  });
});
