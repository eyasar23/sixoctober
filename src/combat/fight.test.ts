import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { titanMode } from '../modes';
import { createSimInput } from '../player/playerSim';
import { makeSim, makeTuning, makeWorld, STEP } from '../player/simTestUtils';
import { type CombatEvent, type CombatInput, CombatSystem } from './combatSystem';

function setup(mode = undefined as typeof titanMode | undefined) {
  const t = makeTuning();
  const world = makeWorld();
  const sim = makeSim(world, t, mode);
  sim.spawn(0, 0, 0, 0);
  const combat = new CombatSystem(t, sim, world);
  const simInput = createSimInput();
  const input: CombatInput = {
    punch: false,
    kick: false,
    counter: false,
    rope: false,
    aimOrigin: simInput.aimOrigin,
    aimDir: simInput.aimDir,
    camForwardX: 0,
    camForwardZ: -1,
  };
  return { t, world, sim, combat, simInput, input };
}

describe('fights', () => {
  it('a scripted hero beats a gang of four (no NaN, the hero stays up)', () => {
    const { sim, combat, simInput, input } = setup();
    const gang = [
      combat.spawn('grunt', 0, 0, -8),
      combat.spawn('grunt', 4, 0, -9),
      combat.spawn('grunt', -4, 0, -9),
      combat.spawn('brute', 0, 0, -12),
    ];
    for (const e of gang) e.alerted = true;
    const events: CombatEvent[] = [];
    let time = 0;
    let nextClick = 0;
    let downs = 0;
    for (; time < 120 && combat.aliveCount > 0; time += STEP) {
      // Bot: face the nearest standing enemy, walk in, click on a rhythm, counter every "!!".
      let target = null as (typeof gang)[number] | null;
      let best = Infinity;
      for (const e of gang) {
        if (e.health <= 0) continue;
        const d = Math.hypot(e.position.x - sim.position.x, e.position.z - sim.position.z);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      if (!target) break;
      const dx = target.position.x - sim.position.x;
      const dz = target.position.z - sim.position.z;
      const d = Math.max(Math.hypot(dx, dz), 1e-3);
      input.camForwardX = dx / d;
      input.camForwardZ = dz / d;
      simInput.camForwardX = dx / d;
      simInput.camForwardZ = dz / d;
      simInput.moveX = d > 2.5 ? dx / d : 0;
      simInput.moveZ = d > 2.5 ? dz / d : 0;
      input.counter = gang.some((e) => e.counterable && e.position.distanceTo(sim.position) < 4);
      input.punch = !input.counter && time >= nextClick && d < 5;
      input.kick = false;
      if (input.punch) nextClick = time + 0.22;
      combat.step(STEP, input);
      simInput.launchPressed = false;
      sim.step(STEP, simInput);
      sim.events.length = 0;
      for (const e of combat.events) {
        events.push(e);
        if (e.type === 'playerDown') downs++;
      }
      combat.events.length = 0;
      expect(Number.isFinite(sim.position.x + sim.position.z)).toBe(true);
      for (const e of gang) expect(Number.isFinite(e.position.x + e.position.y + e.position.z)).toBe(true);
    }
    expect(combat.aliveCount).toBe(0);
    expect(time).toBeLessThan(120);
    expect(downs).toBe(0);
    expect(events.filter((e) => e.type === 'hit').length).toBeGreaterThan(8);
    expect(events.some((e) => e.type === 'counter')).toBe(true);
    const finals = events.filter((e) => e.type === 'hit' && e.final);
    expect(finals).toHaveLength(1);
  });

  it('Q during "!!" counters: the enemy is launched, the hero takes no damage', () => {
    const { sim, combat, simInput, input } = setup();
    const enemy = combat.spawn('grunt', 0, 0, -3);
    enemy.alerted = true;
    let countered = false;
    for (let i = 0; i < 600 && !countered; i++) {
      input.counter = enemy.state === 'warn';
      combat.step(STEP, input);
      sim.step(STEP, simInput);
      sim.events.length = 0;
      countered = combat.events.some((e) => e.type === 'counter');
      combat.events.length = 0;
    }
    expect(countered).toBe(true);
    for (let i = 0; i < 60; i++) {
      input.counter = false;
      combat.step(STEP, input);
      sim.step(STEP, simInput);
      sim.events.length = 0;
      combat.events.length = 0;
    }
    expect(['knockback', 'down']).toContain(enemy.state);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(combat.health).toBe(100);
  });

  it('an unanswered attack hurts the hero; knocked out at zero health, then back on the feet', () => {
    const { t, sim, combat, simInput, input } = setup();
    const enemy = combat.spawn('brute', 0, 0, -2.5);
    enemy.alerted = true;
    let down = false;
    let back = false;
    for (let i = 0; i < 120 * 60 && !back; i++) {
      combat.step(STEP, input);
      sim.step(STEP, simInput);
      sim.events.length = 0;
      for (const e of combat.events) {
        if (e.type === 'playerDown') down = true;
        if (e.type === 'playerBack') back = true;
      }
      combat.events.length = 0;
    }
    expect(down).toBe(true);
    expect(back).toBe(true);
    expect(combat.health).toBe(t.combat.playerHealth);
  });

  it('a Titan shockwave throws every enemy in the radius and spares the ones outside', () => {
    const { t, combat } = setup(titanMode);
    const near = combat.spawn('grunt', 3, 0, 0);
    const mid = combat.spawn('grunt', 0, 0, -8);
    const far = combat.spawn('grunt', 0, 0, -40);
    const hits = combat.shockwave(0, 0, 0, t.titan.shockRadius, t.titan.shockForce, t.titan.shockDamage);
    expect(hits).toBe(2);
    expect(near.state).toBe('knockback');
    expect(mid.state).toBe('knockback');
    expect(near.velocity.x).toBeGreaterThan(0);
    expect(mid.velocity.z).toBeLessThan(0);
    expect(far.state).toBe('idle');
    expect(near.health).toBeLessThan(mid.health);
  });

  it('Kanca: E with an enemy under the crosshair pulls it in', () => {
    const { sim, combat, simInput, input } = setup();
    const enemy = combat.spawn('grunt', 0, 0, -18);
    input.aimOrigin.set(0, 2, 4);
    input.aimDir.copy(new Vector3(0, 1, -18).sub(new Vector3(0, 2, 4)).normalize());
    input.rope = true;
    combat.step(STEP, input);
    expect(input.rope).toBe(false); // used by the pull, so the ledge launch does not also fire
    expect(enemy.state).toBe('pulled');
    expect(combat.events.some((e) => e.type === 'pull')).toBe(true);
    for (let i = 0; i < 120; i++) {
      combat.step(STEP, input);
      sim.step(STEP, simInput);
    }
    expect(enemy.position.distanceTo(sim.position)).toBeLessThan(3);
  });
});
