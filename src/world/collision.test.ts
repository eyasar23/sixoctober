import { describe, expect, it } from 'vitest';
import { CollisionWorld, createHit } from './collision';

describe('CollisionWorld', () => {
  const world = new CollisionWorld();
  world.addBox(10, 0, -5, 12, 10, 5, 3);

  it('sweeps an AABB into a box and reports the face normal', () => {
    const hit = createHit();
    expect(world.sweep(0, 1, 0, 0.5, 1, 0.5, 20, 0, 0, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(9.5 / 20, 5);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([-1, 0, 0]);
  });

  it('does not report surfaces it only slides along', () => {
    const hit = createHit();
    // Touching the wall's face (x = 9.5 for a 0.5 half width) and moving parallel to it.
    expect(world.sweep(9.5, 1, -20, 0.5, 1, 0.5, 0, 0, 10, hit)).toBe(false);
  });

  it('hits the ground plane when falling', () => {
    const hit = createHit();
    expect(world.sweep(0, 5, 0, 0.5, 1, 0.5, 0, -10, 0, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(0.4, 5);
    expect(hit.ny).toBe(1);
    expect(hit.box).toBeNull();
  });

  it('raycasts with distance', () => {
    const hit = createHit();
    expect(world.raycast(0, 5, 0, 1, 0, 0, 100, 0, hit)).toBe(true);
    expect(hit.t).toBeCloseTo(10, 5);
    expect(world.raycast(0, 15, 0, 1, 0, 0, 100, 0, hit)).toBe(false);
  });

  it('pushes overlapping bodies out along the shortest axis', () => {
    const c = { x: 10.2, y: 5, z: 0 };
    expect(world.depenetrate(c, 0.5, 1, 0.5)).toBe(true);
    expect(c.x).toBeLessThanOrEqual(9.5);
  });
});
