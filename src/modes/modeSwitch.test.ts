import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../player/playerSim';
import { makeSim, makeWorld, pressAt, run } from '../player/simTestUtils';
import { grappleMode, MODE_LIST, titanMode } from '.';
import { ModeBand } from './modeBand';

const canyon: Array<[number, number, number, number, number, number]> = [
  [-40, 0, -600, -12, 90, 600],
  [12, 0, -600, 40, 90, 600],
];
const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('ModeBand', () => {
  it('cycles with Tab and picks slots with the number keys', () => {
    const band = new ModeBand(MODE_LIST);
    const seen: string[] = [];
    band.onChange((mode) => seen.push(mode.id));
    band.next();
    band.next();
    band.select(1);
    band.select(1); // already on: no event
    band.select(7); // no such slot
    expect(seen).toEqual(['titan', 'grapple', 'titan']);
  });
});

describe('mode switch keeps momentum', () => {
  it('Kanca → Titan mid-swing: the rope lets go and the velocity is untouched', () => {
    const sim = makeSim(makeWorld(canyon));
    sim.spawn(0, 40, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -25);
    run(sim, 0.6, () => ({ shift: true, forward: 1 }));
    expect(sim.state).toBe('swinging');
    const before = sim.velocity.clone();
    sim.setMode(titanMode);
    expect(sim.velocity.equals(before)).toBe(true);
    expect(sim.state).toBe('airborne');
    expect(sim.rope.active).toBe(false);
    expect(types(sim.events)).toContain('ropeRelease');
    // Next step: still flying the same way (only gravity and drag act).
    sim.events.length = 0;
    run(sim, 1 / 120, () => ({ shift: true }));
    expect(sim.velocity.x).toBeCloseTo(before.x, 1);
    expect(sim.velocity.z).toBeCloseTo(before.z, 1);
    expect(types(sim.events)).not.toContain('ropeAttach');
  });

  it('switching back and forth in the air changes nothing about the flight', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 50, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(12, 5, -30);
    const before = sim.velocity.clone();
    sim.setMode(titanMode);
    sim.setMode(grappleMode);
    sim.setMode(titanMode);
    expect(sim.velocity.equals(before)).toBe(true);
    expect(sim.state).toBe('airborne');
  });

  it('a dive becomes a ground pound in Titan and lands with a shockwave', () => {
    const sim = makeSim(makeWorld());
    sim.spawn(0, 60, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -20);
    run(sim, 0.05, (t) => ({ divePressed: pressAt(t, 0) }));
    expect(sim.state).toBe('dive');
    const horizontal = Math.hypot(sim.velocity.x, sim.velocity.z);
    sim.setMode(titanMode);
    expect(sim.state).toBe('pound');
    expect(Math.hypot(sim.velocity.x, sim.velocity.z)).toBeCloseTo(horizontal, 5);
    const events = run(sim, 3, () => ({}));
    const shock = events.find((e) => e.type === 'shockwave');
    expect(shock && shock.type === 'shockwave' && shock.pound).toBe(true);
    expect(['landing', 'grounded']).toContain(sim.state as string);
  });
});

describe('Titan', () => {
  it('cannot throw a rope', () => {
    const sim = makeSim(makeWorld(canyon), undefined, titanMode);
    sim.spawn(0, 40, 0, 0);
    sim.state = 'airborne';
    sim.velocity.set(0, 0, -25);
    const events = run(sim, 0.5, () => ({ shift: true }));
    expect(types(events)).not.toContain('ropeAttach');
  });

  it('runs slower than Kanca', () => {
    const top = (mode: typeof grappleMode) => {
      const sim = makeSim(makeWorld(), undefined, mode);
      sim.spawn(0, 0, 0, 0);
      run(sim, 3, () => ({ forward: 1, shift: true }));
      return sim.speed;
    };
    expect(top(titanMode)).toBeLessThan(top(grappleMode) * 0.8);
  });

  it('a charged super jump goes far higher than a tap', () => {
    const peak = (holdSeconds: number) => {
      const sim = makeSim(makeWorld(), undefined, titanMode);
      sim.spawn(0, 0, 0, 0);
      let top = 0;
      const events = run(sim, 4, (t) => ({ jumpPressed: pressAt(t, 0), jumpHeld: t < holdSeconds }), (s) => {
        top = Math.max(top, s.position.y);
      });
      expect(types(events)).toContain('superJump');
      return top;
    };
    const tap = peak(0.02);
    const full = peak(1.2);
    expect(full).toBeGreaterThan(tap * 4);
    expect(full).toBeGreaterThan(20);
  });

  it('pounds on C in the air: hang, slam, shockwave', () => {
    const sim = makeSim(makeWorld(), undefined, titanMode);
    sim.spawn(0, 30, 0, 0);
    sim.state = 'airborne';
    const events = run(sim, 2, (t) => ({ divePressed: pressAt(t, 0) }));
    expect(types(events)).toContain('poundStart');
    expect(types(events)).toContain('shockwave');
  });
});
