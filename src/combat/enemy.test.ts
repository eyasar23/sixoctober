import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { Enemy, type EnemyContext, type EnemyEvent, type EnemyState } from './enemy';

const STEP = 1 / 120;
const c = tuning.combat;

function context(player: Vector3, maxAttackers = 1): EnemyContext & { attackers: Set<Enemy> } {
  const attackers = new Set<Enemy>();
  let seed = 7;
  return {
    player,
    playerActive: true,
    attackers,
    requestAttack(enemy) {
      if (attackers.size >= maxAttackers) return false;
      attackers.add(enemy);
      return true;
    },
    releaseAttack(enemy) {
      attackers.delete(enemy);
    },
    world: null,
    random() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    },
  };
}

function run(enemies: Enemy[], ctx: EnemyContext, seconds: number, until?: (e: Enemy) => boolean): EnemyEvent[] {
  const events: EnemyEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    for (const e of enemies) e.step(STEP, ctx, events);
    if (until && enemies.some(until)) break;
  }
  return events;
}

function states(enemy: Enemy, ctx: EnemyContext, seconds: number): EnemyState[] {
  const seen: EnemyState[] = [];
  const events: EnemyEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    enemy.step(STEP, ctx, events);
    if (seen[seen.length - 1] !== enemy.state) seen.push(enemy.state);
  }
  return seen;
}

describe('enemy state machine', () => {
  it('idles until the hero comes close, then approaches, takes position, warns and attacks', () => {
    const player = new Vector3(0, 0, 0);
    const enemy = new Enemy(1, 'grunt', 0, 0, -60, c, () => 0.5);
    const ctx = context(player);
    expect(states(enemy, ctx, 0.5)).toEqual(['idle']);
    player.set(0, 0, -40); // inside the aggro range
    const seen = states(enemy, ctx, 8);
    expect(seen.slice(0, 5)).toEqual(['approach', 'position', 'warn', 'attack', 'recover']);
  });

  it('the swing connects only when the hero is in reach and in front', () => {
    const player = new Vector3(0, 0, 0);
    const near = new Enemy(1, 'grunt', 0, 0, -2.5, c, () => 0.5);
    near.alerted = true;
    const ctx = context(player);
    const events = run([near], ctx, 4, (e) => e.state === 'recover');
    const attack = events.find((e) => e.type === 'attack');
    expect(events.some((e) => e.type === 'warn')).toBe(true);
    expect(attack && attack.type === 'attack' && attack.hit).toBe(true);

    // Dodged: the hero is far away by the time the blow lands.
    const far = new Enemy(2, 'grunt', 0, 0, -2.5, c, () => 0.5);
    far.alerted = true;
    const ctx2 = context(player);
    run([far], ctx2, 4, (e) => e.state === 'warn');
    player.set(0, 0, 30);
    const late = run([far], ctx2, 1, (e) => e.state === 'recover');
    const miss = late.find((e) => e.type === 'attack');
    expect(miss && miss.type === 'attack' && miss.hit).toBe(false);

    // Out of reach overhead: the hero swings by 12 m above the enemy.
    const below = new Enemy(3, 'grunt', 0, 0, -2.5, c, () => 0.5);
    below.alerted = true;
    const ctx3 = context(new Vector3(0, 12, 0));
    const over = run([below], ctx3, 4, (e) => e.state === 'recover').find((e) => e.type === 'attack');
    expect(over && over.type === 'attack' && over.hit).toBe(false);
  });

  it('only one enemy winds up at a time', () => {
    const player = new Vector3(0, 0, 0);
    const ctx = context(player, 1);
    const gang = [0, 1, 2].map((i) => new Enemy(i, 'grunt', Math.cos(i * 2) * 3, 0, Math.sin(i * 2) * 3, c, () => 0.3));
    for (const e of gang) e.alerted = true;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      const events: EnemyEvent[] = [];
      for (const e of gang) e.step(STEP, ctx, events);
      const windingUp = gang.filter((e) => e.state === 'warn' || e.state === 'attack' || e.state === 'recover').length;
      expect(windingUp).toBeLessThanOrEqual(1);
    }
  });

  it('a hit during the wind-up staggers it and frees the attack slot', () => {
    const player = new Vector3(0, 0, 0);
    const ctx = context(player);
    const enemy = new Enemy(1, 'grunt', 0, 0, -2.8, c, () => 0.5);
    enemy.alerted = true;
    run([enemy], ctx, 4, (e) => e.state === 'warn');
    expect(enemy.state).toBe('warn');
    expect(ctx.attackers.size).toBe(1);
    const out = enemy.takeHit({ damage: 10, pushX: 0, pushZ: -2, lift: 0, stun: 0.4, launch: false }, ctx);
    expect(out).toBe(false);
    expect(enemy.state).toBe('hitstun');
    expect(ctx.attackers.size).toBe(0);
    const seen = states(enemy, ctx, 0.6);
    expect(seen).toContain('position');
  });

  it('a launching blow knocks it down; it gets up again', () => {
    const ctx = context(new Vector3(0, 0, 0));
    const enemy = new Enemy(1, 'grunt', 0, 0, -3, c, () => 0.5);
    enemy.takeHit({ damage: 10, pushX: 0, pushZ: -8, lift: 6, stun: 0, launch: true }, ctx);
    expect(enemy.state).toBe('knockback');
    const seen = states(enemy, ctx, 4);
    expect(seen.slice(0, 4)).toEqual(['knockback', 'down', 'getup', 'position']);
  });

  it('runs out of health: launched, lands, stays knocked out', () => {
    const ctx = context(new Vector3(0, 0, 0));
    const enemy = new Enemy(1, 'grunt', 0, 0, -3, c, () => 0.5);
    const out = enemy.takeHit({ damage: 999, pushX: 0, pushZ: -6, lift: 5, stun: 0, launch: false }, ctx);
    expect(out).toBe(true);
    const events = run([enemy], ctx, 3);
    expect(events.filter((e) => e.type === 'ko')).toHaveLength(1);
    expect(enemy.state).toBe('ko');
    expect(enemy.alive).toBe(false);
    // Knocked out enemies ignore further hits.
    expect(enemy.takeHit({ damage: 10, pushX: 0, pushZ: 0, lift: 0, stun: 0.3, launch: false }, ctx)).toBe(false);
  });

  it('a rope pull drags it in front of the hero and stuns it there', () => {
    const player = new Vector3(0, 0, 0);
    const ctx = context(player);
    const enemy = new Enemy(1, 'grunt', 0, 0, -20, c, () => 0.5);
    enemy.pull(new Vector3(0, 0, -1.6), ctx);
    const seen = states(enemy, ctx, 1.2);
    expect(seen.slice(0, 2)).toEqual(['pulled', 'hitstun']);
    expect(enemy.position.distanceTo(new Vector3(0, 0, -1.6))).toBeLessThan(2);
  });
});
