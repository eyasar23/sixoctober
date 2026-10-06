import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { KMH, type Tuning } from '../config/tuning';
import { type CollisionWorld, createHit } from '../world/collision';
import type { MoveState } from './playerSim';

const DEG = Math.PI / 180;
/** Seconds the opening pull-in takes. */
const INTRO_TIME = 3.2;
const SPRING_STEP = 1 / 120;

export interface CameraSubject {
  /** Interpolated feet position. */
  position: Vector3;
  velocity: Vector3;
  state: MoveState;
  /** Wall normal while wall running or climbing. */
  wallNormal: Vector3;
  /** Rope anchor while swinging, else null. */
  ropeAnchor: Vector3 | null;
}

/**
 * Third-person camera on a spring arm: it never enters buildings, widens its view and arm with
 * speed, banks while swinging and wall running, leads the motion, turns toward the direction of
 * travel when the mouse rests and shakes on hard landings (trauma-based shake).
 */
export class FollowCamera {
  readonly camera: PerspectiveCamera;
  /** Angle around the hero, radians. 0 = camera on +Z looking toward −Z. */
  yaw = 0;
  /** Radians. Positive = camera above the hero looking down. */
  pitch = 0.42;
  private readonly pivot = new Vector3();
  private readonly pivotTarget = new Vector3();
  private readonly dir = new Vector3();
  private readonly hit = createHit();
  private arm: number;
  private fov: number;
  private roll = 0;
  private trauma = 0;
  private shakeTime = 0;
  private mouseIdle = 99;
  private dipOffset = 0;
  private dipVelocity = 0;
  private introTime = 0;
  private initialised = false;

  constructor(
    private readonly tuning: Tuning,
    aspect: number,
  ) {
    const c = tuning.camera;
    this.camera = new PerspectiveCamera(c.fov, aspect, 0.1, 3200);
    this.arm = c.distance;
    this.fov = c.fov;
  }

  /** Mouse movement in pixels. */
  look(dx: number, dy: number): void {
    const c = this.tuning.camera;
    if (dx === 0 && dy === 0) return;
    this.mouseIdle = 0;
    this.yaw -= dx * c.mouseSensitivity;
    this.pitch = MathUtils.clamp(this.pitch + (c.invertY ? -dy : dy) * c.mouseSensitivity, c.minPitch, c.maxPitch);
  }

  /** 0..1; a hard landing is about 0.6. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Short downward camera dip (landings), m/s of initial dip speed. */
  kickDown(speed: number): void {
    this.dipVelocity -= speed;
  }

  get introProgress(): number {
    return Math.min(this.introTime / INTRO_TIME, 1);
  }

  update(dt: number, subject: CameraSubject, world: CollisionWorld): void {
    const c = this.tuning.camera;
    const v = subject.velocity;
    const speed = v.length();
    const t = MathUtils.clamp((speed / KMH - c.speedRangeStart) / (c.speedRangeEnd - c.speedRangeStart), 0, 1);
    const speedBlend = t * t * (3 - 2 * t);
    this.mouseIdle += dt;
    this.introTime += dt;
    const intro = 1 - easeOutCubic(this.introProgress);

    // Yaw assistance: face the wall while climbing, follow the travel direction when the mouse rests.
    const horizontal = Math.hypot(v.x, v.z);
    if (subject.state === 'wallClimb') {
      if (this.mouseIdle > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(subject.wallNormal.x, subject.wallNormal.z), 3, dt);
    } else if (c.autoAlign && this.mouseIdle > c.autoAlignDelay && horizontal > 10 && isTravelling(subject.state)) {
      const rate = c.autoAlignRate * Math.min(1, horizontal / 30);
      this.yaw = dampAngle(this.yaw, Math.atan2(-v.x, -v.z), rate, dt);
    }

    // Pivot: above the hero, leading the motion a little.
    const lead = Math.min(c.lookAhead * speed, 5);
    const leadX = horizontal > 0.5 ? (v.x / horizontal) * lead : 0;
    const leadZ = horizontal > 0.5 ? (v.z / horizontal) * lead : 0;
    const leadY = MathUtils.clamp(v.y * c.lookAhead * 0.25, -1.5, 1.5);
    // Landing dip: a stiff spring, integrated in small fixed steps so it stays stable at low frame rates.
    for (let left = dt; left > 1e-6; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      this.dipVelocity += (-this.dipOffset * 90 - this.dipVelocity * 14) * h;
      this.dipOffset += this.dipVelocity * h;
    }
    if (!Number.isFinite(this.dipOffset + this.dipVelocity)) {
      this.dipOffset = 0;
      this.dipVelocity = 0;
    }
    this.pivotTarget.set(subject.position.x + leadX, subject.position.y + c.height + leadY + this.dipOffset, subject.position.z + leadZ);
    if (!this.initialised) {
      this.pivot.copy(this.pivotTarget);
      this.initialised = true;
    } else {
      this.pivot.lerp(this.pivotTarget, 1 - Math.exp(-c.followDamping * dt));
    }

    // Arm length and field of view grow with speed.
    const pitch = this.pitch + intro * 0.12;
    const desired = MathUtils.lerp(c.distance, c.distanceAtSpeed, speedBlend) + (subject.state === 'wallClimb' ? c.climbExtraDistance : 0) + intro * 10;
    const fovTarget = MathUtils.lerp(c.fov, c.fovAtSpeed, speedBlend) + (subject.state === 'dive' ? 6 : 0);
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-c.fovDamping * dt));

    this.dir.set(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    let allowed = desired;
    const p = this.pivot;
    if (world.raycast(p.x, p.y, p.z, this.dir.x, this.dir.y, this.dir.z, desired, c.collisionRadius, this.hit)) {
      allowed = Math.max(this.hit.t - 0.05, 0.6);
    }
    // Snap in at once (never clip into a wall); grow back out smoothly.
    if (allowed < this.arm) this.arm = allowed;
    else this.arm += (allowed - this.arm) * (1 - Math.exp(-c.collisionRecover * dt));

    // Roll: bank toward the rope while swinging, away from the wall while wall running.
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let rollTarget = 0;
    if (subject.state === 'swinging' && subject.ropeAnchor) {
      const rx = subject.ropeAnchor.x - subject.position.x;
      const rz = subject.ropeAnchor.z - subject.position.z;
      const lateral = (rx * rightX + rz * rightZ) / Math.max(Math.hypot(rx, rz), 1);
      rollTarget = -lateral * c.swingRoll * DEG;
    } else if (subject.state === 'wallRun') {
      rollTarget = -(subject.wallNormal.x * rightX + subject.wallNormal.z * rightZ) * c.wallRunRoll * DEG;
    }
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-c.rollDamping * dt));

    // Trauma shake: strength is trauma², smooth noise on rotation and position.
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    this.shakeTime += dt;
    const shake = c.shake ? this.trauma * this.trauma * c.shakeIntensity : 0;
    const n1 = noise(this.shakeTime * 23, 1.7);
    const n2 = noise(this.shakeTime * 21, 4.3);
    const n3 = noise(this.shakeTime * 19, 7.1);

    const cam = this.camera;
    cam.position.set(p.x + this.dir.x * this.arm + n1 * shake * 0.25, p.y + this.dir.y * this.arm + n2 * shake * 0.25, p.z + this.dir.z * this.arm);
    cam.up.set(0, 1, 0);
    cam.lookAt(p);
    cam.rotateZ(this.roll + n3 * shake * 0.05);
    cam.rotateX(n2 * shake * 0.03);
    cam.rotateY(n1 * shake * 0.03);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}

function isTravelling(state: MoveState): boolean {
  return state === 'swinging' || state === 'airborne' || state === 'dive' || state === 'zip' || state === 'wallRun';
}

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-rate * dt));
}

/** Smooth noise in about −1..1 from a few incommensurate sines. */
function noise(t: number, seed: number): number {
  return (Math.sin(t + seed) + Math.sin(t * 1.618 + seed * 2.3) * 0.6 + Math.sin(t * 2.71 + seed * 3.7) * 0.3) / 1.9;
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}
