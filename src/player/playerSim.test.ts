import { describe, expect, it } from 'vitest';
import type { MoveState, SimEvent } from './playerSim';
import { makeSim, makeTuning, makeWorld, pressAt, run, STEP } from './simTestUtils';

const KMH = 1 / 3.6;
const canyon: Array<[number, number, number, number, number, number]> = [
  [-40, 0, -600, -12, 90, 600],
  [12, 0, -600, 40, 90, 600],
];
const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('ground movement', () => {
  it('accelerates to run speed and sprints faster with Shift', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 0, 0, 0);
    run(sim, 1.5, () => ({ forward: 1 }));
    expect(sim.speed / KMH).toBeCloseTo(sim.tuning.movement.runSpeed, 0);
    run(sim, 2, () => ({ forward: 1, shift: true }));
    expect(sim.state).toBe('grounded');
    expect(sim.sprinting).toBe(true);
    expect(sim.speed / KMH).toBeCloseTo(sim.tuning.movement.sprintSpeed, 0);
  });

  it('holding Space jumps higher than tapping it', () => {
    const peak = (holdSeconds: number) => {
      const sim = makeSim(makeWorld());
      sim.spawn(0, 0, 0, 0);
      let top = 0;
      run(sim, 1.2, (t) => ({ jumpPressed: pressAt(t, 0), jumpHeld: t < holdSeconds }), (s) => {
        top = Math.max(top, s.position.y);
      });
      return top;
    };
    const full = peak(2);
    const tap = peak(STEP);
    expect(full).toBeCloseTo(makeTuning().movement.jumpHeight, 0);
    expect(tap).toBeLessThan(full * 0.6);
  });

  it('allows a coyote-time jump just after running off a ledge', () => {
    const sim = makeSim(makeWorld([[-40, 0, -5, 0, 10, 5]]));
    sim.spawn(-2, 10, 0, -Math.PI / 2);
    let leftAt = -1;
    const events = run(sim, 1, (t) => ({ forward: 1, camYaw: -Math.PI / 2, jumpPressed: leftAt >= 0 && pressAt(t, leftAt + 0.06) }), (s, t) => {
      if (leftAt < 0 && s.state === 'airborne') leftAt = t;
    });
    expect(leftAt).toBeGreaterThan(0);
    expect(types(events)).toContain('jump');
  });

  it('buffers a jump pressed just before landing', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 2, 0, 0);
    sim.state = 'airborne';
    // Falling 2 m takes ~0.35 s; press at 0.27 s, before touching down.
    const events = run(sim, 0.6, (t) => ({ jumpPressed: pressAt(t, 0.27), jumpHeld: t >= 0.27 }));
    expect(types(events)).toEqual(expect.arrayContaining(['jump']));
    expect(sim.state).toBe('airborne');
    expect(sim.velocity.y).toBeGreaterThan(0);
  });
});

describe('rope swinging', () => {
  function inCanyon() {
    const sim = makeSim(makeWorld(canyon));
    sim.spawn(0, 40, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -25);
    return sim;
  }

  it('attaches ahead and above when Shift is held in the air', () => {
    const sim = inCanyon();
    const events = run(sim, 0.1, () => ({ shift: true }));
    expect(types(events)).toContain('ropeAttach');
    expect(sim.state).toBe('swinging');
    expect(sim.rope.anchor.z).toBeLessThan(sim.position.z);
    expect(sim.rope.anchor.y).toBeGreaterThan(sim.position.y);
  });

  it('keeps momentum and adds a kick on release', () => {
    const sim = inCanyon();
    run(sim, 0.9, () => ({ shift: true, forward: 1 }));
    expect(sim.state).toBe('swinging');
    const before = sim.speed;
    const events = run(sim, STEP, () => ({ shift: false }));
    expect(types(events)).toContain('ropeRelease');
    expect(sim.state).toBe('airborne');
    expect(sim.speed).toBeGreaterThanOrEqual(before);
  });

  it('chains swings down a long street while Shift is held', () => {
    const sim = inCanyon();
    const states = new Set<MoveState>();
    const events = run(sim, 10, () => ({ shift: true, forward: 1 }), (s) => {
      states.add(s.state);
      expect(Number.isFinite(s.position.length())).toBe(true);
    });
    expect(types(events).filter((t) => t === 'ropeAttach').length).toBeGreaterThanOrEqual(3);
    expect(sim.position.z).toBeLessThan(-200);
    expect(states.has('swinging')).toBe(true);
  });

  it('lets go of the rope the moment a swing touches the ground', () => {
    const sim = makeSim(makeWorld(canyon));
    sim.spawn(0, 2, 0, 0);
    // A long rope whose arc dips below the street.
    sim.state = 'swinging';
    sim.rope.active = true;
    sim.rope.anchor.set(-12, 30, -20);
    sim.rope.pivot.set(0, 30, -20);
    sim.rope.length = sim.bobPoint(sim.position.clone()).distanceTo(sim.rope.pivot);
    sim.rope.targetLength = sim.rope.length;
    sim.velocity.set(0, -12, -4);
    let releasedOnLanding = false;
    const events = run(sim, 1, () => ({ shift: true }), (s) => {
      if (s.state !== 'swinging' && !releasedOnLanding) releasedOnLanding = !s.rope.active;
    });
    expect(types(events)).toContain('land');
    expect(types(events)).toContain('ropeRelease');
    expect(releasedOnLanding).toBe(true);
    expect(sim.rope.active).toBe(false);
    expect(types(events)).not.toContain('ropeAttach');
  });

  it('reports every rope release, also into a zip', () => {
    const sim = inCanyon();
    run(sim, 0.5, () => ({ shift: true }));
    expect(sim.state).toBe('swinging');
    const events = run(sim, 0.1, (t) => ({ shift: true, jumpPressed: pressAt(t, 0), aimOrigin: [0, 45, 6], aimDir: [1, 0.05, -1] }));
    const order = types(events);
    expect(order).toContain('zipStart');
    // The swing rope is let go before the zip rope fires, so the zip rope is the one drawn.
    expect(order.indexOf('ropeRelease')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ropeRelease')).toBeLessThan(order.indexOf('zipStart'));
  });

  it('reports a missing anchor once and stays airborne', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 30, 0, 0);
    sim.state = 'airborne';
    const events = run(sim, 0.5, () => ({ shift: true }));
    expect(types(events).filter((t) => t === 'noAnchor')).toHaveLength(1);
    expect(sim.state).toBe('airborne');
  });
});

describe('dive, zip and walls', () => {
  it('dives on C and turns the dive into a swing with Shift', () => {
    const sim = makeSim(makeWorld(canyon));
    sim.spawn(0, 60, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -20);
    run(sim, 0.05, (t) => ({ divePressed: pressAt(t, 0) }));
    expect(sim.state).toBe('dive');
    run(sim, 0.3, () => ({}));
    const diveSpeed = sim.speed;
    run(sim, 0.1, () => ({ shift: true }));
    expect(sim.state).toBe('swinging');
    expect(sim.speed).toBeGreaterThan(diveSpeed * 0.8);
  });

  it('zips to the wall under the crosshair and sticks to it', () => {
    const sim = makeSim(makeWorld([[-10, 0, -60, 10, 40, -40]]));
    sim.spawn(0, 6, 0, 0);
    sim.state = 'airborne';
    const events = run(sim, 2, (t) => ({ jumpPressed: pressAt(t, 0.02), aimOrigin: [0, 8, 6], aimDir: [0, 0.1, -1] }));
    expect(types(events)).toContain('zipStart');
    expect(types(events)).toContain('zipArrive');
    expect(sim.state).toBe('wallClimb');
    expect(sim.position.z).toBeGreaterThan(-40);
    expect(sim.position.z).toBeLessThan(-38.5);
  });

  it('wall-runs on a glancing hit with Shift and jumps off with Space', () => {
    const sim = makeSim(makeWorld([[5, 0, -300, 20, 60, 300]]));
    sim.spawn(3, 20, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(6, 0, -24);
    let ran = false;
    run(sim, 0.5, () => ({ shift: true }), (s) => {
      ran ||= s.state === 'wallRun';
    });
    expect(ran).toBe(true);
    expect(sim.state).toBe('wallRun');
    expect(sim.speed / KMH).toBeGreaterThan(70);
    const events = run(sim, 0.1, (t) => ({ shift: true, jumpPressed: pressAt(t, 0) }));
    expect(types(events)).toContain('wallJump');
    expect(sim.velocity.x).toBeLessThan(-5);
  });

  it('climbs a wall it is pushed into and mantles onto the roof', () => {
    const sim = makeSim(makeWorld([[-10, 0, -20, 10, 12, -5]]));
    sim.spawn(0, 0, 0, 0);
    const states = new Set<MoveState>();
    run(sim, 4, () => ({ forward: states.has('mantle') && sim.state === 'grounded' ? 0 : 1 }), (s) => states.add(s.state));
    expect(states.has('wallClimb')).toBe(true);
    expect(states.has('mantle')).toBe(true);
    expect(sim.position.y).toBeCloseTo(12, 1);
    expect(sim.position.z).toBeLessThan(-5);
  });
});

describe('landing', () => {
  it('does a superhero landing after a long vertical drop', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 40, 0, 0);
    sim.state = 'airborne';
    const events = run(sim, 3, () => ({}));
    const land = events.find((e) => e.type === 'land');
    expect(land && land.type === 'land' && land.kind).toBe('hero');
  });

  it('rolls out of a fast landing and keeps most of the speed', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 12, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -18);
    const events = run(sim, 1.2, () => ({ forward: 1 }));
    const land = events.find((e) => e.type === 'land');
    expect(land && land.type === 'land' && land.kind).toBe('roll');
    expect(sim.speed).toBeGreaterThan(12);
  });
});

describe('collision safety', () => {
  it('never tunnels through a thin wall at very high speed', () => {
    const sim = makeSim(makeWorld([[10, 0, -50, 10.3, 50, 50]]));
    sim.spawn(0, 10, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(100, 0, 0);
    run(sim, 0.5, () => ({}), (s) => expect(s.position.x).toBeLessThan(10));
  });
});
