import { Vector3 } from 'three';
import type { Tuning } from '../config/tuning';
import { type ActionKind, type PlayerSim, yawOf } from '../player/playerSim';
import type { CollisionWorld } from '../world/collision';
import { type ComboEvent, ComboTracker, type StrikeKind } from './combo';
import { Enemy, type EnemyContext, type EnemyEvent, type EnemyRole, type HitInfo } from './enemy';

/** What the fight did this step, for effects, sound, words and the HUD. */
export type CombatEvent =
  | { type: 'strike'; kind: StrikeKind; step: number; heavy: boolean }
  | { type: 'hit'; enemy: Enemy; at: Vector3; strength: number; kind: StrikeKind | 'counter' | 'shock'; step: number; heavy: boolean; ko: boolean; final: boolean }
  | { type: 'whiff'; heavy: boolean }
  | { type: 'warn'; enemy: Enemy }
  | { type: 'counter'; enemy: Enemy }
  | { type: 'counterMiss' }
  | { type: 'pull'; enemy: Enemy }
  | { type: 'playerHurt'; damage: number; from: Enemy }
  | { type: 'playerDown' }
  | { type: 'playerBack' }
  | { type: 'enemyDown'; enemy: Enemy }
  | { type: 'enemyKO'; enemy: Enemy };

/** One fixed step of fight input (already decided from mouse and keys). */
export interface CombatInput {
  punch: boolean;
  kick: boolean;
  counter: boolean;
  /** E: rope pull when an enemy is under the crosshair (Kanca). Cleared when used. */
  rope: boolean;
  aimOrigin: Vector3;
  aimDir: Vector3;
  camForwardX: number;
  camForwardZ: number;
}

const HURT_TIME = 0.35;
const INVULNERABLE_AFTER_HIT = 0.6;
/** Share of a fight move's time at which a counter blow lands. */
const COUNTER_HIT_AT = 0.4;
const PULL_TIME = 0.45;
/** Fastest lunge into a strike, m/s: a step, not a dash. */
const MAX_LUNGE = 20;

/**
 * The fight: the hero's strike chain and counters, the gang's state machines and their attack
 * slots, hits both ways, Titan's area blows and shockwaves, the hero's health, knockout and
 * respawn. Runs inside the fixed simulation step; reports what happened in `events`.
 */
export class CombatSystem {
  readonly enemies: Enemy[] = [];
  readonly events: CombatEvent[] = [];
  health: number;
  /** Hits landed in the current chain, for the HUD (resets when the chain drops). */
  comboCount = 0;
  /** The enemy the last strike aimed at (HUD marker). */
  target: Enemy | null = null;
  private readonly combo: ComboTracker;
  private readonly comboEvents: ComboEvent[] = [];
  private readonly enemyEvents: EnemyEvent[] = [];
  private readonly attackers = new Set<Enemy>();
  private readonly context: EnemyContext;
  private readonly hitPoint = new Vector3();
  private readonly tmp = new Vector3();
  private sinceHurt = 99;
  private invulnerable = 0;
  private counterLock = 0;
  private counterEnemy: Enemy | null = null;
  private counterTimer = -1;
  private pullEnemy: Enemy | null = null;
  private downTimer = -1;
  private comboDrop = 0;
  private seed = 12345;
  private nextId = 1;

  constructor(
    private readonly tuning: Tuning,
    private readonly sim: PlayerSim,
    world: CollisionWorld | null,
  ) {
    this.health = tuning.combat.playerHealth;
    this.combo = new ComboTracker(tuning.combat);
    this.context = {
      player: sim.position,
      playerActive: true,
      requestAttack: (enemy) => {
        if (this.attackers.size >= this.tuning.combat.maxAttackers) return false;
        this.attackers.add(enemy);
        return true;
      },
      releaseAttack: (enemy) => {
        this.attackers.delete(enemy);
      },
      world,
      random: () => this.random(),
    };
  }

  get playerDown(): boolean {
    return this.downTimer >= 0;
  }

  /** Enemies still standing (health left). */
  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.health > 0) n++;
    return n;
  }

  /** 0..1: how much of a fight is going on around the hero (camera framing, music later). */
  get intensity(): number {
    let best = 0;
    for (const e of this.enemies) {
      if (e.health <= 0 || !e.alerted) continue;
      const d = e.position.distanceTo(this.sim.position);
      best = Math.max(best, 1 - Math.min(Math.max((d - 6) / 14, 0), 1));
    }
    return best;
  }

  spawn(role: EnemyRole, x: number, y: number, z: number): Enemy {
    const enemy = new Enemy(this.nextId++, role, x, y, z, this.tuning.combat, () => this.random());
    this.enemies.push(enemy);
    return enemy;
  }

  remove(enemy: Enemy): void {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    this.attackers.delete(enemy);
    if (this.target === enemy) this.target = null;
    if (this.pullEnemy === enemy) this.pullEnemy = null;
    if (this.counterEnemy === enemy) this.counterEnemy = null;
  }

  /** Removes every enemy. */
  clear(): void {
    this.enemies.length = 0;
    this.attackers.clear();
    this.target = null;
    this.pullEnemy = null;
    this.counterEnemy = null;
  }

  step(dt: number, input: CombatInput): void {
    const c = this.tuning.combat;
    const sim = this.sim;
    const heavy = sim.mode.strikes === 'heavy';
    this.combo.timeScale = heavy ? c.heavyTimeScale : 1;
    this.sinceHurt += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.counterLock = Math.max(0, this.counterLock - dt);

    // Knocked out: wait, then back on the feet nearby with full health.
    if (this.downTimer >= 0) {
      this.downTimer += dt;
      this.combo.cancel();
      if (this.downTimer >= c.respawnDelay) {
        this.downTimer = -1;
        this.health = c.playerHealth;
        this.invulnerable = 1.5;
        sim.respawn();
        this.events.push({ type: 'playerBack' });
      }
    } else {
      if (this.sinceHurt > c.regenDelay) this.health = Math.min(c.playerHealth, this.health + c.regenRate * dt);
      this.handleCounter(input);
      if (input.rope && sim.abilities.ledgeLaunch && this.tryRopePull(input)) input.rope = false;
      if ((input.punch || input.kick) && this.canStrike(input)) this.combo.press(input.kick ? 'kick' : 'punch');
    }

    // The strike chain.
    this.comboEvents.length = 0;
    this.combo.update(dt, this.comboEvents);
    for (const e of this.comboEvents) {
      if (e.type === 'start') this.startStrike(e.kind, e.step, e.duration, input, heavy);
      else if (e.type === 'hit') this.strikeHits(e.kind, e.step, heavy);
    }
    if (this.combo.step === 0) {
      this.comboDrop += dt;
      if (this.comboDrop > 1.2) this.comboCount = 0;
    } else {
      this.comboDrop = 0;
    }

    // A counter lands partway through the dash.
    if (this.counterEnemy && this.counterTimer >= 0) {
      this.counterTimer += dt;
      if (this.counterTimer >= c.counterTime * COUNTER_HIT_AT) {
        const enemy = this.counterEnemy;
        this.counterEnemy = null;
        this.counterTimer = -1;
        this.land(enemy, 'counter', 3, heavy, c.counterDamage, c.finisherKnockback * 1.2, c.finisherLift * 1.2, true);
      }
    }
    if (this.pullEnemy && this.pullEnemy.state !== 'pulled') this.pullEnemy = null;

    // The gang.
    this.context.playerActive = this.downTimer < 0;
    this.enemyEvents.length = 0;
    for (const enemy of this.enemies) enemy.step(dt, this.context, this.enemyEvents);
    this.separate();
    for (const e of this.enemyEvents) {
      switch (e.type) {
        case 'warn':
          this.events.push({ type: 'warn', enemy: e.enemy });
          break;
        case 'attack':
          if (e.hit) this.hurtPlayer(e.enemy);
          break;
        case 'ko':
          this.events.push({ type: 'enemyKO', enemy: e.enemy });
          break;
        case 'thud':
          if (e.enemy.health > 0) this.events.push({ type: 'enemyDown', enemy: e.enemy });
          break;
      }
    }
  }

  /** Titan shockwave: everyone in the radius is thrown away from the centre and hurt (falls off with distance). */
  shockwave(x: number, y: number, z: number, radius: number, force: number, damage: number): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const dx = enemy.position.x - x;
      const dz = enemy.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius || Math.abs(enemy.position.y - y) > 4) continue;
      const falloff = 1 - (d / radius) * 0.6;
      const nx = d > 0.1 ? dx / d : 1;
      const nz = d > 0.1 ? dz / d : 0;
      const ko = enemy.takeHit({ damage: damage * falloff, pushX: nx * force * falloff, pushZ: nz * force * falloff, lift: 5 + 4 * falloff, stun: 0, launch: true }, this.context);
      this.hitPoint.copy(enemy.position).setY(enemy.position.y + 1.1);
      this.events.push({ type: 'hit', enemy, at: this.hitPoint.clone(), strength: falloff, kind: 'shock', step: 3, heavy: true, ko, final: ko && this.aliveCount === 0 });
      count++;
    }
    return count;
  }

  private handleCounter(input: CombatInput): void {
    if (!input.counter || this.counterLock > 0) return;
    const c = this.tuning.combat;
    let best: Enemy | null = null;
    let bestDistance = c.counterRange;
    for (const enemy of this.enemies) {
      if (!enemy.counterable) continue;
      const d = enemy.position.distanceTo(this.sim.position);
      if (d < bestDistance) {
        best = enemy;
        bestDistance = d;
      }
    }
    if (!best) {
      this.counterLock = c.counterMissLock;
      this.events.push({ type: 'counterMiss' });
      return;
    }
    // Dash in front of the enemy and strike; invulnerable while doing it.
    const dx = best.position.x - this.sim.position.x;
    const dz = best.position.z - this.sim.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    const speed = lungeSpeed(Math.max(0, d - 1.2), c.counterTime * COUNTER_HIT_AT, c.counterTime);
    this.startAction('counter', c.counterTime, (dx / d) * speed, (dz / d) * speed, yawOf(dx, dz), 3);
    this.combo.cancel();
    this.counterEnemy = best;
    this.counterTimer = 0;
    this.invulnerable = Math.max(this.invulnerable, c.counterTime + 0.2);
    this.counterLock = c.counterTime;
    this.events.push({ type: 'counter', enemy: best });
  }

  /**
   * Strikes start from the ground (or a ledge, or mid-fight); in the air only with an enemy in
   * lunge range, so a stray click never ends a swing.
   */
  private canStrike(input: CombatInput): boolean {
    const s = this.sim.state;
    if (s === 'grounded' || s === 'landing' || s === 'action' || s === 'perch') return true;
    if (s === 'airborne' || s === 'swinging' || s === 'dive') return this.pickTarget(input) !== null;
    return false;
  }

  /** The enemy the rope would pull (Kanca, E): alive, in range, near the crosshair. */
  enemyUnderAim(aimOrigin: Vector3, aimDir: Vector3): Enemy | null {
    const c = this.tuning.combat;
    const cosLimit = Math.cos((c.pullAngle * Math.PI) / 180);
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.state === 'knockback' || enemy.state === 'pulled') continue;
      const d = enemy.position.distanceTo(this.sim.position);
      if (d > c.pullRange || d < 2.2) continue;
      this.tmp.copy(enemy.position).setY(enemy.position.y + 1).sub(aimOrigin).normalize();
      const dot = this.tmp.dot(aimDir);
      if (dot < cosLimit) continue;
      if (dot > bestScore) {
        bestScore = dot;
        best = enemy;
      }
    }
    return best;
  }

  /** Kanca: the rope yanks the enemy under the crosshair to the hero. */
  private tryRopePull(input: CombatInput): boolean {
    const best = this.enemyUnderAim(input.aimOrigin, input.aimDir);
    if (!best) return false;
    const dx = best.position.x - this.sim.position.x;
    const dz = best.position.z - this.sim.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    this.tmp.set(this.sim.position.x + (dx / d) * 1.6, best.position.y, this.sim.position.z + (dz / d) * 1.6);
    best.pull(this.tmp, this.context);
    this.pullEnemy = best;
    this.target = best;
    this.startAction('pull', PULL_TIME, 0, 0, yawOf(dx, dz), 1);
    this.events.push({ type: 'pull', enemy: best });
    return true;
  }

  /** The enemy being pulled right now (the rope is drawn to it). */
  get pulling(): Enemy | null {
    return this.pullEnemy;
  }

  private startStrike(kind: StrikeKind, step: number, duration: number, input: CombatInput, heavy: boolean): void {
    const c = this.tuning.combat;
    const target = this.pickTarget(input);
    this.target = target;
    let dirX = input.camForwardX;
    let dirZ = input.camForwardZ;
    let speed = 0;
    if (target) {
      const dx = target.position.x - this.sim.position.x;
      const dz = target.position.z - this.sim.position.z;
      const d = Math.max(Math.hypot(dx, dz), 1e-3);
      dirX = dx / d;
      dirZ = dz / d;
      speed = lungeSpeed(Math.max(0, d - c.reach * 0.7), duration * c.hitAt, duration);
    } else {
      speed = c.lungeSpeed * 0.3;
    }
    if (!this.startAction(kind, duration, dirX * speed, dirZ * speed, yawOf(dirX, dirZ), step)) {
      this.combo.cancel();
      return;
    }
    this.events.push({ type: 'strike', kind, step, heavy });
  }

  private strikeHits(kind: StrikeKind, step: number, heavy: boolean): void {
    const c = this.tuning.combat;
    const sim = this.sim;
    const reach = c.reach + (kind === 'kick' ? 0.3 : 0) + (heavy ? 0.35 : 0);
    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    // The blow lands on the nearest enemy in front, within reach.
    let primary: Enemy | null = null;
    let best = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.grounded) continue;
      const dx = enemy.position.x - sim.position.x;
      const dz = enemy.position.z - sim.position.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(enemy.position.y - sim.position.y) > 1.8) continue;
      const front = d > 0.2 ? (dx * fx + dz * fz) / d : 1;
      if (front < 0.25) continue;
      const score = d - front;
      if (score < best) {
        best = score;
        primary = enemy;
      }
    }
    if (!primary) {
      this.events.push({ type: 'whiff', heavy });
      return;
    }
    const base = step === 3 ? c.finisherDamage : kind === 'punch' ? c.punchDamage : c.kickDamage;
    const damage = base * (heavy ? c.heavyDamageScale : 1);
    const push = (step === 3 ? c.finisherKnockback : c.knockback) * (heavy ? c.heavyKnockbackScale : 1);
    const lift = step === 3 ? c.finisherLift * (heavy ? 1.3 : 1) : 0;
    this.land(primary, kind, step, heavy, damage, push, lift, step === 3);
    if (heavy) {
      // Titan: everyone close to the blow takes part of it.
      for (const enemy of this.enemies) {
        if (enemy === primary || enemy.health <= 0 || enemy.grounded) continue;
        if (enemy.position.distanceTo(primary.position) > c.heavyArea) continue;
        this.land(enemy, kind, step, heavy, damage * 0.5, push * 0.8, lift * 0.6, step === 3);
      }
    }
  }

  /** Applies one blow from the hero to an enemy and reports it. */
  private land(enemy: Enemy, kind: StrikeKind | 'counter', step: number, heavy: boolean, damage: number, push: number, lift: number, launch: boolean): void {
    const c = this.tuning.combat;
    const dx = enemy.position.x - this.sim.position.x;
    const dz = enemy.position.z - this.sim.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    const hit: HitInfo = {
      damage,
      pushX: (dx / d) * push,
      pushZ: (dz / d) * push,
      lift,
      stun: c.hitstunTime * (kind === 'kick' ? 1.15 : 1),
      launch,
    };
    const ko = enemy.takeHit(hit, this.context);
    this.comboCount++;
    const strength = Math.min(1, (step === 3 ? 0.75 : 0.35) + (heavy ? 0.25 : 0) + (kind === 'counter' ? 0.25 : 0) + (ko ? 0.3 : 0));
    this.hitPoint.set(enemy.position.x - (dx / d) * 0.3, enemy.position.y + 1.25, enemy.position.z - (dz / d) * 0.3);
    this.events.push({ type: 'hit', enemy, at: this.hitPoint.clone(), strength, kind, step, heavy, ko, final: ko && this.aliveCount === 0 });
  }

  private hurtPlayer(from: Enemy): void {
    const c = this.tuning.combat;
    if (this.invulnerable > 0 || this.downTimer >= 0) return;
    const damage = from.role === 'brute' ? c.bruteDamage : c.enemyDamage;
    this.health = Math.max(0, this.health - damage);
    this.sinceHurt = 0;
    this.invulnerable = INVULNERABLE_AFTER_HIT;
    this.combo.cancel();
    this.events.push({ type: 'playerHurt', damage, from });
    const dx = this.sim.position.x - from.position.x;
    const dz = this.sim.position.z - from.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    if (this.health <= 0) {
      this.sim.knockOut();
      this.sim.velocity.set((dx / d) * 6, 4, (dz / d) * 6);
      this.downTimer = 0;
      this.events.push({ type: 'playerDown' });
      return;
    }
    this.startAction('hurt', HURT_TIME, (dx / d) * 6, (dz / d) * 6, yawOf(-dx, -dz), 1);
  }

  private startAction(kind: ActionKind, duration: number, vx: number, vz: number, yaw: number, step: number): boolean {
    return this.sim.startAction({ kind, duration, vx, vz, yaw, step });
  }

  /** The best enemy to swing at: close, roughly where the camera looks, not on the ground. */
  private pickTarget(input: CombatInput): Enemy | null {
    const c = this.tuning.combat;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.grounded || enemy.state === 'knockback') continue;
      const dx = enemy.position.x - this.sim.position.x;
      const dz = enemy.position.z - this.sim.position.z;
      const d = Math.hypot(dx, dz);
      if (d > c.lungeRange || Math.abs(enemy.position.y - this.sim.position.y) > 2.5) continue;
      const dot = d > 0.1 ? (dx * input.camForwardX + dz * input.camForwardZ) / d : 1;
      if (d > 2.6 && dot < 0.3) continue;
      const score = d + (1 - dot) * 3;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  /** Enemies keep a little room from each other and from the hero. */
  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.state === 'ko' || a.state === 'knockback') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.state === 'ko' || b.state === 'knockback') continue;
        pushApart(a.position, b.position, 0.9);
      }
      const hx = a.position.x - this.sim.position.x;
      const hz = a.position.z - this.sim.position.z;
      const d = Math.hypot(hx, hz);
      if (d < 0.85 && d > 1e-4 && Math.abs(a.position.y - this.sim.position.y) < 1.5) {
        a.position.x += (hx / d) * (0.85 - d);
        a.position.z += (hz / d) * (0.85 - d);
      }
    }
  }

  private random(): number {
    this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
    return this.seed / 2147483648;
  }
}

/**
 * Starting lunge speed so the hero covers `distance` by `hitTime` while the lunge fades out
 * quadratically over `duration` (see PlayerSim's action state). Capped so it stays a step, not a teleport.
 */
function lungeSpeed(distance: number, hitTime: number, duration: number): number {
  const p = Math.min(hitTime / duration, 1);
  const covered = (duration * (1 - (1 - p) ** 3)) / 3;
  return Math.min(distance / Math.max(covered, 1e-3), MAX_LUNGE);
}

function pushApart(a: Vector3, b: Vector3, minDistance: number): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d >= minDistance || d < 1e-4) return;
  const push = (minDistance - d) / 2;
  a.x -= (dx / d) * push;
  a.z -= (dz / d) * push;
  b.x += (dx / d) * push;
  b.z += (dz / d) * push;
}
