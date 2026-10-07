import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { KMH, type Tuning } from '../config/tuning';
import type { CollisionWorld } from '../world/collision';
import type { MoveState } from './playerSim';

const DEG = Math.PI / 180;
/** Seconds the opening pull-in takes. */
const INTRO_TIME = 3.2;
const SPRING_STEP = 1 / 120;
/** Mouse travel (px) that takes the camera back from a cinematic shot. */
const SHOT_CANCEL_PIXELS = 24;

export interface CameraSubject {
  /** Interpolated feet position. */
  position: Vector3;
  velocity: Vector3;
  state: MoveState;
  /** Wall normal while wall running or climbing. */
  wallNormal: Vector3;
  /** Rope anchor while swinging, else null. */
  ropeAnchor: Vector3 | null;
  /** 0..1: a fight is on nearby (the camera pulls back to show the enemies). */
  combat: number;
}

/**
 * A short framed shot (perch view, final blow): where the camera sits relative to the hero.
 * The follow camera blends into it and back out; moving the mouse ends it early.
 */
export interface CameraShot {
  duration: number;
  /** Absolute camera yaw and pitch, radians (same convention as FollowCamera.yaw/pitch). */
  yaw: number;
  pitch: number;
  distance: number;
  /** Look-at point above the feet, m. */
  height: number;
  /** Camera offset to its right, m. */
  side: number;
  fov: number;
  /** Dutch angle, radians (a tilted comic-panel frame). */
  roll: number;
  blendIn: number;
  blendOut: number;
}

/**
 * Third-person camera on a spring arm. Buildings between the camera and the hero are not avoided
 * by jumping the camera forward: the city shaders turn them see-through (see xray in lighting.ts).
 * The arm only shortens when the camera itself would end up inside a building, and the camera
 * keeps clear of the ground by rising instead of diving under the hero. Framing changes with the
 * state (pulled back over the city while swinging, closer on foot, off to the side on a wall run);
 * the mouse wheel picks near / mid / far; with the mouse at rest it slowly turns behind the
 * direction of travel. Trauma-based shake, FOV punches and short cinematic shots on top.
 */
export class FollowCamera {
  readonly camera: PerspectiveCamera;
  /** Angle around the hero, radians. 0 = camera on +Z looking toward −Z. */
  yaw = 0;
  /** Radians. Positive = camera above the hero looking down. */
  pitch = 0.42;
  /** 0 near, 1 mid, 2 far (mouse wheel). */
  zoomLevel = 1;
  /** Point the camera looks at (above the hero), after smoothing. */
  readonly pivot = new Vector3();
  private readonly pivotTarget = new Vector3();
  private readonly dir = new Vector3();
  private readonly offset = new Vector3();
  private readonly lookAt = new Vector3();
  private arm: number;
  private fov: number;
  private roll = 0;
  private trauma = 0;
  private shakeTime = 0;
  private mouseIdle = 99;
  private dipOffset = 0;
  private dipVelocity = 0;
  private fovPunch = 0;
  private fovPunchVelocity = 0;
  private introTime = 0;
  private initialised = false;
  private zoom = 1;
  // Smoothed state framing.
  private frameDistance = 1;
  private frameHeight = 0;
  private framePitch = 0;
  private frameSide = 0;
  private groundPitchFloor = -Math.PI / 2;
  // Cinematic shot.
  private shot: CameraShot | null = null;
  private shotTime = 0;
  private shotOut = -1;
  private shotMouse = 0;

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
    if (this.shot) {
      this.shotMouse += Math.abs(dx) + Math.abs(dy);
      if (this.shotMouse > SHOT_CANCEL_PIXELS) this.endShot();
    }
    this.yaw -= dx * c.mouseSensitivity;
    this.pitch = MathUtils.clamp(this.pitch + (c.invertY ? -dy : dy) * c.mouseSensitivity, c.minPitch, c.maxPitch);
  }

  /** Mouse wheel: positive = farther. */
  zoomStep(direction: number): void {
    this.zoomLevel = MathUtils.clamp(this.zoomLevel + Math.sign(direction), 0, 2);
  }

  /** 0..1; a hard landing is about 0.6. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Short downward camera dip (landings), m/s of initial dip speed. */
  kickDown(speed: number): void {
    this.dipVelocity -= speed;
  }

  /** Quick zoom punch: degrees of field of view, springs back (negative = punch in). */
  punchFov(degrees: number): void {
    this.fovPunchVelocity += degrees * 14;
  }

  playShot(shot: CameraShot): void {
    this.shot = shot;
    this.shotTime = 0;
    this.shotOut = -1;
    this.shotMouse = 0;
  }

  get shotActive(): boolean {
    return this.shot !== null;
  }

  /** Starts blending back to the follow camera. */
  endShot(): void {
    if (this.shot && this.shotOut < 0) this.shotOut = 0;
  }

  get introProgress(): number {
    return Math.min(this.introTime / INTRO_TIME, 1);
  }

  /** Skips the opening pull-in (menu → play, respawn). */
  skipIntro(): void {
    this.introTime = INTRO_TIME;
  }

  /** Puts the camera straight behind a facing yaw (respawn, teleport). */
  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.initialised = false;
  }

  update(frameDt: number, subject: CameraSubject, world: CollisionWorld): void {
    const dt = Math.max(frameDt, 0);
    const c = this.tuning.camera;
    const v = subject.velocity;
    const speed = v.length();
    const t = MathUtils.clamp((speed / KMH - c.speedRangeStart) / (c.speedRangeEnd - c.speedRangeStart), 0, 1);
    const speedBlend = t * t * (3 - 2 * t);
    this.mouseIdle += dt;
    this.introTime += dt;
    const intro = 1 - easeOutCubic(this.introProgress);
    const state = subject.state;

    // Yaw assistance: face the wall while climbing; with the mouse at rest, slowly settle behind
    // the direction of travel (and back to a comfortable pitch).
    const horizontal = Math.hypot(v.x, v.z);
    if (state === 'wallClimb') {
      if (this.mouseIdle > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(subject.wallNormal.x, subject.wallNormal.z), 3, dt);
    } else if (c.autoAlign && this.mouseIdle > c.autoAlignDelay && horizontal > 4 && state !== 'perch') {
      const rate = c.autoAlignRate * Math.min(1, horizontal / 25);
      this.yaw = dampAngle(this.yaw, Math.atan2(-v.x, -v.z), rate, dt);
      this.pitch += (c.restPitch - this.pitch) * (1 - Math.exp(-rate * 0.5 * dt));
    }

    // Framing by state: pulled back over the city while swinging, closer on foot, wider in a fight.
    let frameDistance = 1;
    let frameHeight = 0;
    let framePitch = 0;
    let frameSide = 0;
    switch (state) {
      case 'grounded':
      case 'landing':
      case 'perch':
        frameDistance = c.groundDistance;
        break;
      case 'swinging':
        frameDistance = c.swingDistance;
        frameHeight = c.swingHeight;
        framePitch = c.swingPitch;
        break;
      case 'airborne':
      case 'dive':
      case 'zip':
      case 'pound':
        frameDistance = c.airDistance;
        frameHeight = c.swingHeight * 0.5;
        break;
      case 'wallRun': {
        // Slide away from the wall so the run and the street ahead are both in view.
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);
        frameSide = (subject.wallNormal.x * rightX + subject.wallNormal.z * rightZ) * c.wallRunSide;
        frameHeight = 0.4;
        break;
      }
      default:
        break;
    }
    const combat = MathUtils.clamp(subject.combat, 0, 1);
    frameDistance = MathUtils.lerp(frameDistance, c.combatDistance, combat);
    frameHeight += combat * 0.6;
    framePitch += combat * 0.06;
    const frameRate = 1 - Math.exp(-c.framingDamping * dt);
    this.frameDistance += (frameDistance - this.frameDistance) * frameRate;
    this.frameHeight += (frameHeight - this.frameHeight) * frameRate;
    this.framePitch += (framePitch - this.framePitch) * frameRate;
    this.frameSide += (frameSide - this.frameSide) * frameRate;
    const zoomTarget = this.zoomLevel === 0 ? c.zoomNear : this.zoomLevel === 2 ? c.zoomFar : 1;
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-6 * dt));

    // Pivot: above the hero, leading the motion a little.
    const lead = Math.min(c.lookAhead * speed, 5);
    const leadX = horizontal > 0.5 ? (v.x / horizontal) * lead : 0;
    const leadZ = horizontal > 0.5 ? (v.z / horizontal) * lead : 0;
    const leadY = MathUtils.clamp(v.y * c.lookAhead * 0.25, -1.5, 1.5);
    // Springs (landing dip, FOV punch), integrated in small fixed steps so they stay stable at low frame rates.
    for (let left = dt; left > 1e-6; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      this.dipVelocity += (-this.dipOffset * 90 - this.dipVelocity * 14) * h;
      this.dipOffset += this.dipVelocity * h;
      this.fovPunchVelocity += (-this.fovPunch * 160 - this.fovPunchVelocity * 18) * h;
      this.fovPunch += this.fovPunchVelocity * h;
    }
    if (!Number.isFinite(this.dipOffset + this.dipVelocity + this.fovPunch + this.fovPunchVelocity)) {
      this.dipOffset = 0;
      this.dipVelocity = 0;
      this.fovPunch = 0;
      this.fovPunchVelocity = 0;
    }
    const height = c.height + this.frameHeight;
    this.pivotTarget.set(subject.position.x + leadX, subject.position.y + height + leadY + this.dipOffset, subject.position.z + leadZ);
    if (!this.initialised) {
      this.pivot.copy(this.pivotTarget);
      this.initialised = true;
    } else {
      this.pivot.lerp(this.pivotTarget, 1 - Math.exp(-c.followDamping * dt));
    }

    // Arm length and field of view grow with speed.
    let yaw = this.yaw;
    let pitch = Math.max(this.pitch, c.minPitch) + this.framePitch + intro * 0.12;
    let desired =
      (MathUtils.lerp(c.distance, c.distanceAtSpeed, speedBlend) * this.frameDistance * this.zoom +
        (state === 'wallClimb' ? c.climbExtraDistance : 0)) +
      intro * 10;
    let side = this.frameSide;
    let fovTarget = MathUtils.lerp(c.fov, c.fovAtSpeed, speedBlend) + (state === 'dive' || state === 'pound' ? 6 : 0);
    let lookHeight = 0;

    // Cinematic shot on top, blended in and out.
    const shotWeight = this.updateShot(dt);
    const shot = this.shot;
    if (shot && shotWeight > 0) {
      yaw = this.yaw + wrap(shot.yaw - this.yaw) * shotWeight;
      pitch = MathUtils.lerp(pitch, shot.pitch, shotWeight);
      desired = MathUtils.lerp(desired, shot.distance, shotWeight);
      side = MathUtils.lerp(side, shot.side, shotWeight);
      fovTarget = MathUtils.lerp(fovTarget, shot.fov, shotWeight);
      lookHeight = (shot.height - height) * shotWeight;
    }
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-c.fovDamping * dt));

    // Keep clear of the ground (and roofs) below the camera: rise rather than dip under the hero.
    const p = this.lookAt.copy(this.pivot);
    p.y += lookHeight;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const camX = p.x + sinYaw * Math.cos(pitch) * this.arm + cosYaw * side;
    const camZ = p.z + cosYaw * Math.cos(pitch) * this.arm - sinYaw * side;
    const floor = world.supportHeight(camX, camZ, 0.2, 0.2, p.y + 0.5) + c.groundClearance;
    const floorPitch = Math.asin(MathUtils.clamp((floor - p.y) / Math.max(this.arm, 0.5), -1, 1));
    this.groundPitchFloor += (floorPitch - this.groundPitchFloor) * (1 - Math.exp(-12 * dt));
    // Looking up past the floor tilts the view up from where the camera is, instead of the camera
    // sinking toward the street: aiming at roof edges still works, the camera never goes low.
    let tilt = 0;
    if (pitch < this.groundPitchFloor) {
      tilt = Math.min(this.groundPitchFloor - pitch, 1);
      pitch = this.groundPitchFloor;
    }

    this.dir.set(sinYaw * Math.cos(pitch), Math.sin(pitch), cosYaw * Math.cos(pitch));
    this.offset.set(cosYaw * side, 0, -sinYaw * side);
    // The arm only shortens when the camera itself would sit inside a building.
    const allowed = this.armOutsideBuildings(world, p, desired, c.collisionRadius);
    const rate = allowed < this.arm ? c.collisionPullIn : c.collisionRecover;
    this.arm += (allowed - this.arm) * (1 - Math.exp(-rate * dt));
    if (!Number.isFinite(this.arm)) this.arm = allowed;

    // Roll: bank toward the rope while swinging, away from the wall while wall running.
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    let rollTarget = 0;
    if (state === 'swinging' && subject.ropeAnchor) {
      const rx = subject.ropeAnchor.x - subject.position.x;
      const rz = subject.ropeAnchor.z - subject.position.z;
      const lateral = (rx * rightX + rz * rightZ) / Math.max(Math.hypot(rx, rz), 1);
      rollTarget = -lateral * c.swingRoll * DEG;
    } else if (state === 'wallRun') {
      rollTarget = -(subject.wallNormal.x * rightX + subject.wallNormal.z * rightZ) * c.wallRunRoll * DEG;
    }
    rollTarget = rollTarget * (1 - shotWeight) + (shot ? shot.roll * shotWeight : 0);
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-c.rollDamping * dt));

    // Trauma shake: strength is trauma², smooth noise on rotation and position.
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    this.shakeTime += dt;
    const shake = c.shake ? this.trauma * this.trauma * c.shakeIntensity : 0;
    const n1 = noise(this.shakeTime * 23, 1.7);
    const n2 = noise(this.shakeTime * 21, 4.3);
    const n3 = noise(this.shakeTime * 19, 7.1);

    const cam = this.camera;
    cam.position.set(
      p.x + this.dir.x * this.arm + this.offset.x + n1 * shake * 0.25,
      p.y + this.dir.y * this.arm + n2 * shake * 0.25,
      p.z + this.dir.z * this.arm + this.offset.z,
    );
    this.lookAt.set(p.x + this.offset.x, p.y + Math.tan(tilt) * this.arm, p.z + this.offset.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lookAt);
    cam.rotateZ(this.roll + n3 * shake * 0.05);
    cam.rotateX(n2 * shake * 0.03);
    cam.rotateY(n1 * shake * 0.03);
    const fov = MathUtils.clamp(this.fov + this.fovPunch, 20, 140);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Shot blend weight 0..1 for this frame; clears the shot when it is over. */
  private updateShot(dt: number): number {
    const shot = this.shot;
    if (!shot) return 0;
    this.shotTime += dt;
    if (this.shotOut < 0 && this.shotTime >= shot.duration) this.shotOut = 0;
    let weight = smooth(Math.min(this.shotTime / Math.max(shot.blendIn, 1e-3), 1));
    if (this.shotOut >= 0) {
      this.shotOut += dt;
      const out = Math.min(this.shotOut / Math.max(shot.blendOut, 1e-3), 1);
      weight *= 1 - smooth(out);
      if (out >= 1) {
        this.shot = null;
        return 0;
      }
    }
    return weight;
  }

  /**
   * Longest arm up to `desired` whose end (a sphere of `radius`) is outside every building.
   * Buildings crossed on the way are fine: they turn see-through instead.
   */
  private armOutsideBuildings(world: CollisionWorld, p: Vector3, desired: number, radius: number): number {
    let length = desired;
    for (let i = 0; i < 4; i++) {
      const x = p.x + this.dir.x * length + this.offset.x;
      const y = p.y + this.dir.y * length;
      const z = p.z + this.dir.z * length + this.offset.z;
      const box = world.overlaps(x, y, z, radius, radius, radius);
      if (!box) return length;
      // Back off to where this box was entered along the arm.
      const enter = entryDistance(p.x + this.offset.x, p.y, p.z + this.offset.z, this.dir, length, box, radius);
      length = Math.max(enter - 0.05, 0.6);
      if (length <= 0.6) return length;
    }
    return length;
  }
}

/** Distance along `dir` from (ox, oy, oz) where the ray enters the box inflated by r (0 if inside). */
function entryDistance(
  ox: number,
  oy: number,
  oz: number,
  dir: Vector3,
  maxDist: number,
  box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  r: number,
): number {
  let enter = 0;
  let exit = maxDist;
  const axes: Array<[number, number, number, number]> = [
    [ox, dir.x, box.minX - r, box.maxX + r],
    [oy, dir.y, box.minY - r, box.maxY + r],
    [oz, dir.z, box.minZ - r, box.maxZ + r],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return maxDist;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return maxDist;
  }
  return enter;
}

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return current + wrap(target - current) * (1 - Math.exp(-rate * dt));
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Smooth noise in about −1..1 from a few incommensurate sines. */
function noise(t: number, seed: number): number {
  return (Math.sin(t + seed) + Math.sin(t * 1.618 + seed * 2.3) * 0.6 + Math.sin(t * 2.71 + seed * 3.7) * 0.3) / 1.9;
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}
