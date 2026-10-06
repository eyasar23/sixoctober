import { Vector3 } from 'three';
import type { CombatTuning } from '../config/tuning';
import type { CollisionWorld } from '../world/collision';

export type EnemyState =
  | 'idle'
  | 'approach'
  | 'position'
  | 'warn'
  | 'attack'
  | 'recover'
  | 'hitstun'
  | 'knockback'
  | 'down'
  | 'getup'
  | 'pulled'
  | 'ko';

export type EnemyRole = 'grunt' | 'brute';

export interface EnemyContext {
  /** Hero feet position. */
  player: Vector3;
  /** False while the hero is knocked out (enemies stop attacking). */
  playerActive: boolean;
  /** Asks for one of the limited attack slots (only a few enemies wind up at once). */
  requestAttack(enemy: Enemy): boolean;
  releaseAttack(enemy: Enemy): void;
  world: CollisionWorld | null;
  /** 0..1 */
  random(): number;
}

export type EnemyEvent =
  /** "!!": the wind-up starts (counter window opens). */
  | { type: 'warn'; enemy: Enemy }
  /** The swing; `hit` = it connected with the hero. */
  | { type: 'attack'; enemy: Enemy; hit: boolean }
  /** Out for good (lands after the knockout blow). */
  | { type: 'ko'; enemy: Enemy }
  /** Hits the ground after being launched. */
  | { type: 'thud'; enemy: Enemy };

export interface HitInfo {
  damage: number;
  /** Horizontal push, m/s. */
  pushX: number;
  pushZ: number;
  /** Upward speed when launched, m/s. */
  lift: number;
  /** Stagger time for a hit that does not launch, s. */
  stun: number;
  /** Launch into the air (finishers, counters, shockwaves). */
  launch: boolean;
}

const GRAVITY = 26;
const BODY_HALF = 0.3;
const BODY_HALF_HEIGHT = 0.9;

/**
 * One gang member: a small state machine (approach, take position, warn with "!!", attack,
 * recover; staggered, launched, down, getting up, pulled by the rope, knocked out) plus simple
 * physics against the city boxes. No rendering, so it runs in tests.
 */
export class Enemy {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** Where it was placed (idle looting spot). */
  readonly home = new Vector3();
  yaw = 0;
  state: EnemyState = 'idle';
  stateTime = 0;
  health: number;
  readonly maxHealth: number;
  /** Wakes up when the hero comes close or anyone gets hit. */
  alerted = false;
  /** Sparring dummy (tutorial): circles the hero but never attacks. */
  passive = false;
  hasToken = false;
  attackCooldown: number;
  /** Strafing direction around the hero (±1). */
  circleSide: number;
  /** 0..1, set on a hit, fades (white flash). */
  hitFlash = 0;
  /** Where a rope pull drags it to. */
  readonly pullTarget = new Vector3();
  private stunTime = 0;
  private attackHitDone = false;

  constructor(
    readonly id: number,
    readonly role: EnemyRole,
    x: number,
    y: number,
    z: number,
    private readonly tuning: CombatTuning,
    random: () => number,
  ) {
    this.position.set(x, y, z);
    this.home.set(x, y, z);
    this.maxHealth = role === 'brute' ? tuning.bruteHealth : tuning.enemyHealth;
    this.health = this.maxHealth;
    this.attackCooldown = 0.6 + random() * 1.2;
    this.circleSide = random() < 0.5 ? -1 : 1;
    this.yaw = random() * Math.PI * 2;
  }

  get alive(): boolean {
    return this.state !== 'ko';
  }

  /** Counterable: in its "!!" wind-up (or the very start of the swing). */
  get counterable(): boolean {
    return this.state === 'warn' || (this.state === 'attack' && !this.attackHitDone);
  }

  /** Busy on the ground or in the air: cannot be hit again until up (keeps juggles short). */
  get grounded(): boolean {
    return this.state === 'down' || this.state === 'ko';
  }

  step(dt: number, ctx: EnemyContext, events: EnemyEvent[]): void {
    const t = this.tuning;
    this.stateTime += dt;
    this.attackCooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    const dx = ctx.player.x - this.position.x;
    const dz = ctx.player.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const toX = distance > 1e-4 ? dx / distance : 0;
    const toZ = distance > 1e-4 ? dz / distance : 0;
    const v = this.velocity;

    switch (this.state) {
      case 'idle':
        this.brake(dt, 8);
        if (this.alerted || (ctx.playerActive && distance < t.aggroRange)) {
          this.alerted = true;
          this.setState('approach');
        }
        break;
      case 'approach': {
        if (!ctx.playerActive) {
          this.brake(dt, 6);
          break;
        }
        const speed = this.role === 'brute' ? t.enemyRunSpeed * 0.85 : t.enemyRunSpeed;
        v.x = toX * speed;
        v.z = toZ * speed;
        this.face(toX, toZ, dt, 10);
        if (distance < t.engageRange + 0.4) this.setState('position');
        break;
      }
      case 'position': {
        this.face(toX, toZ, dt, 10);
        // Hold the fighting distance and circle around the hero.
        const radial = (distance - t.engageRange) * 2.2;
        const strafe = t.enemyStrafeSpeed * this.circleSide;
        v.x = toX * radial - toZ * strafe;
        v.z = toZ * radial + toX * strafe;
        if (ctx.random() < dt * 0.25) this.circleSide = -this.circleSide;
        if (distance > t.engageRange + 3) this.setState('approach');
        else if (!this.passive && ctx.playerActive && this.attackCooldown <= 0 && ctx.requestAttack(this)) {
          this.hasToken = true;
          events.push({ type: 'warn', enemy: this });
          this.setState('warn');
        }
        break;
      }
      case 'warn':
        this.brake(dt, 10);
        this.face(toX, toZ, dt, 6);
        if (this.stateTime >= (this.role === 'brute' ? t.bruteWarnTime : t.warnTime)) {
          this.attackHitDone = false;
          this.setState('attack');
        }
        break;
      case 'attack': {
        // A short lunge, then the blow lands at 45% of the swing.
        const fx = Math.sin(this.yaw + Math.PI);
        const fz = Math.cos(this.yaw + Math.PI);
        const lunge = this.stateTime < t.attackTime * 0.5 ? t.attackLunge : 0;
        v.x = fx * lunge;
        v.z = fz * lunge;
        if (!this.attackHitDone && this.stateTime >= t.attackTime * 0.45) {
          this.attackHitDone = true;
          const facing = fx * toX + fz * toZ;
          const hit = ctx.playerActive && distance <= t.attackReach && facing > 0.2;
          events.push({ type: 'attack', enemy: this, hit });
        }
        if (this.stateTime >= t.attackTime) this.setState('recover');
        break;
      }
      case 'recover':
        this.brake(dt, 8);
        if (this.stateTime >= t.recoverTime) {
          this.dropToken(ctx);
          this.attackCooldown = t.attackCooldownMin + ctx.random() * (t.attackCooldownMax - t.attackCooldownMin);
          this.setState('position');
        }
        break;
      case 'hitstun':
        this.brake(dt, 7);
        if (this.stateTime >= this.stunTime) this.setState(distance > t.engageRange + 2 ? 'approach' : 'position');
        break;
      case 'knockback':
        // Flying: physics below; lands into 'down' (or out cold).
        break;
      case 'down':
        this.brake(dt, 9);
        if (this.stateTime >= t.downTime) this.setState('getup');
        break;
      case 'getup':
        this.brake(dt, 9);
        if (this.stateTime >= t.getupTime) {
          this.attackCooldown = Math.max(this.attackCooldown, 0.8);
          this.setState('position');
        }
        break;
      case 'pulled': {
        const px = this.pullTarget.x - this.position.x;
        const pz = this.pullTarget.z - this.position.z;
        const remaining = Math.hypot(px, pz);
        if (remaining < 0.6 || this.stateTime > 0.7) {
          v.x *= 0.2;
          v.z *= 0.2;
          this.stunTime = t.pullStun;
          this.setState('hitstun');
        } else {
          v.x = (px / remaining) * t.pullSpeed;
          v.z = (pz / remaining) * t.pullSpeed;
          v.y = Math.max(v.y, 1.5 - this.stateTime * 6);
        }
        break;
      }
      case 'ko':
        this.brake(dt, 6);
        break;
    }
    this.move(dt, ctx, events);
  }

  /** A blow from the hero (or a shockwave). Returns true when this one knocked it out. */
  takeHit(hit: HitInfo, ctx: EnemyContext): boolean {
    if (this.state === 'ko') return false;
    this.health = Math.max(0, this.health - hit.damage);
    this.hitFlash = 1;
    this.alerted = true;
    this.dropToken(ctx);
    this.velocity.x = hit.pushX;
    this.velocity.z = hit.pushZ;
    // Face the blow.
    if (Math.hypot(hit.pushX, hit.pushZ) > 0.1) this.yaw = Math.atan2(hit.pushX, hit.pushZ);
    const out = this.health <= 0;
    if (out || hit.launch) {
      this.velocity.y = Math.max(hit.lift, out ? 4 : 2);
      this.setState('knockback');
    } else {
      this.stunTime = hit.stun;
      this.setState('hitstun');
    }
    return out;
  }

  /** Kanca rope pull: flies to `target` (just in front of the hero) and is stunned on arrival. */
  pull(target: Vector3, ctx: EnemyContext): void {
    if (this.state === 'ko') return;
    this.alerted = true;
    this.dropToken(ctx);
    this.pullTarget.copy(target);
    this.velocity.y = 3;
    this.setState('pulled');
  }

  private setState(next: EnemyState): void {
    this.state = next;
    this.stateTime = 0;
  }

  private dropToken(ctx: EnemyContext): void {
    if (!this.hasToken) return;
    this.hasToken = false;
    ctx.releaseAttack(this);
  }

  private brake(dt: number, rate: number): void {
    const keep = Math.exp(-rate * dt);
    this.velocity.x *= keep;
    this.velocity.z *= keep;
  }

  /** Turns to face the direction (x, z). Same yaw convention as the hero: yaw 0 faces −Z. */
  private face(x: number, z: number, dt: number, rate: number): void {
    if (Math.abs(x) + Math.abs(z) < 1e-4) return;
    const target = Math.atan2(-x, -z);
    const delta = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += delta * (1 - Math.exp(-rate * dt));
  }

  private move(dt: number, ctx: EnemyContext, events: EnemyEvent[]): void {
    const p = this.position;
    const v = this.velocity;
    const ground = ctx.world ? ctx.world.supportHeight(p.x, p.z, BODY_HALF, BODY_HALF, p.y + 0.45) : 0;
    const airborne = p.y > ground + 0.02 || v.y > 0;
    if (airborne) v.y -= GRAVITY * dt;
    p.addScaledVector(v, dt);
    if (p.y <= ground) {
      p.y = ground;
      if (v.y < 0) v.y = 0;
      // Back on the ground after a launch (a short grace so the launch itself does not count).
      if (this.state === 'knockback' && this.stateTime > 0.08) {
        events.push({ type: 'thud', enemy: this });
        if (this.health <= 0) {
          this.setState('ko');
          events.push({ type: 'ko', enemy: this });
        } else {
          this.setState('down');
        }
      }
    }
    if (ctx.world) {
      const centre = { x: p.x, y: p.y + BODY_HALF_HEIGHT, z: p.z };
      if (ctx.world.depenetrate(centre, BODY_HALF, BODY_HALF_HEIGHT, BODY_HALF)) p.set(centre.x, centre.y - BODY_HALF_HEIGHT, centre.z);
    }
  }
}
