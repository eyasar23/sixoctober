import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { KMH, type CameraPreset, type Tuning } from '../config/tuning';
import { createHit, type Box, type CollisionWorld } from '../world/collision';
import { alignmentWeight, combatFramingYaw, criticalDamped, DEG, frameDistance, GroundInputReference, groundAlignmentWeight, wallSafeDirection, wrapAngle } from './cameraMath';
import type { MoveState } from './playerSim';

export type CameraProfile = keyof Tuning['camera']['profiles'];
export interface CameraSubject {
  position: Vector3;
  velocity: Vector3;
  state: MoveState;
  wallNormal: Vector3;
  ropeAnchor: Vector3 | null;
  combat: number;
  /** Read-only snapshots; the camera never changes movement or enemy state. */
  wallBox?: Box | null;
  combatTarget?: Vector3 | null;
  titleView?: boolean;
}
export interface CameraShot {
  duration: number;
  yaw: number;
  /** Radians, positive means looking down (legacy shot convention). */
  pitch: number;
  distance: number;
  height: number;
  side: number;
  fov: number;
  roll: number;
  blendIn: number;
  blendOut: number;
}

/** State-framed follow camera; movement, rope and combat are read-only. */
export class FollowCamera {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  /** Positive radians look down; profile tuning uses signed viewing degrees. */
  pitch: number;
  zoomLevel = 1;
  readonly pivot = new Vector3();
  profile: CameraProfile = 'GROUND';
  autoAlignActive = false;
  measuredHeightPercent = 0;
  private readonly inputReference = new GroundInputReference();
  private movementYaw = 0;
  private haveMovementReference = false;
  private lastPreset: CameraPreset;
  private manualPitchOffset = 0;
  private profilePitch = 0;
  private combatYawBase = 0;
  private readonly target = new Vector3();
  private readonly candidate = new Vector3();
  private readonly direction = new Vector3();
  private readonly normal = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly previousCamera = new Vector3();
  private readonly positionVelocity = new Vector3();
  private readonly pivotVelocity = new Vector3();
  private readonly hit = createHit();
  private readonly probe = createHit();
  private arm: number;
  private recoveringArm = false;
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private frameArm: number;
  private frameArmVelocity = 0;
  private pivotHeight: number;
  private heightVelocity = 0;
  private lookAhead: number;
  private leadVelocity = 0;
  private roll = 0;
  private rollVelocity = 0;
  private fov: number;
  private zoom = 1;
  private trauma = 0;
  private shakeTime = 0;
  private mouseIdle = Infinity;
  private dipOffset = 0;
  private dipVelocity = 0;
  private fovPunch = 0;
  private fovPunchVelocity = 0;
  private introTime = 0;
  private initialised = false;
  private wallTime = 0;
  private wasWall = false;
  private wallSide = 1;
  private shot: CameraShot | null = null;
  private shotTime = 0;
  private shotOut = -1;

  constructor(private readonly tuning: Tuning, aspect: number) {
    const c = tuning.camera;
    const p = c.profiles.GROUND;
    this.camera = new PerspectiveCamera(c.fov, aspect, 0.1, 3200);
    this.pitch = -p.pitch * DEG;
    this.profilePitch = this.pitch;
    this.lastPreset = c.preset;
    this.arm = this.frameArm = frameDistance(c.characterHeight, p.frameHeight, c.fov, c.minDistance, c.maxDistance);
    this.pivotHeight = p.pivotHeight;
    this.lookAhead = p.lookAhead;
    this.fov = c.fov;
  }
  get distance(): number { return this.camera.position.distanceTo(this.pivot); }
  get inputYaw(): number { return this.movementYaw; }
  get shotActive(): boolean { return this.shot !== null; }
  setMovementKeys(mask: number, grounded: boolean): number {
    this.movementYaw = this.inputReference.update(this.yaw, mask, this.tuning.camera.inputReference, grounded);
    this.haveMovementReference = grounded;
    return this.movementYaw;
  }
  look(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const c = this.tuning.camera;
    this.mouseIdle = 0;
    this.shot = null;
    this.yaw -= dx * c.mouseSensitivity;
    this.pitch = MathUtils.clamp(this.pitch + (c.invertY ? -dy : dy) * c.mouseSensitivity, c.minPitch, c.maxPitch);
    if (c.preset === 'manual') this.manualPitchOffset = this.pitch - this.profilePitch;
    this.yawVelocity = this.pitchVelocity = 0;
    this.inputReference.look(this.yaw);
    this.movementYaw = this.yaw;
  }
  zoomStep(direction: number): void { this.zoomLevel = MathUtils.clamp(this.zoomLevel + Math.sign(direction), 0, 2); }
  addTrauma(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }
  kickDown(speed: number): void { this.dipVelocity -= speed; }
  punchFov(degrees: number): void { this.fovPunchVelocity += degrees * this.tuning.camera.punchImpulse; }
  playShot(shot: CameraShot): void { this.shot = shot; this.shotTime = 0; this.shotOut = -1; }
  endShot(): void { if (this.shot && this.shotOut < 0) this.shotOut = 0; }
  get introProgress(): number { return Math.min(this.introTime / this.tuning.camera.introTime, 1); }
  skipIntro(): void { this.introTime = this.tuning.camera.introTime; }
  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.inputReference.look(yaw);
    this.movementYaw = yaw;
    this.yawVelocity = this.pitchVelocity = 0;
    this.initialised = false;
  }

  update(frameDt: number, subject: CameraSubject, world: CollisionWorld): void {
    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
    const c = this.tuning.camera;
    const v = subject.velocity;
    const horizontal = Math.hypot(v.x, v.z);
    const wall = subject.state === 'wallClimb' || subject.state === 'wallRun';
    this.normal.set(subject.wallNormal.x, 0, subject.wallNormal.z);
    const validNormal = this.normal.lengthSq() > 1e-8;
    if (validNormal) this.normal.normalize();
    if (wall && !this.wasWall) {
      this.wallTime = 0;
      if (validNormal) this.wallSide = this.openWallSide(subject, world);
    }
    if (wall) this.wallTime += dt;
    else this.wallTime = 0;
    this.wasWall = wall;
    const wallHold = wall && this.wallTime <= c.wallAttachDelay;
    const combatTarget = subject.combatTarget;
    const nearbyEnemy = combatTarget && combatTarget.distanceTo(subject.position) <= c.combatRange;
    const previousProfile = this.profile;
    if (!wallHold) {
      this.profile = wall ? 'WALL' : subject.state === 'perch' ? 'PERCH' :
        ['airborne', 'swinging', 'zip', 'dive', 'pound', 'mantle'].includes(subject.state) ? 'AIR' :
          subject.combat > 0 && nearbyEnemy ? 'COMBAT' : 'GROUND';
    }
    const profile = c.profiles[this.profile];
    if (this.profile === 'COMBAT' && previousProfile !== 'COMBAT') this.combatYawBase = this.yaw;
    const weight = alignmentWeight(this.mouseIdle, c.mouseHold, c.mouseResume);
    this.mouseIdle += dt;
    this.introTime += dt;
    let targetYaw = this.yaw;
    let targetPitch = -profile.pitch * DEG;
    let yawWeight = c.preset === 'reference' && !wallHold ? weight : 0;
    if (this.profile === 'AIR') {
      const vertical = MathUtils.clamp(v.y / Math.max(c.airVerticalSpeed, 0.001), -1, 1);
      const dive = subject.state === 'dive' || subject.state === 'pound';
      targetPitch = -(dive ? c.airDivePitch : MathUtils.lerp(profile.pitch, vertical > 0 ? c.airRisePitch : c.airDivePitch, Math.abs(vertical))) * DEG;
    }
    if (wall && validNormal && !wallHold) {
      const verticalTravel = subject.state === 'wallClimb' || Math.abs(v.y) > horizontal;
      if (verticalTravel && v.y > c.wallVerticalSpeed) targetPitch = -c.wallClimbPitch * DEG;
      else if (verticalTravel && v.y < -c.wallVerticalSpeed) targetPitch = -c.wallDescendPitch * DEG;
      const lateral = v.x * this.normal.z - v.z * this.normal.x;
      if (Math.abs(lateral) > c.wallVerticalSpeed) this.wallSide = lateral < 0 ? 1 : -1;
      // Reduce horizontal obliqueness on descent to keep the full 3D wall-view angle within bounds.
      const viewAngle = Math.max(c.wallAngle * DEG, Math.abs(targetPitch) + c.wallAngleMargin * DEG);
      const oblique = Math.acos(MathUtils.clamp(Math.cos(Math.min(viewAngle, c.wallMaxViewAngle * DEG)) / Math.cos(targetPitch), 0, 1));
      targetYaw = Math.atan2(this.normal.x, this.normal.z) + this.wallSide * oblique;
    } else if (this.profile === 'PERCH' && validNormal) {
      targetYaw = Math.atan2(-this.normal.x, -this.normal.z);
    } else if (horizontal > c.minAlignSpeed) {
      targetYaw = Math.atan2(-v.x, -v.z);
      if (this.profile === 'GROUND' || this.profile === 'COMBAT') yawWeight *= groundAlignmentWeight(targetYaw - (this.haveMovementReference ? this.movementYaw : this.yaw), c);
    } else yawWeight = 0;
    if (this.profile === 'COMBAT' && combatTarget) {
      if (horizontal <= c.minAlignSpeed) targetYaw = this.combatYawBase;
      const combatArm = frameDistance(c.characterHeight, profile.frameHeight, c.fov, c.minDistance, c.maxDistance) * this.zoom;
      targetYaw = combatFramingYaw(targetYaw, subject.position, combatTarget, combatArm, targetPitch, c.fov, this.camera.aspect, c.combatYawWeight, c.combatFrameMargin);
      if (horizontal <= c.minAlignSpeed) yawWeight = c.preset === 'reference' ? weight : 0;
    }
    this.autoAlignActive = yawWeight > 0;
    if (c.preset !== this.lastPreset && c.preset === 'manual') this.manualPitchOffset = this.pitch - targetPitch;
    this.lastPreset = c.preset;
    this.profilePitch = targetPitch;
    if (c.preset === 'manual') targetPitch += this.manualPitchOffset;
    if (yawWeight > 0) {
      const yaw = criticalDamped(this.yaw, this.yawVelocity, this.yaw + wrapAngle(targetYaw - this.yaw), profile.yawTime / yawWeight, dt);
      this.yaw = yaw.value; this.yawVelocity = yaw.velocity;
    } else this.yawVelocity = 0;
    if (!wallHold && weight > 0) {
      const pitch = criticalDamped(this.pitch, this.pitchVelocity, targetPitch, profile.pitchTime / weight, dt);
      this.pitch = MathUtils.clamp(pitch.value, c.minPitch, c.maxPitch); this.pitchVelocity = pitch.velocity;
    }
    const desiredArm = frameDistance(c.characterHeight, profile.frameHeight, c.fov, c.minDistance, c.maxDistance);
    const armFrame = criticalDamped(this.frameArm, this.frameArmVelocity, desiredArm, profile.transitionTime, dt);
    this.frameArm = armFrame.value; this.frameArmVelocity = armFrame.velocity;
    const height = criticalDamped(this.pivotHeight, this.heightVelocity, profile.pivotHeight, profile.transitionTime, dt);
    this.pivotHeight = height.value; this.heightVelocity = height.velocity;
    const lead = criticalDamped(this.lookAhead, this.leadVelocity, profile.lookAhead, profile.transitionTime, dt);
    this.lookAhead = lead.value; this.leadVelocity = lead.velocity;
    const zoomTarget = this.zoomLevel === 0 ? c.zoomNear : this.zoomLevel === 2 ? c.zoomFar : 1;
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-c.zoomDamping * dt));
    this.updateSprings(dt);
    const leadLength = Math.min(horizontal * this.lookAhead, c.maxLookAhead);
    this.target.copy(subject.position); this.target.y += this.pivotHeight + this.dipOffset;
    if (horizontal > 1e-6 && !wall) this.target.addScaledVector(this.direction.set(v.x / horizontal, 0, v.z / horizontal), leadLength);
    if (!this.initialised) this.pivot.copy(this.target);
    else this.springVector(this.pivot, this.pivotVelocity, this.target, c.positionTime, dt);
    if (wall && validNormal) {
      const inward = this.direction.subVectors(this.pivot, subject.position).dot(this.normal);
      if (inward < 0) this.pivot.addScaledVector(this.normal, -inward);
    }
    const speedT = MathUtils.clamp((v.length() / KMH - c.speedRangeStart) / Math.max(c.speedRangeEnd - c.speedRangeStart, 0.001), 0, 1);
    let desired = MathUtils.clamp(this.frameArm * this.zoom, c.minDistance, c.maxDistance) + (1 - easeOutCubic(this.introProgress)) * c.introExtraDistance;
    let yaw = this.yaw; let pitch = this.pitch; let side = 0; let lookHeight = 0;
    let fovTarget = MathUtils.lerp(c.fov, c.fovAtSpeed, smooth(speedT));
    const shotWeight = this.updateShot(dt);
    const shot = this.shot;
    const applyShot = shot && !wall && (subject.state !== 'perch' || subject.titleView);
    if (applyShot) {
      yaw += wrapAngle(shot.yaw - yaw) * shotWeight;
      pitch = MathUtils.lerp(pitch, shot.pitch, shotWeight);
      desired = MathUtils.lerp(desired, shot.distance, shotWeight);
      side = shot.side * shotWeight;
      lookHeight = (shot.height - this.pivotHeight) * shotWeight;
      fovTarget = MathUtils.lerp(fovTarget, shot.fov, shotWeight);
    }
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-c.fovDamping * dt));
    this.lookAt.copy(this.pivot); this.lookAt.y += lookHeight;
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (wall && validNormal && !wallHold) wallSafeDirection(this.direction, this.normal, c.wallMinDot);
    const blocked = world.raycast(this.lookAt.x, this.lookAt.y, this.lookAt.z, this.direction.x, this.direction.y, this.direction.z, desired, c.collisionRadius, this.hit);
    if (blocked) { desired = Math.max(c.minArm, this.hit.t - c.collisionSkin); this.recoveringArm = true; }
    const rate = desired < this.arm ? c.collisionPullIn : c.collisionRecover;
    if (this.recoveringArm) {
      this.arm += (desired - this.arm) * (1 - Math.exp(-rate * dt));
      if (!blocked && Math.abs(desired - this.arm) < c.collisionSkin) this.recoveringArm = false;
    } else this.arm = desired;
    this.candidate.copy(this.lookAt).addScaledVector(this.direction, this.arm);
    if (side) {
      this.candidate.x += Math.cos(yaw) * side; this.candidate.z -= Math.sin(yaw) * side;
      this.lookAt.x += Math.cos(yaw) * side; this.lookAt.z -= Math.sin(yaw) * side;
    }
    this.previousCamera.copy(this.camera.position);
    if (!this.initialised) this.camera.position.copy(this.candidate);
    else {
      this.springVector(this.camera.position, this.positionVelocity, this.candidate, c.positionTime, dt);
      const travel = this.direction.subVectors(this.camera.position, this.previousCamera);
      if (travel.length() > c.maxPositionSpeed * dt) {
        travel.setLength(c.maxPositionSpeed * dt);
        this.camera.position.copy(this.previousCamera).add(travel);
        this.positionVelocity.copy(travel).divideScalar(Math.max(dt, 1e-6));
      }
    }
    this.initialised = true;
    // Final safety cannot be undone by positional smoothing.
    this.direction.subVectors(this.camera.position, this.lookAt);
    const distance = this.direction.length();
    if (distance > 1e-6) {
      this.direction.divideScalar(distance);
      // The target is in the outside cone; the interpolated camera may approach it during
      // attachment. Keep it in the outside half-space without jumping to the cone boundary.
      const previousOutside = this.normal.x * (this.previousCamera.x - this.lookAt.x) + this.normal.z * (this.previousCamera.z - this.lookAt.z) >= 0;
      if (wall && validNormal && !wallHold && previousOutside) wallSafeDirection(this.direction, this.normal, 0);
      let safe = distance;
      if (world.raycast(this.lookAt.x, this.lookAt.y, this.lookAt.z, this.direction.x, this.direction.y, this.direction.z, distance, c.collisionRadius, this.hit)) safe = Math.max(0, this.hit.t - c.collisionSkin);
      this.camera.position.copy(this.lookAt).addScaledVector(this.direction, safe);
    }
    const floor = world.supportHeight(this.camera.position.x, this.camera.position.z, c.collisionRadius, c.collisionRadius, this.lookAt.y) + c.groundClearance;
    if (this.camera.position.y < floor) {
      this.camera.position.y = floor;
      this.lookAt.y = floor - Math.tan(pitch) * Math.hypot(this.camera.position.x - this.lookAt.x, this.camera.position.z - this.lookAt.z);
    }
    let rollTarget = 0;
    if (subject.state === 'swinging' && subject.ropeAnchor) {
      const rx = subject.ropeAnchor.x - subject.position.x; const rz = subject.ropeAnchor.z - subject.position.z;
      rollTarget = -(rx * Math.cos(yaw) - rz * Math.sin(yaw)) / Math.max(Math.hypot(rx, rz), 1) * profile.rollLimit * DEG;
    }
    if (applyShot) rollTarget = MathUtils.lerp(rollTarget, MathUtils.clamp(shot.roll, -c.shotRollLimit * DEG, c.shotRollLimit * DEG), shotWeight);
    if (this.profile === 'GROUND' || this.profile === 'COMBAT') rollTarget = 0;
    const roll = criticalDamped(this.roll, this.rollVelocity, rollTarget, profile.pitchTime, dt);
    this.roll = roll.value; this.rollVelocity = roll.velocity;
    this.trauma = Math.max(0, this.trauma - dt * c.shakeDecay); this.shakeTime += dt;
    const shake = c.shake ? this.trauma ** 2 * c.shakeIntensity : 0;
    const n1 = noise(this.shakeTime * 23, 1.7); const n2 = noise(this.shakeTime * 21, 4.3); const n3 = noise(this.shakeTime * 19, 7.1);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(this.lookAt);
    this.camera.rotateZ(this.roll + n3 * shake * c.shakeRoll);
    this.camera.rotateX(n2 * shake * c.shakeAngle); this.camera.rotateY(n1 * shake * c.shakeAngle);
    const fov = MathUtils.clamp(this.fov + this.fovPunch, 20, 140);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld(true);
  }
  private springVector(value: Vector3, velocity: Vector3, target: Vector3, time: number, dt: number): void {
    for (const axis of ['x', 'y', 'z'] as const) {
      const spring = criticalDamped(value[axis], velocity[axis], target[axis], time, dt);
      value[axis] = spring.value; velocity[axis] = spring.velocity;
    }
  }
  private openWallSide(subject: CameraSubject, world: CollisionWorld): number {
    const c = this.tuning.camera; const nx = this.normal.x; const nz = this.normal.z; const angle = c.wallAngle * DEG;
    const probeSide = (side: number): number => {
      const x = nx * Math.cos(angle) + nz * Math.sin(angle) * side; const z = nz * Math.cos(angle) - nx * Math.sin(angle) * side;
      const found = world.raycast(subject.position.x, subject.position.y + c.profiles.WALL.pivotHeight, subject.position.z, x, 0, z, c.wallProbeDistance, c.collisionRadius, this.probe);
      return found ? this.probe.t : c.wallProbeDistance;
    };
    return probeSide(1) >= probeSide(-1) ? 1 : -1;
  }
  private updateSprings(dt: number): void {
    const c = this.tuning.camera;
    for (let left = dt; left > 1e-6; left -= c.springStep) {
      const h = Math.min(left, c.springStep);
      this.dipVelocity += (-this.dipOffset * c.dipSpring - this.dipVelocity * c.dipDamping) * h; this.dipOffset += this.dipVelocity * h;
      this.fovPunchVelocity += (-this.fovPunch * c.punchSpring - this.fovPunchVelocity * c.punchDamping) * h; this.fovPunch += this.fovPunchVelocity * h;
    }
  }
  private updateShot(dt: number): number {
    const shot = this.shot;
    if (!shot) return 0;
    this.shotTime += dt;
    if (this.shotOut < 0 && this.shotTime >= shot.duration) this.shotOut = 0;
    let weight = smooth(Math.min(this.shotTime / Math.max(shot.blendIn, 0.001), 1));
    if (this.shotOut >= 0) {
      this.shotOut += dt; const out = Math.min(this.shotOut / Math.max(shot.blendOut, 0.001), 1);
      weight *= 1 - smooth(out);
      if (out >= 1) { this.shot = null; return 0; }
    }
    return weight;
  }
}
function noise(t: number, seed: number): number { return (Math.sin(t + seed) + Math.sin(t * 1.618 + seed * 2.3) * 0.6 + Math.sin(t * 2.71 + seed * 3.7) * 0.3) / 1.9; }
function easeOutCubic(x: number): number { return 1 - (1 - x) ** 3; }
function smooth(x: number): number { return x * x * (3 - 2 * x); }
