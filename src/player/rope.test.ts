import { describe, expect, it } from 'vitest';
import { makeSim, makeTuning, makeWorld, run } from './simTestUtils';

describe('rope constraint', () => {
  const tuning = makeTuning((t) => {
    t.movement.airDrag = 0;
    t.movement.topSpeed = 10000;
    t.rope.swingAssist = 0;
    t.rope.autoChain = false;
    t.rope.lateralDamping = 0;
  });
  const gravity = tuning.movement.gravity * tuning.rope.swingGravityMult;

  function swingingSim(offsetX: number, length: number) {
    const sim = makeSim(makeWorld(), tuning);
    sim.spawn(offsetX, 300, 0, 0);
    sim.state = 'swinging';
    sim.rope.active = true;
    sim.rope.anchor.set(0, 300 + tuning.rope.bobHeight + Math.sqrt(Math.max(length ** 2 - offsetX ** 2, 0)), 0);
    sim.rope.pivot.copy(sim.rope.anchor);
    sim.rope.length = length;
    sim.rope.targetLength = length;
    return sim;
  }

  /** Kinetic + potential energy per kg, measured from the lowest point of the swing. */
  const energy = (sim: ReturnType<typeof makeSim>) =>
    0.5 * sim.velocity.lengthSq() + gravity * (sim.position.y + tuning.rope.bobHeight - (sim.rope.pivot.y - sim.rope.length));

  it('never gains energy or produces NaN over two minutes of swinging', () => {
    const sim = swingingSim(25, 30);
    const start = energy(sim);
    expect(start).toBeGreaterThan(100);
    let maxEnergy = start;
    let minY = Infinity;
    run(sim, 120, () => ({ shift: true }), (s) => {
      maxEnergy = Math.max(maxEnergy, energy(s));
      minY = Math.min(minY, s.position.y);
      expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
    });
    expect(sim.state).toBe('swinging');
    // At most 1 % above the start (numerical noise); the rope may only lose energy.
    expect(maxEnergy).toBeLessThanOrEqual(start * 1.01);
    // Still swinging at the end (lost energy, but not all of it): it passes below the anchor.
    expect(minY).toBeLessThan(sim.rope.anchor.y - 25);
    expect(sim.position.distanceTo(sim.rope.pivot)).toBeLessThan(30 + tuning.rope.bobHeight + 0.01);
  });

  it('survives a degenerate rope (body exactly at the anchor)', () => {
    const sim = swingingSim(0, 0);
    sim.rope.anchor.set(0, 300 + tuning.rope.bobHeight, 0);
    sim.rope.pivot.copy(sim.rope.anchor);
    run(sim, 2, () => ({ shift: true }), (s) => {
      expect(Number.isFinite(s.position.x + s.position.y + s.position.z + s.velocity.length())).toBe(true);
    });
  });
});
