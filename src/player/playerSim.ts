import { MathUtils, Vector3 } from 'three';
import { KMH, type MovementTuning, type Tuning } from '../config/tuning';
import type { ModeDefinition, MovementAbilities } from '../modes/modeBand';
import { CLIMBABLE, type Box, type CollisionWorld, createHit } from '../world/collision';
import { createAnchorResult, createLedgeTarget, createZipTarget, findAnchor, findLedge, findZipTarget } from './grapple';
import { type BodyShape, createContacts, moveAndSlide, probeGround, probeWall, SKIN } from './mover';

const DEG = Math.PI / 180;
/** Ground acceleration curve: punchy start, soft arrival at top speed. */
const ACCEL_CURVE = 0.6;
/** Keeps the time to reach top speed equal to the tuned accel time despite the curve. */
const ACCEL_CURVE_GAIN = Math.atanh(Math.sqrt(ACCEL_CURVE)) / Math.sqrt(ACCEL_CURVE);
const DIVE_BUFFER = 0.12;
const LAUNCH_BUFFER = 0.12;
const SAFE_POINT_INTERVAL = 1;
const MAX_SAFE_POINTS = 10;

export type MoveState =
  | 'grounded'
  | 'airborne'
  | 'swinging'
  | 'zip'
  | 'wallRun'
  | 'wallClimb'
  | 'mantle'
  | 'dive'
  | 'landing'
  /** Crouched on a ledge after a look-and-launch (E). */
  | 'perch'
  /** Titan: crouched, charging a super jump (Space held). */
  | 'charge'
  /** Titan: ground pound, a short hang then the slam. */
  | 'pound'
  /** A fight move (strike, counter, rope pull, being hit): the combat system drives it. */
  | 'action'
  /** Knocked out: lies still until the combat system respawns the hero. */
  | 'down';

export type LandingKind = 'soft' | 'crouch' | 'roll' | 'hero';

export type ActionKind = 'punch' | 'kick' | 'counter' | 'pull' | 'hurt';

/** A fight move as the combat system orders it; the body lunges and the lunge fades out. */
export interface ActionSpec {
  kind: ActionKind;
  duration: number;
  /** Lunge velocity at the start, m/s. */
  vx: number;
  vz: number;
  /** Facing during the move. */
  yaw: number;
  /** Combo step 1–3 (picks the pose). */
  step: number;
}

/** One simulation step's input, already turned into world space by the camera. */
export interface SimInput {
  /** Camera-relative WASD direction on the ground plane, length 0..1. */
  moveX: number;
  moveZ: number;
  /** Raw axes: forward = W − S, right = D − A. */
  forward: number;
  right: number;
  /** Camera look direction on the ground plane (unit). */
  camForwardX: number;
  camForwardZ: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  shiftHeld: boolean;
  divePressed: boolean;
  /** E: launch onto the ledge under the crosshair. */
  launchPressed: boolean;
  respawnPressed: boolean;
  /** Camera position and full 3D look direction, for zip and ledge aiming. */
  readonly aimOrigin: Vector3;
  readonly aimDir: Vector3;
}

export function createSimInput(): SimInput {
  return {
    moveX: 0,
    moveZ: 0,
    forward: 0,
    right: 0,
    camForwardX: 0,
    camForwardZ: -1,
    jumpPressed: false,
    jumpHeld: false,
    shiftHeld: false,
    divePressed: false,
    launchPressed: false,
    respawnPressed: false,
    aimOrigin: new Vector3(),
    aimDir: new Vector3(0, 0, -1),
  };
}

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land'; kind: LandingKind; impact: number }
  | { type: 'ropeAttach' }
  | { type: 'ropeRelease'; boosted: boolean; speed: number }
  | { type: 'noAnchor' }
  | { type: 'zipStart' }
  | { type: 'zipArrive' }
  | { type: 'wallRunStart' }
  | { type: 'wallJump' }
  | { type: 'climbStart' }
  | { type: 'mantle' }
  | { type: 'diveStart' }
  | { type: 'nearMiss' }
  | { type: 'ledgeLaunch' }
  | { type: 'noLedge' }
  | { type: 'perch' }
  | { type: 'perchLeap' }
  | { type: 'chargeStart' }
  | { type: 'superJump'; charge: number }
  | { type: 'poundStart' }
  /** Titan impact: pushes and hurts what is around (enemies, cars). */
  | { type: 'shockwave'; x: number; y: number; z: number; radius: number; force: number; damage: number; pound: boolean }
  | { type: 'respawn' };

/**
 * The hero's movement: a state machine on a fixed time step. No rendering here, so it runs
 * in tests. Position is at the feet; yaw 0 faces −Z.
 */
export class PlayerSim {
  state: MoveState = 'grounded';
  /** Movement values in use: tuning.movement with the mode's replacements (refreshed every step). */
  readonly mv: MovementTuning;
  /** Seconds in the current state. */
  stateTime = 0;
  readonly position = new Vector3();
  readonly previousPosition = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  onGround = true;
  sprinting = false;
  landingKind: LandingKind = 'soft';
  readonly shape: BodyShape;

  /**
   * `anchor` is where the rope is drawn to; `pivot` is the point the swing physics turns around
   * (the anchor pulled toward the line of travel, see rope.swingPlaneAssist).
   */
  readonly rope = {
    active: false,
    anchor: new Vector3(),
    pivot: new Vector3(),
    length: 0,
    targetLength: 0,
    taut: false,
    side: 0,
    /** Sideways axis of the swing (right of the travel direction at attach). */
    rightX: 1,
    rightZ: 0,
  };
  readonly zip = createZipTarget();
  /** What the current zip is: a crosshair zip or a ledge launch (ends perched). */
  zipKind: 'zip' | 'ledge' = 'zip';
  /** The ledge being launched to / perched on. */
  readonly ledge = createLedgeTarget();
  /** Titan charge, 0..1 (also while not charging: the last charge). */
  charge = 0;
  /** The fight move in progress (state 'action'). */
  readonly action: ActionSpec = { kind: 'punch', duration: 0, vx: 0, vz: 0, yaw: 0, step: 1 };
  readonly wallNormal = new Vector3();
  wallBox: Box | null = null;
  /** Things that happened since the renderer last emptied this list. */
  readonly events: SimEvent[] = [];

  private readonly contacts = createContacts();
  private readonly preMoveVelocity = new Vector3();
  private readonly hit = createHit();
  private readonly anchor = createAnchorResult();
  private readonly zipFound = createZipTarget();
  private readonly ledgeFound = createLedgeTarget();
  private readonly tmp = new Vector3();
  private readonly spawnPoint = new Vector3();
  private spawnYaw = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private diveBufferTimer = 0;
  private launchBufferTimer = 0;
  private launchCooldown = 0;
  private mantleToPerch = false;
  private poundSlam = false;
  private jumpCutArmed = false;
  private airTime = 0;
  private timeSinceRelease = 99;
  private chainPending = false;
  private lastAnchorSide = 0;
  private noAnchorReported = false;
  private zipCooldown = 0;
  private zipSpeedNow = 0;
  private zipDuration = 0;
  private readonly wallRunDir = new Vector3();
  private wallRunSpeedNow = 0;
  private wallRunCooldown = 0;
  private sameWallTimer = 0;
  /** The wall just left (normal and plane position): not grabbed again for a moment. */
  private sameWallPlane = 0;
  private sameWallNx = 0;
  private sameWallNz = 0;
  private climbPushTime = 0;
  private landingDuration = 0;
  private readonly mantleFrom = new Vector3();
  private readonly mantleTo = new Vector3();
  private readonly mantleExit = new Vector3();
  private mantleDuration = 0.3;
  private nearMissTimer = 0;
  private readonly safePoints: Vector3[] = [];
  private safeTimer = 0;

  constructor(
    private readonly world: CollisionWorld,
    readonly tuning: Tuning,
    private modeDef: ModeDefinition,
    /** Half size of the playable square, m. */
    private readonly bounds: number,
  ) {
    this.shape = { halfWidth: tuning.movement.bodyRadius, halfHeight: tuning.movement.bodyHeight / 2 };
    this.mv = { ...tuning.movement };
    this.refreshMovement();
  }

  get mode(): ModeDefinition {
    return this.modeDef;
  }

  get abilities(): MovementAbilities {
    return this.modeDef.abilities;
  }

  /**
   * Switches the mode mid-move. Velocity is never touched: momentum carries through, and a move
   * the new mode cannot do turns into a fall (a swing lets go of the rope; a dive becomes a
   * ground pound when the new mode has one).
   */
  setMode(mode: ModeDefinition): void {
    this.modeDef = mode;
    this.refreshMovement();
    const a = mode.abilities;
    switch (this.state) {
      case 'swinging':
        if (!a.swing) {
          this.detachRope(false);
          this.timeSinceRelease = 0;
          this.airTime = 0;
          this.setState('airborne');
        }
        break;
      case 'zip':
        if ((this.zipKind === 'zip' && !a.zip) || (this.zipKind === 'ledge' && !a.ledgeLaunch)) this.setState('airborne');
        break;
      case 'wallRun':
        if (!a.wallRun) {
          this.markSameWall();
          this.setState('airborne');
        }
        break;
      case 'wallClimb':
        if (!a.wallClimb) this.setState('airborne');
        break;
      case 'dive':
        if (!a.dive) {
          if (a.groundPound) this.startPound(true);
          else this.setState('airborne');
        }
        break;
      case 'pound':
        if (!a.groundPound) this.setState('airborne');
        break;
      case 'charge':
        if (!a.chargedJump) this.setState('grounded');
        break;
      default:
        break;
    }
  }

  /** Starts a fight move (from the combat system). Returns false when the body is busy. */
  startAction(spec: ActionSpec): boolean {
    if (!canAct(this.state) && !(spec.kind === 'hurt' && this.state !== 'down')) return false;
    Object.assign(this.action, spec);
    if (this.state === 'swinging') this.detachRope(false);
    this.velocity.x = spec.vx;
    this.velocity.z = spec.vz;
    this.yaw = spec.yaw;
    this.setState('action');
    return true;
  }

  /** Puts the hero crouched on a ledge facing out along (nx, nz) (title screen, tutorial start). */
  perchAt(x: number, y: number, z: number, nx: number, nz: number): void {
    this.tmp.set(x, y, z);
    this.resetAt(this.tmp, yawOf(nx, nz));
    this.ledge.perch.set(x, y, z);
    this.ledge.point.set(x, y, z);
    this.ledge.normal.set(nx, 0, nz);
    this.setState('perch');
  }

  /** Knocked out: the hero drops and lies still until respawnAt(). */
  knockOut(): void {
    this.detachRope(false);
    this.setState('down');
  }

  /** Back on the feet at a point (respawn after a knockout). */
  respawnAt(x: number, y: number, z: number, yaw: number): void {
    this.tmp.set(x, y, z);
    this.resetAt(this.tmp, yaw);
    this.events.push({ type: 'respawn' });
  }

  get speed(): number {
    return this.velocity.length();
  }

  /** Side of the last rope anchor (−1 left, 1 right): anchor previews alternate the same way. */
  get lastSide(): number {
    return this.lastAnchorSide;
  }

  get zipReady(): boolean {
    return this.zipCooldown <= 0;
  }

  /** 0..1, how much of the zip cooldown has passed. */
  get zipCharge(): number {
    return 1 - this.zipCooldown / Math.max(this.tuning.rope.zipCooldown, 1e-3);
  }

  spawn(x: number, y: number, z: number, yaw: number): void {
    this.spawnPoint.set(x, y, z);
    this.spawnYaw = yaw;
    this.safePoints.length = 0;
    this.resetAt(this.spawnPoint, yaw);
  }

  /** Rope point on the body. */
  bobPoint(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + this.tuning.rope.bobHeight, this.position.z);
  }

  step(dt: number, input: SimInput): void {
    this.previousPosition.copy(this.position);
    this.refreshMovement();
    this.tickTimers(dt, input);
    if (input.respawnPressed) {
      this.respawn();
      return;
    }
    // A state may hand over to another without moving; then the new state runs this step.
    for (let pass = 0; pass < 3; pass++) {
      const before = this.state;
      if (this.update(dt, input) || this.state === before) break;
    }
    this.stateTime += dt;
    this.afterStep(dt);
  }

  respawn(): void {
    const point = this.safePoints[this.safePoints.length - 1] ?? this.spawnPoint;
    this.resetAt(point, this.spawnYaw);
    this.events.push({ type: 'respawn' });
  }

  // ---------------------------------------------------------------------------------------
  // State updates. Each returns true when it moved the body this step.

  private update(dt: number, input: SimInput): boolean {
    // E: launch onto the ledge under the crosshair, from almost any move.
    if (this.launchBufferTimer > 0 && canLaunch(this.state) && this.abilities.ledgeLaunch && this.launchCooldown <= 0) {
      this.launchBufferTimer = 0;
      if (this.tryLedgeLaunch(input)) return false;
    }
    switch (this.state) {
      case 'grounded':
        return this.updateGrounded(dt, input);
      case 'landing':
        return this.updateLanding(dt, input);
      case 'airborne':
        return this.updateAirborne(dt, input);
      case 'swinging':
        return this.updateSwinging(dt, input);
      case 'zip':
        return this.updateZip(dt);
      case 'dive':
        return this.updateDive(dt, input);
      case 'wallRun':
        return this.updateWallRun(dt, input);
      case 'wallClimb':
        return this.updateWallClimb(dt, input);
      case 'mantle':
        return this.updateMantle(dt);
      case 'perch':
        return this.updatePerch(dt, input);
      case 'charge':
        return this.updateCharge(dt, input);
      case 'pound':
        return this.updatePound(dt);
      case 'action':
        return this.updateAction(dt);
      case 'down':
        return this.updateDown(dt);
    }
  }

  private updateGrounded(dt: number, input: SimInput): boolean {
    const m = this.mv;
    if (this.jumpBufferTimer > 0) {
      if (this.abilities.chargedJump) this.startCharge();
      else this.jump();
      return false;
    }
    const wishLength = Math.min(Math.hypot(input.moveX, input.moveZ), 1);
    this.sprinting = this.abilities.sprint && input.shiftHeld && wishLength > 0.1;
    const target = (this.sprinting ? m.sprintSpeed : m.runSpeed) * KMH * wishLength;
    this.groundAccelerate(dt, input, wishLength, target, m.turnGrip);
    this.velocity.y = 0;
    this.moveBody(dt, m.stepHeight);
    if (!this.onGround && !this.snapDown(m.stepHeight + 0.1)) {
      this.coyoteTimer = m.coyoteTime;
      this.setState('airborne');
      return true;
    }
    // Pushing into a wall for a moment starts a climb (or a vault over a low ledge).
    const c = this.contacts;
    if (c.wall && c.wallBox && this.abilities.wallClimb && wishLength > 0.1) {
      const into = -(input.moveX * c.wallNx + input.moveZ * c.wallNz) / wishLength;
      if (into > 0.7) {
        this.climbPushTime += dt;
        if (this.climbPushTime >= m.climbStartDelay && this.startClimb(c.wallNx, c.wallNz, c.wallBox)) return true;
      } else {
        this.climbPushTime = 0;
      }
    } else {
      this.climbPushTime = 0;
    }
    this.faceVelocity(dt, 14);
    return true;
  }

  private updateLanding(dt: number, input: SimInput): boolean {
    const m = this.mv;
    const locked = this.landingKind === 'hero' && this.stateTime < m.heroLandCancel;
    if (!locked && this.jumpBufferTimer > 0) {
      if (this.abilities.chargedJump) this.startCharge();
      else this.jump();
      return false;
    }
    const wishLength = Math.min(Math.hypot(input.moveX, input.moveZ), 1);
    if (locked) {
      const keep = Math.exp(-14 * dt);
      this.velocity.x *= keep;
      this.velocity.z *= keep;
    } else if (this.landingKind === 'roll') {
      // A roll keeps its momentum and only steers gently.
      const current = Math.hypot(this.velocity.x, this.velocity.z);
      this.groundAccelerate(dt, input, wishLength, Math.max(current, m.runSpeed * KMH * wishLength), 3);
    } else {
      this.groundAccelerate(dt, input, wishLength, m.runSpeed * KMH * wishLength, m.turnGrip);
    }
    this.velocity.y = 0;
    this.moveBody(dt, m.stepHeight);
    if (!this.onGround && !this.snapDown(m.stepHeight + 0.1)) {
      this.coyoteTimer = m.coyoteTime;
      this.setState('airborne');
      return true;
    }
    const cancelled = this.landingKind === 'hero' && !locked && wishLength > 0.1;
    if (this.stateTime >= this.landingDuration || cancelled) this.setState('grounded');
    if (this.landingKind !== 'hero') this.faceVelocity(dt, 10);
    return true;
  }

  private updateAirborne(dt: number, input: SimInput): boolean {
    const m = this.mv;
    this.airTime += dt;
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) this.jump();
    if (this.jumpCutArmed) {
      if (!input.jumpHeld && this.velocity.y > 0) {
        this.velocity.y *= m.jumpCut;
        this.jumpCutArmed = false;
      } else if (this.velocity.y <= 0) {
        this.jumpCutArmed = false;
      }
    }
    if (this.diveBufferTimer > 0) {
      if (this.abilities.dive) {
        this.startDive();
        return false;
      }
      if (this.abilities.groundPound && this.heightAboveGround() >= this.tuning.titan.poundMinHeight) {
        this.startPound(false);
        return false;
      }
    }
    if (this.jumpBufferTimer > 0 && this.abilities.zip && this.zipCooldown <= 0 && this.tryZip(input)) return false;
    if (input.shiftHeld && this.abilities.swing && this.readyToAttach() && this.tryAttach(input)) return false;

    this.airAccelerate(dt, input);
    const gravity = this.velocity.y < 0 ? m.gravity * m.fallGravityMult : m.gravity;
    this.applyGravity(dt, gravity, m.maxFallSpeed * KMH);
    this.applyDrag(dt, m.airDrag);
    this.capSpeed(m.topSpeed * KMH);
    this.moveBody(dt, 0);
    if (this.handleAirContacts(input, false)) return true;
    this.checkNearMiss();
    this.faceVelocity(dt, 8);
    return true;
  }

  private updateSwinging(dt: number, input: SimInput): boolean {
    const m = this.mv;
    const r = this.tuning.rope;
    if (!input.shiftHeld) {
      this.releaseRope(true);
      return false;
    }
    if (this.jumpBufferTimer > 0) {
      if (this.abilities.zip && this.zipCooldown <= 0 && this.tryZip(input)) return false;
      // No zip target: let go with a hop.
      this.jumpBufferTimer = 0;
      this.releaseRope(false);
      this.velocity.y = Math.max(this.velocity.y, 0) + r.ropeJumpUp;
      this.events.push({ type: 'jump' });
      return false;
    }
    if (this.diveBufferTimer > 0 && this.abilities.dive) {
      this.releaseRope(false);
      this.startDive();
      return false;
    }

    const rope = this.rope;
    if (rope.length > rope.targetLength) rope.length = Math.max(rope.targetLength, rope.length - r.reelSpeed * dt);

    const v = this.velocity;
    const pivot = rope.pivot;
    const bob = this.bobPoint(this.tmp);
    let nx = bob.x - pivot.x;
    let ny = bob.y - pivot.y;
    let nz = bob.z - pivot.z;
    const distance = Math.hypot(nx, ny, nz);
    if (distance > 1e-6) {
      nx /= distance;
      ny /= distance;
      nz /= distance;
    }

    v.y -= m.gravity * r.swingGravityMult * dt;
    // Pumping: WASD pushes along the swing (the part of the input perpendicular to the rope).
    const wn = input.moveX * nx + input.moveZ * nz;
    v.x += (input.moveX - nx * wn) * r.pumpAccel * dt;
    v.y += -ny * wn * r.pumpAccel * dt;
    v.z += (input.moveZ - nz * wn) * r.pumpAccel * dt;
    // Assist at the bottom of the arc so long chains keep their speed.
    const radial = v.x * nx + v.y * ny + v.z * nz;
    const tx = v.x - nx * radial;
    const ty = v.y - ny * radial;
    const tz = v.z - nz * radial;
    const tangential = Math.hypot(tx, ty, tz);
    if (tangential > 1 && r.swingAssist > 0) {
      const bottom = MathUtils.clamp(-ny, 0, 1);
      const push = (r.swingAssist * bottom * bottom * dt) / tangential;
      v.x += tx * push;
      v.y += ty * push;
      v.z += tz * push;
    }
    // Without A/D, sideways drift fades so the swing follows the street.
    if (Math.abs(input.right) < 0.1 && r.lateralDamping > 0) {
      const sideways = v.x * rope.rightX + v.z * rope.rightZ;
      const k = 1 - Math.exp(-r.lateralDamping * dt);
      v.x -= rope.rightX * sideways * k;
      v.z -= rope.rightZ * sideways * k;
    }
    this.applyDrag(dt, m.airDrag);
    this.capSpeed(m.topSpeed * KMH);

    const startX = this.position.x;
    const startY = this.position.y;
    const startZ = this.position.z;
    this.moveBody(dt, 0);

    // Inextensible rope: when it would stretch, pull the body back onto the rope's sphere and
    // derive the velocity from the corrected positions (position-based dynamics, never adds energy).
    const after = this.bobPoint(this.tmp);
    const dx = after.x - pivot.x;
    const dy = after.y - pivot.y;
    const dz = after.z - pivot.z;
    const length = Math.hypot(dx, dy, dz);
    rope.taut = length >= rope.length - 0.05;
    if (length > rope.length && length > 1e-6) {
      const k = (length - rope.length) / length;
      this.position.x -= dx * k;
      this.position.y -= dy * k;
      this.position.z -= dz * k;
      this.depenetrate();
      v.set((this.position.x - startX) / dt, (this.position.y - startY) / dt, (this.position.z - startZ) / dt);
      this.capSpeed(m.topSpeed * KMH);
    }

    if (this.contacts.ground && this.preMoveVelocity.y <= 0) {
      this.land(-this.preMoveVelocity.y, false);
      return true;
    }
    const c = this.contacts;
    if (c.wall && c.wallBox && this.tryWallContact(input, c.wallNx, c.wallNz, c.wallBox)) return true;
    if (r.autoChain && this.shouldAutoRelease()) {
      this.releaseRope(true);
      this.chainPending = true;
      return true;
    }
    this.checkNearMiss();
    this.faceVelocity(dt, 6);
    return true;
  }

  private updateZip(dt: number): boolean {
    const z = this.zip;
    const dir = this.tmp.subVectors(z.destination, this.position);
    const remaining = dir.length();
    if (remaining < 0.6) {
      this.arriveZip();
      return true;
    }
    dir.divideScalar(remaining);
    this.velocity.copy(dir).multiplyScalar(this.zipSpeedNow);
    const stepLength = this.zipSpeedNow * dt;
    if (stepLength >= remaining) this.velocity.multiplyScalar(remaining / stepLength);
    this.moveBody(dt, 0);
    if (this.position.distanceTo(z.destination) < 0.6) {
      this.arriveZip();
      return true;
    }
    const blocked = this.contacts.wall || this.contacts.ceiling || this.contacts.ground;
    if (this.zipKind === 'ledge' && (blocked || this.stateTime > this.zipDuration) && this.position.distanceTo(z.destination) < 4) {
      this.arriveZip();
      return true;
    }
    if (blocked || this.stateTime > this.zipDuration) {
      // Something was in the way: stop the zip and keep whatever momentum is left.
      this.zipCooldown = this.tuning.rope.zipCooldown;
      this.setState('airborne');
      return true;
    }
    this.faceVelocity(dt, 20);
    return true;
  }

  private updateDive(dt: number, input: SimInput): boolean {
    const m = this.mv;
    if (this.diveBufferTimer > 0 && this.stateTime > 0.1) {
      // C again ends the dive.
      this.diveBufferTimer = 0;
      this.setState('airborne');
      return false;
    }
    if (this.jumpBufferTimer > 0 && this.abilities.zip && this.zipCooldown <= 0 && this.tryZip(input)) return false;
    if (input.shiftHeld && this.abilities.swing && this.stateTime >= m.diveMinTime && this.tryAttach(input)) return false;

    // WASD bends the dive without adding speed.
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed > 1 && Math.hypot(input.moveX, input.moveZ) > 0.1) {
      const heading = Math.atan2(v.x, v.z);
      const wanted = Math.atan2(input.moveX, input.moveZ);
      const turn = MathUtils.clamp(wrapAngle(wanted - heading), -m.diveSteerRate * dt, m.diveSteerRate * dt);
      const next = heading + turn;
      v.x = Math.sin(next) * speed;
      v.z = Math.cos(next) * speed;
    }
    this.applyGravity(dt, m.gravity * m.diveGravityMult, m.diveMaxFallSpeed * KMH);
    this.applyDrag(dt, m.airDrag * 0.5);
    this.capSpeed(m.topSpeed * KMH);
    this.moveBody(dt, 0);
    if (this.handleAirContacts(input, true)) return true;
    this.checkNearMiss();
    this.faceVelocity(dt, 6);
    return true;
  }

  private updateWallRun(dt: number, input: SimInput): boolean {
    const m = this.mv;
    const n = this.wallNormal;
    if (this.jumpBufferTimer > 0) {
      this.wallJump(this.wallRunDir.x * this.wallRunSpeedNow * m.wallJumpKeep, this.wallRunDir.z * this.wallRunSpeedNow * m.wallJumpKeep, m.wallJumpOut, m.wallJumpUp);
      return false;
    }
    if (!input.shiftHeld || this.stateTime >= m.wallRunMaxTime) {
      this.leaveWall(2.5);
      return false;
    }
    this.wallRunSpeedNow = Math.max(m.wallRunSpeed * KMH, this.wallRunSpeedNow - m.wallRunDecel * KMH * dt);
    this.velocity.y -= m.gravity * m.wallRunGravityMult * dt;
    this.velocity.x = this.wallRunDir.x * this.wallRunSpeedNow - n.x * 1.5;
    this.velocity.z = this.wallRunDir.z * this.wallRunSpeedNow - n.z * 1.5;
    this.moveBody(dt, 0);
    if (this.onGround) {
      this.land(-this.preMoveVelocity.y, false);
      return true;
    }
    const c = this.contacts;
    if (c.wall && c.wallBox && (c.wallNx !== n.x || c.wallNz !== n.z)) {
      // Ran into an inside corner: climb the new wall or drop off.
      if (!this.tryWallContact(input, c.wallNx, c.wallNz, c.wallBox)) this.leaveWall(1);
      return true;
    }
    const box = this.wallBox;
    if (!probeWall(this.world, this.position, this.shape, -n.x, -n.z, 0.35, this.hit) || (box && this.position.y > box.maxY)) {
      // Past the end of the wall (or over its top): fly on.
      this.markSameWall();
      this.setState('airborne');
      return true;
    }
    this.wallBox = this.hit.box;
    this.yaw = yawOf(this.wallRunDir.x, this.wallRunDir.z);
    return true;
  }

  private updateWallClimb(dt: number, input: SimInput): boolean {
    const m = this.mv;
    const n = this.wallNormal;
    // Sideways axis along the wall, matching the camera's right.
    let sideX = n.z;
    let sideZ = -n.x;
    if (sideX * -input.camForwardZ + sideZ * input.camForwardX < 0) {
      sideX = -sideX;
      sideZ = -sideZ;
    }
    if (this.jumpBufferTimer > 0) {
      const lateral = input.right * 6;
      this.wallJump(sideX * lateral, sideZ * lateral, m.climbJumpOut, m.climbJumpUp);
      return false;
    }
    const climb = (input.shiftHeld ? m.climbSprintSpeed : m.climbSpeed) * KMH;
    const side = m.climbSideSpeed * KMH * input.right;
    this.velocity.set(sideX * side - n.x, input.forward * climb, sideZ * side - n.z);
    this.moveBody(dt, 0);

    const box = this.wallBox;
    if (box && input.forward > 0.1 && this.position.y + m.mantleReach >= box.maxY && this.startMantle(n.x, n.z, box)) return true;
    if (this.onGround && input.forward < -0.1) {
      this.setState('grounded');
      return true;
    }
    if (!probeWall(this.world, this.position, this.shape, -n.x, -n.z, 0.35, this.hit)) {
      this.setState('airborne');
      return true;
    }
    this.wallBox = this.hit.box;
    this.yaw = Math.atan2(n.x, n.z);
    return true;
  }

  private updateMantle(dt: number): boolean {
    const t = Math.min((this.stateTime + dt) / Math.max(this.mantleDuration, 1e-3), 1);
    const rise = MathUtils.smoothstep(t, 0, 0.6);
    const forward = MathUtils.smoothstep(t, 0.45, 1);
    this.position.set(
      MathUtils.lerp(this.mantleFrom.x, this.mantleTo.x, forward),
      MathUtils.lerp(this.mantleFrom.y, this.mantleTo.y, rise),
      MathUtils.lerp(this.mantleFrom.z, this.mantleTo.z, forward),
    );
    if (t >= 1) {
      this.position.copy(this.mantleTo);
      this.velocity.copy(this.mantleExit);
      this.onGround = true;
      if (this.mantleToPerch) {
        this.yaw = yawOf(this.ledge.normal.x, this.ledge.normal.z);
        this.events.push({ type: 'perch' });
        this.setState('perch');
      } else {
        this.depenetrate();
        this.setState('grounded');
      }
    }
    return true;
  }

  private updatePerch(dt: number, input: SimInput): boolean {
    const r = this.tuning.rope;
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    if (this.jumpBufferTimer > 0) {
      // Leap off the ledge along the camera, ready for a swing.
      this.jumpBufferTimer = 0;
      const n = this.ledge.normal;
      this.velocity.set(
        input.camForwardX * r.perchLeapForward + n.x * 2,
        Math.sqrt(2 * this.mv.gravity * r.perchLeapHeight),
        input.camForwardZ * r.perchLeapForward + n.z * 2,
      );
      this.airTime = 0;
      this.jumpCutArmed = false;
      this.events.push({ type: 'perchLeap' });
      this.setState('airborne');
      return false;
    }
    if (this.diveBufferTimer > 0 && this.abilities.dive) {
      this.velocity.set(input.camForwardX * 9, -2, input.camForwardZ * 9);
      this.startDive();
      return false;
    }
    if (Math.hypot(input.moveX, input.moveZ) > 0.1) {
      this.setState('grounded');
      return false;
    }
    const target = yawOf(this.ledge.normal.x, this.ledge.normal.z);
    this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-10 * dt));
    return true;
  }

  private startCharge(): void {
    this.jumpBufferTimer = 0;
    this.charge = 0;
    this.events.push({ type: 'chargeStart' });
    this.setState('charge');
  }

  /** Titan: crouched and slow while Space is held; letting go launches the super jump. */
  private updateCharge(dt: number, input: SimInput): boolean {
    const ti = this.tuning.titan;
    this.charge = Math.min(1, this.charge + dt / Math.max(ti.chargeTime, 0.05));
    const wishLength = Math.min(Math.hypot(input.moveX, input.moveZ), 1);
    this.groundAccelerate(dt, input, wishLength, ti.chargeWalkSpeed * KMH * wishLength, this.mv.turnGrip);
    this.velocity.y = 0;
    this.moveBody(dt, this.mv.stepHeight);
    if (!this.onGround && !this.snapDown(this.mv.stepHeight + 0.1)) {
      this.coyoteTimer = this.mv.coyoteTime;
      this.setState('airborne');
      return true;
    }
    // Face where the camera looks: that is where the jump goes.
    const target = yawOf(input.camForwardX, input.camForwardZ);
    this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-12 * dt));
    if (!input.jumpHeld) this.superJump(input);
    return true;
  }

  private superJump(input: SimInput): void {
    const ti = this.tuning.titan;
    const c = this.charge;
    const height = MathUtils.lerp(ti.superJumpMin, ti.superJumpMax, c ** 1.3);
    this.velocity.y = Math.sqrt(2 * this.mv.gravity * height);
    this.velocity.x += input.camForwardX * ti.superJumpForward * c;
    this.velocity.z += input.camForwardZ * ti.superJumpForward * c;
    this.jumpCutArmed = false;
    this.airTime = 0;
    this.events.push({ type: 'superJump', charge: c });
    this.setState('airborne');
  }

  /** Titan ground pound. `slamNow` skips the hang (a dive turned into a pound by a mode switch). */
  private startPound(slamNow: boolean): void {
    this.diveBufferTimer = 0;
    this.chainPending = false;
    this.poundSlam = slamNow;
    this.events.push({ type: 'poundStart' });
    this.setState('pound');
  }

  private updatePound(dt: number): boolean {
    const ti = this.tuning.titan;
    const v = this.velocity;
    if (!this.poundSlam && this.stateTime < ti.poundHang) {
      // Hang: the air goes still for a beat (anticipation), a little lift.
      const keep = Math.exp(-12 * dt);
      v.x *= keep;
      v.z *= keep;
      v.y = MathUtils.lerp(v.y, 2, 1 - Math.exp(-14 * dt));
    } else {
      this.poundSlam = true;
      const keep = Math.exp(-1.5 * dt);
      v.x *= keep;
      v.z *= keep;
      v.y = -ti.poundSpeed;
    }
    this.moveBody(dt, 0);
    if (this.onGround && this.preMoveVelocity.y <= 0) {
      this.land(-this.preMoveVelocity.y, true);
      return true;
    }
    return true;
  }

  /** A fight move: the lunge fades out; gravity still pulls in the air. */
  private updateAction(dt: number): boolean {
    const a = this.action;
    const p = Math.min(this.stateTime / Math.max(a.duration, 1e-3), 1);
    const fade = (1 - p) * (1 - p);
    const v = this.velocity;
    v.x = a.vx * fade;
    v.z = a.vz * fade;
    const grounded = this.onGround;
    if (grounded) v.y = 0;
    else this.applyGravity(dt, this.mv.gravity, this.mv.maxFallSpeed * KMH);
    this.moveBody(dt, grounded ? this.mv.stepHeight : 0);
    if (grounded && !this.onGround) this.snapDown(this.mv.stepHeight + 0.1);
    this.yaw += wrapAngle(a.yaw - this.yaw) * (1 - Math.exp(-25 * dt));
    if (this.stateTime + dt >= a.duration) {
      this.setState(this.onGround ? 'grounded' : 'airborne');
    }
    return true;
  }

  private updateDown(dt: number): boolean {
    const v = this.velocity;
    const keep = Math.exp(-6 * dt);
    v.x *= keep;
    v.z *= keep;
    if (this.onGround) v.y = 0;
    else this.applyGravity(dt, this.mv.gravity, this.mv.maxFallSpeed * KMH);
    this.moveBody(dt, 0);
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Transitions

  private jump(): void {
    const m = this.mv;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.velocity.y = Math.sqrt(2 * m.gravity * m.jumpHeight);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.sprinting && speed > 1) {
      const boost = (m.sprintJumpBoost * KMH) / speed;
      this.velocity.x += this.velocity.x * boost;
      this.velocity.z += this.velocity.z * boost;
    }
    this.jumpCutArmed = true;
    this.airTime = 0;
    this.events.push({ type: 'jump' });
    this.setState('airborne');
  }

  private readyToAttach(): boolean {
    const r = this.tuning.rope;
    if (this.chainPending) return this.timeSinceRelease >= r.reattachDelay && this.velocity.y <= r.reattachMaxRise;
    return this.airTime >= r.minAirTime;
  }

  private tryAttach(input: SimInput): boolean {
    const r = this.tuning.rope;
    const bob = this.bobPoint(this.tmp);
    if (!findAnchor(this.world, bob, this.velocity, input.camForwardX, input.camForwardZ, this.lastAnchorSide, r, this.anchor)) {
      if (!this.noAnchorReported) {
        this.noAnchorReported = true;
        this.events.push({ type: 'noAnchor' });
      }
      return false;
    }
    const rope = this.rope;
    rope.active = true;
    rope.anchor.copy(this.anchor.point);
    // Pivot: the anchor moved sideways toward the vertical plane of travel.
    let dirX = this.velocity.x;
    let dirZ = this.velocity.z;
    let dirLength = Math.hypot(dirX, dirZ);
    if (dirLength < 3) {
      dirX = input.camForwardX;
      dirZ = input.camForwardZ;
      dirLength = Math.hypot(dirX, dirZ) || 1;
    }
    const rightX = -dirZ / dirLength;
    const rightZ = dirX / dirLength;
    const lateral = (rope.anchor.x - bob.x) * rightX + (rope.anchor.z - bob.z) * rightZ;
    const assist = MathUtils.clamp(r.swingPlaneAssist, 0, 1);
    rope.pivot.set(rope.anchor.x - rightX * lateral * assist, rope.anchor.y, rope.anchor.z - rightZ * lateral * assist);
    rope.rightX = rightX;
    rope.rightZ = rightZ;
    rope.length = bob.distanceTo(rope.pivot);
    rope.targetLength = Math.min(rope.length, this.anchor.maxLength);
    rope.side = this.anchor.side;
    rope.taut = false;
    this.lastAnchorSide = this.anchor.side;
    this.chainPending = false;
    this.noAnchorReported = false;
    this.jumpCutArmed = false;
    this.events.push({ type: 'ropeAttach' });
    this.setState('swinging');
    return true;
  }

  private shouldAutoRelease(): boolean {
    const r = this.tuning.rope;
    if (this.stateTime < r.minSwingTime) return false;
    const bob = this.bobPoint(this.tmp);
    const dx = bob.x - this.rope.pivot.x;
    const dy = bob.y - this.rope.pivot.y;
    const dz = bob.z - this.rope.pivot.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-3) return false;
    const angle = Math.acos(MathUtils.clamp(-dy / length, -1, 1)) / DEG;
    if (angle > 100) return true;
    const v = this.velocity;
    const pastBottom = dx * v.x + dz * v.z > 0;
    return pastBottom && v.y > 0 && angle >= r.autoReleaseAngle;
  }

  private releaseRope(boost: boolean): void {
    const r = this.tuning.rope;
    const v = this.velocity;
    if (boost) {
      const speedH = Math.hypot(v.x, v.z);
      if (speedH > 1) {
        const add = (r.releaseForwardBoost * KMH) / speedH;
        v.x += v.x * add;
        v.z += v.z * add;
      }
      const speed = v.length();
      const rising = speed > 1 ? MathUtils.clamp(v.y / speed, 0, 1) : 0;
      v.y += r.releaseUpBoost * (0.4 + 0.6 * rising);
      this.capSpeed(this.mv.topSpeed * KMH);
    }
    this.detachRope(boost);
    this.timeSinceRelease = 0;
    this.airTime = 0;
    this.setState('airborne');
  }

  /**
   * Lets go of the rope and reports it, whatever the reason (Shift released, landing, a wall,
   * a zip, a mode switch), so the rope never stays drawn to the building.
   */
  private detachRope(boosted: boolean): void {
    if (!this.rope.active) return;
    this.rope.active = false;
    this.events.push({ type: 'ropeRelease', boosted, speed: this.velocity.length() });
  }

  private tryZip(input: SimInput): boolean {
    const r = this.tuning.rope;
    if (!findZipTarget(this.world, input.aimOrigin, input.aimDir, this.position, r, this.shape.halfWidth, this.zipFound)) {
      return false;
    }
    const z = this.zip;
    z.destination.copy(this.zipFound.destination);
    z.attach.copy(this.zipFound.attach);
    z.normal.copy(this.zipFound.normal);
    z.perch = this.zipFound.perch;
    z.box = this.zipFound.box;
    const dir = this.tmp.subVectors(z.destination, this.position);
    const distance = dir.length();
    dir.divideScalar(Math.max(distance, 1e-6));
    this.zipSpeedNow = Math.max(r.zipSpeed * KMH, this.velocity.dot(dir));
    this.zipDuration = distance / this.zipSpeedNow + 0.4;
    this.jumpBufferTimer = 0;
    this.chainPending = false;
    this.detachRope(false);
    this.zipKind = 'zip';
    this.events.push({ type: 'zipStart' });
    this.setState('zip');
    return true;
  }

  /** E: rope onto the ledge under the crosshair. Pulls to just outside the edge, then hops on. */
  private tryLedgeLaunch(input: SimInput): boolean {
    const r = this.tuning.rope;
    const found = this.ledgeFound;
    if (!findLedge(this.world, input.aimOrigin, input.aimDir, this.position, r, this.shape.halfWidth, this.shape.halfHeight, found)) {
      this.events.push({ type: 'noLedge' });
      return false;
    }
    const l = this.ledge;
    l.point.copy(found.point);
    l.perch.copy(found.perch);
    l.approach.copy(found.approach);
    l.normal.copy(found.normal);
    l.edgeA.copy(found.edgeA);
    l.edgeB.copy(found.edgeB);
    l.box = found.box;
    const z = this.zip;
    z.destination.copy(l.approach);
    z.attach.copy(l.point);
    z.normal.copy(l.normal);
    z.perch = true;
    z.box = l.box;
    const dir = this.tmp.subVectors(z.destination, this.position);
    const distance = dir.length();
    dir.divideScalar(Math.max(distance, 1e-6));
    this.zipSpeedNow = Math.max(r.launchSpeed * KMH, this.velocity.dot(dir));
    this.zipDuration = distance / this.zipSpeedNow + 0.5;
    this.jumpBufferTimer = 0;
    this.chainPending = false;
    this.detachRope(false);
    this.zipKind = 'ledge';
    this.events.push({ type: 'zipStart' }, { type: 'ledgeLaunch' });
    this.setState('zip');
    return true;
  }

  private arriveZip(): void {
    const r = this.tuning.rope;
    const z = this.zip;
    this.events.push({ type: 'zipArrive' });
    if (this.zipKind === 'ledge') {
      // A short hop from the end of the pull onto the ledge, then crouch there.
      this.launchCooldown = r.launchCooldown;
      this.startHop(this.ledge.perch, r.perchHopTime, true);
      return;
    }
    this.zipCooldown = r.zipCooldown;
    if (z.perch) {
      // Pop over the edge onto the roof, carrying some of the zip's speed.
      let hx = this.velocity.x;
      let hz = this.velocity.z;
      if (z.normal.y < 0.5) {
        hx = -z.normal.x;
        hz = -z.normal.z;
      }
      const length = Math.hypot(hx, hz);
      const keep = Math.max(this.zipSpeedNow * r.zipPerchKeep, 6);
      if (length > 1e-3) this.velocity.set((hx / length) * keep, 4, (hz / length) * keep);
      else this.velocity.set(0, 4, 0);
      this.setState('airborne');
      return;
    }
    if (z.box && this.abilities.wallClimb) {
      this.snapToWall(z.normal.x, z.normal.z, 1.5);
      if (this.startClimb(z.normal.x, z.normal.z, z.box)) return;
    }
    this.setState('airborne');
  }

  /** Moves the body against the wall with outward normal (nx, nz), if one is within reach. */
  private snapToWall(nx: number, nz: number, reach: number): void {
    const hy = this.shape.halfHeight;
    const hx = this.shape.halfWidth;
    const p = this.position;
    if (this.world.sweep(p.x, p.y + hy, p.z, hx, hy, hx, -nx * reach, 0, -nz * reach, this.hit) && this.hit.ny === 0) {
      const travel = Math.max(this.hit.t * reach - SKIN, 0);
      p.x -= nx * travel;
      p.z -= nz * travel;
    }
  }

  private startDive(): void {
    this.diveBufferTimer = 0;
    this.chainPending = false;
    this.velocity.y = Math.min(this.velocity.y, -3);
    this.events.push({ type: 'diveStart' });
    this.setState('dive');
  }

  /** Air states touching ground or a wall. Returns true when the state changed. */
  private handleAirContacts(input: SimInput, fromDive: boolean): boolean {
    if (this.onGround && this.preMoveVelocity.y <= 0) {
      this.land(-this.preMoveVelocity.y, fromDive);
      return true;
    }
    const c = this.contacts;
    if (c.wall && c.wallBox) return this.tryWallContact(input, c.wallNx, c.wallNz, c.wallBox);
    return false;
  }

  /** Decides what touching a wall in the air means: mantle, wall run, climb or nothing. */
  private tryWallContact(input: SimInput, nx: number, nz: number, box: Box): boolean {
    const m = this.mv;
    if ((box.flags & CLIMBABLE) === 0) return false;
    const v = this.preMoveVelocity;
    const speed = Math.hypot(v.x, v.z);
    const into = speed > 1e-3 ? -(v.x * nx + v.z * nz) / speed : 0;
    const wishLength = Math.hypot(input.moveX, input.moveZ);
    const pushing = wishLength > 0.1 ? -(input.moveX * nx + input.moveZ * nz) / wishLength : 0;
    const ledge = box.maxY - this.position.y;

    if (ledge > -0.1 && ledge <= m.mantleReach && (pushing > 0.3 || into > 0.3)) return this.startMantle(nx, nz, box);
    const sameWall =
      this.sameWallTimer > 0 && nx === this.sameWallNx && nz === this.sameWallNz && Math.abs(wallPlane(box, nx, nz) - this.sameWallPlane) < 1;
    if (sameWall) return false;

    const angle = Math.asin(MathUtils.clamp(into, 0, 1)) / DEG;
    if (
      this.abilities.wallRun &&
      input.shiftHeld &&
      this.wallRunCooldown <= 0 &&
      speed >= m.wallRunMinSpeed * KMH &&
      angle <= m.wallRunMaxAngle &&
      ledge > 2.5 &&
      this.heightAboveGround() >= m.wallRunMinHeight
    ) {
      this.startWallRun(nx, nz, box);
      return true;
    }
    if (this.abilities.wallClimb && ledge > m.mantleReach && (pushing > 0.5 || (input.shiftHeld && into > 0.5))) {
      return this.startClimb(nx, nz, box);
    }
    return false;
  }

  private startWallRun(nx: number, nz: number, box: Box): void {
    const m = this.mv;
    const v = this.preMoveVelocity;
    const dn = v.x * nx + v.z * nz;
    const alongX = v.x - nx * dn;
    const alongZ = v.z - nz * dn;
    const along = Math.hypot(alongX, alongZ);
    this.wallNormal.set(nx, 0, nz);
    this.wallBox = box;
    this.wallRunDir.set(alongX / along, 0, alongZ / along);
    this.wallRunSpeedNow = Math.max(m.wallRunSpeed * KMH, along);
    this.velocity.y = Math.max(m.wallRunUpBoost, v.y * 0.25);
    this.chainPending = false;
    this.events.push({ type: 'wallRunStart' });
    this.setState('wallRun');
  }

  private startClimb(nx: number, nz: number, box: Box): boolean {
    const m = this.mv;
    if ((box.flags & CLIMBABLE) === 0) return false;
    if (box.maxY - this.position.y <= m.mantleReach) return this.startMantle(nx, nz, box);
    this.wallNormal.set(nx, 0, nz);
    this.wallBox = box;
    this.velocity.set(0, 0, 0);
    this.chainPending = false;
    this.climbPushTime = 0;
    this.events.push({ type: 'climbStart' });
    this.setState('wallClimb');
    return true;
  }

  private startMantle(nx: number, nz: number, box: Box): boolean {
    const m = this.mv;
    const r = this.shape.halfWidth;
    const toX = this.position.x - nx * (r + 0.45);
    const toZ = this.position.z - nz * (r + 0.45);
    const toY = box.maxY + SKIN * 2;
    if (this.world.overlaps(toX, toY + this.shape.halfHeight + 0.01, toZ, r, this.shape.halfHeight, r)) return false;
    const keep = Math.max(m.mantleExitSpeed * KMH, Math.hypot(this.velocity.x, this.velocity.z) * 0.5);
    this.tmp.set(toX, toY, toZ);
    this.startHop(this.tmp, m.mantleTime, false);
    this.mantleExit.set(-nx * keep, 0, -nz * keep);
    this.yaw = Math.atan2(nx, nz);
    this.events.push({ type: 'mantle' });
    return true;
  }

  /** Up and over onto `to` in `duration` (mantles, and the hop onto a perch). */
  private startHop(to: Vector3, duration: number, toPerch: boolean): void {
    this.mantleFrom.copy(this.position);
    this.mantleTo.copy(to);
    this.mantleExit.set(0, 0, 0);
    this.mantleDuration = duration;
    this.mantleToPerch = toPerch;
    this.velocity.set(0, 0, 0);
    this.setState('mantle');
  }

  private wallJump(keepX: number, keepZ: number, out: number, up: number): void {
    const n = this.wallNormal;
    this.velocity.set(n.x * out + keepX, up, n.z * out + keepZ);
    this.markSameWall();
    this.jumpBufferTimer = 0;
    this.jumpCutArmed = false;
    this.wallRunCooldown = 0.15;
    this.airTime = 0;
    this.events.push({ type: 'wallJump' });
    this.setState('airborne');
  }

  private leaveWall(push: number): void {
    this.velocity.x += this.wallNormal.x * push;
    this.velocity.z += this.wallNormal.z * push;
    this.markSameWall();
    this.wallRunCooldown = 0.2;
    this.setState('airborne');
  }

  private markSameWall(): void {
    this.sameWallTimer = 0.6;
    this.sameWallNx = this.wallNormal.x;
    this.sameWallNz = this.wallNormal.z;
    this.sameWallPlane = this.wallBox ? wallPlane(this.wallBox, this.wallNormal.x, this.wallNormal.z) : NaN;
  }

  private land(impact: number, fromDive: boolean): void {
    const m = this.mv;
    const v = this.velocity;
    v.y = 0;
    const speed = Math.hypot(v.x, v.z);
    let kind: LandingKind = 'soft';
    const heroThreshold = fromDive ? m.heroLandSpeedDive : m.heroLandSpeed;
    if (impact >= heroThreshold && (fromDive || speed < m.heroMaxRunSpeed * KMH)) kind = 'hero';
    else if (impact >= m.softLandSpeed) kind = speed >= m.rollMinSpeed * KMH ? 'roll' : 'crouch';
    if (kind === 'hero') {
      v.x *= m.heroLandKeep;
      v.z *= m.heroLandKeep;
      this.landingDuration = m.heroLandTime;
    } else if (kind === 'roll') {
      v.x *= m.rollKeep;
      v.z *= m.rollKeep;
      this.landingDuration = m.rollTime;
    } else if (kind === 'crouch') {
      v.x *= 0.6;
      v.z *= 0.6;
      this.landingDuration = m.crouchTime;
    }
    this.landingKind = kind;
    this.chainPending = false;
    this.onGround = true;
    this.events.push({ type: 'land', kind, impact });
    const ti = this.tuning.titan;
    if (this.state === 'pound') {
      this.events.push({ type: 'shockwave', x: this.position.x, y: this.position.y, z: this.position.z, radius: ti.shockRadius, force: ti.shockForce, damage: ti.shockDamage, pound: true });
    } else if (this.abilities.groundPound && impact >= ti.landShockImpact) {
      // A heavy body landing hard: a smaller shockwave of its own.
      const share = Math.min(impact / (ti.landShockImpact * 2.5), 1) * 0.6;
      this.events.push({
        type: 'shockwave',
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        radius: ti.shockRadius * share,
        force: ti.shockForce * share,
        damage: ti.shockDamage * share * 0.5,
        pound: false,
      });
    }
    this.setState(kind === 'soft' ? 'grounded' : 'landing');
  }

  private setState(next: MoveState): void {
    if (next !== 'swinging') this.detachRope(false);
    if (next !== 'grounded') this.sprinting = false;
    this.state = next;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------------------------------
  // Physics helpers

  private groundAccelerate(dt: number, input: SimInput, wishLength: number, target: number, grip: number): void {
    const m = this.mv;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    const runSpeed = m.runSpeed * KMH;
    if (wishLength > 0.05) {
      const length = Math.hypot(input.moveX, input.moveZ);
      const wx = input.moveX / length;
      const wz = input.moveZ / length;
      // Turning keeps the speed but lags behind the input; grip drops at high speed (slight slide).
      const k = Math.min(dt * grip * MathUtils.clamp(runSpeed / Math.max(speed, 1e-3), 0.35, 1), 1);
      v.x -= (v.x - wx * speed) * k;
      v.z -= (v.z - wz * speed) * k;
      const current = Math.hypot(v.x, v.z);
      let next: number;
      if (current < target) {
        const base = current < runSpeed ? runSpeed / m.runAccelTime : ((m.sprintSpeed - m.runSpeed) * KMH) / m.sprintAccelTime;
        const ratio = current / target;
        next = Math.min(target, current + base * ACCEL_CURVE_GAIN * (1 - ACCEL_CURVE * ratio * ratio) * dt);
      } else {
        next = Math.max(target, current - m.overspeedDecel * KMH * dt);
      }
      if (current > 1e-4) {
        v.x *= next / current;
        v.z *= next / current;
      } else {
        v.x = wx * next;
        v.z = wz * next;
      }
    } else if (speed > 0) {
      const decel = Math.max(runSpeed / m.brakeTime, m.overspeedDecel * KMH);
      const next = Math.max(0, speed - decel * dt);
      v.x *= next / speed;
      v.z *= next / speed;
    }
  }

  /** Air steering: redirects momentum but never adds speed beyond max(current, run speed). */
  private airAccelerate(dt: number, input: SimInput): void {
    const m = this.mv;
    if (Math.hypot(input.moveX, input.moveZ) < 0.05) return;
    const v = this.velocity;
    const before = Math.hypot(v.x, v.z);
    v.x += input.moveX * m.airControl * dt;
    v.z += input.moveZ * m.airControl * dt;
    const cap = Math.max(before, m.runSpeed * KMH);
    const after = Math.hypot(v.x, v.z);
    if (after > cap) {
      v.x *= cap / after;
      v.z *= cap / after;
    }
  }

  private applyGravity(dt: number, gravity: number, maxFall: number): void {
    this.velocity.y = Math.max(this.velocity.y - gravity * dt, -maxFall);
  }

  private applyDrag(dt: number, drag: number): void {
    const speed = this.velocity.length();
    if (speed > 1e-4) this.velocity.multiplyScalar(Math.max(0, 1 - drag * speed * dt));
  }

  private capSpeed(max: number): void {
    const speed = this.velocity.length();
    if (speed > max) this.velocity.multiplyScalar(max / speed);
  }

  private moveBody(dt: number, stepHeight: number): void {
    this.preMoveVelocity.copy(this.velocity);
    moveAndSlide(this.world, this.position, this.velocity, dt, this.shape, stepHeight, this.contacts);
    if (this.velocity.y > 0.01) this.onGround = false;
    else this.onGround = this.contacts.ground || probeGround(this.world, this.position, this.shape, 0.05) >= 0;
  }

  private snapDown(maxDistance: number): boolean {
    const distance = probeGround(this.world, this.position, this.shape, maxDistance);
    if (distance < 0) return false;
    this.position.y -= Math.max(0, distance - SKIN);
    this.onGround = true;
    return true;
  }

  private depenetrate(): void {
    const hy = this.shape.halfHeight;
    const centre = { x: this.position.x, y: this.position.y + hy, z: this.position.z };
    if (this.world.depenetrate(centre, this.shape.halfWidth, hy, this.shape.halfWidth)) {
      this.position.set(centre.x, centre.y - hy, centre.z);
    }
  }

  private heightAboveGround(): number {
    const r = this.shape.halfWidth;
    return this.position.y - this.world.supportHeight(this.position.x, this.position.z, r, r, this.position.y + 0.01);
  }

  /** Passing close to a wall at speed: a small boost (creative addition, tunable). */
  private checkNearMiss(): void {
    const m = this.mv;
    if (m.nearMissBoost <= 0 || this.nearMissTimer > 0) return;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed < m.nearMissMinSpeed * KMH) return;
    const sideX = -v.z / speed;
    const sideZ = v.x / speed;
    for (let sign = 1; sign >= -1; sign -= 2) {
      if (probeWall(this.world, this.position, this.shape, sideX * sign, sideZ * sign, m.nearMissDistance, this.hit)) {
        const add = (m.nearMissBoost * KMH) / speed;
        v.x += v.x * add;
        v.z += v.z * add;
        this.capSpeed(m.topSpeed * KMH);
        this.nearMissTimer = 1.2;
        this.events.push({ type: 'nearMiss' });
        return;
      }
    }
  }

  private faceVelocity(dt: number, rate: number): void {
    const v = this.velocity;
    if (Math.hypot(v.x, v.z) < 0.5) return;
    const target = yawOf(v.x, v.z);
    this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-rate * dt));
  }

  private tickTimers(dt: number, input: SimInput): void {
    const m = this.mv;
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.diveBufferTimer = Math.max(0, this.diveBufferTimer - dt);
    if (input.jumpPressed) this.jumpBufferTimer = m.jumpBuffer;
    if (input.divePressed) this.diveBufferTimer = DIVE_BUFFER;
    this.launchBufferTimer = Math.max(0, this.launchBufferTimer - dt);
    if (input.launchPressed) this.launchBufferTimer = LAUNCH_BUFFER;
    this.launchCooldown = Math.max(0, this.launchCooldown - dt);
    this.zipCooldown = Math.max(0, this.zipCooldown - dt);
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.sameWallTimer = Math.max(0, this.sameWallTimer - dt);
    this.nearMissTimer = Math.max(0, this.nearMissTimer - dt);
    this.timeSinceRelease += dt;
    if (!input.shiftHeld) this.noAnchorReported = false;
  }

  private afterStep(dt: number): void {
    const p = this.position;
    const broken = !Number.isFinite(p.x + p.y + p.z + this.velocity.x + this.velocity.y + this.velocity.z);
    if (broken || p.y < -20 || Math.abs(p.x) > this.bounds + 40 || Math.abs(p.z) > this.bounds + 40) {
      this.respawn();
      return;
    }
    if (this.state === 'grounded' && this.onGround && this.stateTime > 0.5) {
      this.safeTimer += dt;
      if (this.safeTimer >= SAFE_POINT_INTERVAL) {
        this.safeTimer = 0;
        const last = this.safePoints[this.safePoints.length - 1];
        if (!last || last.distanceToSquared(p) > 9) {
          this.safePoints.push(p.clone());
          if (this.safePoints.length > MAX_SAFE_POINTS) this.safePoints.shift();
        }
      }
    }
  }

  private resetAt(point: Vector3, yaw: number): void {
    this.position.copy(point);
    this.previousPosition.copy(point);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.detachRope(false);
    this.chainPending = false;
    this.onGround = true;
    this.jumpBufferTimer = 0;
    this.diveBufferTimer = 0;
    this.launchBufferTimer = 0;
    this.charge = 0;
    this.setState('grounded');
  }

  /** tuning.movement plus the active mode's replacements, into `mv` (no allocation). */
  private refreshMovement(): void {
    Object.assign(this.mv, this.tuning.movement);
    const replace = this.modeDef.movement?.(this.tuning);
    if (replace) Object.assign(this.mv, replace);
  }
}

/** States a fight move may start from. */
function canAct(state: MoveState): boolean {
  return state === 'grounded' || state === 'landing' || state === 'airborne' || state === 'action' || state === 'perch' || state === 'swinging' || state === 'dive';
}

/** States E (look and launch) works from. */
function canLaunch(state: MoveState): boolean {
  return (
    state === 'grounded' ||
    state === 'landing' ||
    state === 'airborne' ||
    state === 'swinging' ||
    state === 'dive' ||
    state === 'wallRun' ||
    state === 'wallClimb' ||
    state === 'perch'
  );
}

/** Position of a box face along its normal axis (adjacent buildings share a facade plane). */
function wallPlane(box: Box, nx: number, nz: number): number {
  if (nx > 0) return box.maxX;
  if (nx < 0) return box.minX;
  return nz > 0 ? box.maxZ : box.minZ;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Yaw that faces the horizontal direction (x, z); 0 faces −Z. */
export function yawOf(x: number, z: number): number {
  return Math.atan2(-x, -z);
}
