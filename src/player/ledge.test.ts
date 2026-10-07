import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld, PERCHABLE, ANCHORABLE, CLIMBABLE } from '../world/collision';
import { createLedgeTarget, findLedge } from './grapple';
import type { SimEvent } from './playerSim';
import { makeSim, makeTuning, pressAt, run } from './simTestUtils';

const rope = makeTuning().rope;
const HALF_WIDTH = 0.35;
const HALF_HEIGHT = 0.9;
const types = (events: SimEvent[]) => events.map((e) => e.type);

/** A 30 m tall building north of the origin (front face at z = −20) with a parapet on the front edge. */
function block(): CollisionWorld {
  const world = new CollisionWorld();
  world.addBox(-15, 0, -50, 15, 30, -20, ANCHORABLE | CLIMBABLE | PERCHABLE);
  world.addBox(-15, 30, -20.3, 15, 30.35, -20, PERCHABLE); // parapet
  return world;
}

function aim(from: [number, number, number], to: [number, number, number]): { origin: Vector3; dir: Vector3 } {
  const origin = new Vector3(...from);
  return { origin, dir: new Vector3(...to).sub(origin).normalize() };
}

describe('look and launch: ledge choice', () => {
  it('aiming at a facade picks the roof edge above it and perches on the parapet', () => {
    const world = block();
    const feet = new Vector3(0, 0, 0);
    const { origin, dir } = aim([0, 2.5, 5], [3, 12, -20]);
    const out = createLedgeTarget();
    expect(findLedge(world, origin, dir, feet, rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(true);
    expect(out.normal.z).toBe(1); // facing the hero (south)
    expect(out.perch.y).toBeCloseTo(30.35, 2); // on top of the parapet
    expect(out.perch.z).toBeGreaterThan(-20.3);
    expect(out.perch.z).toBeLessThan(-20);
    expect(out.perch.x).toBeGreaterThan(1.5); // under the aim point, not the middle of the edge
    // The pull ends outside the facade, above the edge.
    expect(out.approach.z).toBeGreaterThan(-20);
    expect(out.approach.y).toBeGreaterThan(out.perch.y);
  });

  it('aiming at a roof picks its nearest edge that faces the hero', () => {
    const world = new CollisionWorld();
    world.addBox(-10, 0, -40, 10, 8, -20, ANCHORABLE | CLIMBABLE | PERCHABLE);
    const feet = new Vector3(0, 20, 0); // above and south of the roof
    const { origin, dir } = aim([0, 22, 5], [2, 8, -24]);
    const out = createLedgeTarget();
    expect(findLedge(world, origin, dir, feet, rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(true);
    expect(out.normal.z).toBe(1);
    expect(out.point.z).toBeCloseTo(-20, 5);
    expect(out.perch.y).toBeCloseTo(8, 5);
  });

  it('finds nothing in the open sky, beyond its range or on a box that is not a ledge', () => {
    const world = block();
    const out = createLedgeTarget();
    const sky = aim([0, 2, 5], [0, 60, -5]);
    expect(findLedge(world, sky.origin, sky.dir, new Vector3(), rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(false);
    const far = aim([0, 2.5, 205], [0, 12, -20]);
    expect(findLedge(world, far.origin, far.dir, new Vector3(0, 0, 200), rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(false);
    const plain = new CollisionWorld();
    plain.addBox(-15, 0, -50, 15, 30, -20, ANCHORABLE | CLIMBABLE); // not perchable
    const wall = aim([0, 2.5, 5], [0, 12, -20]);
    expect(findLedge(plain, wall.origin, wall.dir, new Vector3(), rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(false);
  });

  it('ignores a building between the camera and the hero', () => {
    const world = block();
    // A low block right behind the hero, between it and the camera.
    world.addBox(-5, 0, 3, 5, 12, 8, ANCHORABLE | CLIMBABLE | PERCHABLE);
    const out = createLedgeTarget();
    const { origin, dir } = aim([0, 6, 12], [0, 14, -20]);
    expect(findLedge(world, origin, dir, new Vector3(0, 0, 0), rope, HALF_WIDTH, HALF_HEIGHT, out)).toBe(true);
    expect(out.point.z).toBeCloseTo(-20, 5);
  });
});

describe('look and launch: the move', () => {
  it('E pulls the hero up onto the ledge and leaves them perched; Space leaps off into a swing', () => {
    const world = block();
    // A second wall to swing from after the leap.
    world.addBox(-60, 0, -200, -45, 90, 40, ANCHORABLE | CLIMBABLE | PERCHABLE);
    const sim = makeSim(world);
    sim.spawn(0, 0, 0, 0);
    const aimAt = { aimOrigin: [0, 2.5, 5] as [number, number, number], aimDir: [0, 10, -25] as [number, number, number] };
    const events = run(sim, 2.5, (t) => ({ launchPressed: pressAt(t, 0.02), ...aimAt }));
    expect(types(events)).toEqual(expect.arrayContaining(['ledgeLaunch', 'zipStart', 'perch']));
    expect(sim.state).toBe('perch');
    expect(sim.position.y).toBeCloseTo(30.35, 1);
    expect(sim.position.z).toBeGreaterThan(-20.4);
    // Face out over the street.
    expect(Math.abs(Math.sin(sim.yaw))).toBeLessThan(0.2);

    // Space: leap forward (camera looks south, away from the building), then Shift swings.
    const leap = run(sim, 1.2, (t) => ({ jumpPressed: pressAt(t, 0), shift: t > 0.25, camYaw: Math.PI }));
    expect(types(leap)).toContain('perchLeap');
    expect(types(leap)).toContain('ropeAttach');
  });

  it('reports a missing ledge and stays put', () => {
    const sim = makeSim(block());
    sim.spawn(0, 0, 0, 0);
    const events = run(sim, 0.2, (t) => ({ launchPressed: pressAt(t, 0), aimOrigin: [0, 2, 5], aimDir: [0, 1, 0.2] }));
    expect(types(events)).toContain('noLedge');
    expect(sim.state).toBe('grounded');
  });
});
