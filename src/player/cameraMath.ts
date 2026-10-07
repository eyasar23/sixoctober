import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { CameraTuning } from '../config/tuning';

export const DEG = Math.PI / 180;
const SETTLE_95 = 4.743864518;

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Exact critically damped spring; settle95Time is the time to close 95% of a step. */
export function criticalDamped(current: number, velocity: number, target: number, settle95Time: number, dt: number): { value: number; velocity: number } {
  const omega = SETTLE_95 / Math.max(settle95Time, 0.001);
  const error = current - target;
  const coefficient = velocity + omega * error;
  const decay = Math.exp(-omega * Math.max(0, dt));
  return { value: target + (error + coefficient * dt) * decay, velocity: (velocity - omega * coefficient * dt) * decay };
}

export function alignmentWeight(mouseIdle: number, hold: number, ramp: number): number {
  const x = MathUtils.clamp((mouseIdle - hold) / Math.max(ramp, 0.001), 0, 1);
  return x * x * (3 - 2 * x);
}

export function groundAlignmentWeight(relativeAngle: number, c: CameraTuning): number {
  const degrees = Math.abs(wrapAngle(relativeAngle)) / DEG;
  if (degrees > c.backwardAngle) return 0;
  return degrees >= c.strafeStart - 1e-9 && degrees <= c.strafeEnd + 1e-9 ? c.strafeWeight : 1;
}

/** Base FOV only: widening the lens at speed is deliberately not cancelled by the arm. */
export function frameDistance(height: number, frameHeight: number, fovBase: number, min: number, max: number): number {
  return MathUtils.clamp(height / (2 * Math.max(frameHeight, 0.001) * Math.tan(fovBase * DEG / 2)), min, max);
}

/** Minimum yaw bias that includes an attacker, accounting for the arm's parallax. */
export function combatFramingYaw(baseYaw: number, hero: Vector3, enemy: Vector3, arm: number, pitch: number, fov: number, aspect: number, minBias: number, margin: number): number {
  const dx = enemy.x - hero.x;
  const dz = enemy.z - hero.z;
  const delta = wrapAngle(Math.atan2(-dx, -dz) - baseYaw);
  const halfFov = Math.atan(Math.tan(fov * DEG / 2) * aspect) * margin;
  const horizontalArm = arm * Math.cos(pitch);
  const visible = (bias: number): boolean => {
    const yaw = baseYaw + delta * bias;
    const ex = dx - Math.sin(yaw) * horizontalArm;
    const ez = dz - Math.cos(yaw) * horizontalArm;
    const depth = -ex * Math.sin(yaw) - ez * Math.cos(yaw);
    const side = ex * Math.cos(yaw) - ez * Math.sin(yaw);
    return depth > 0 && Math.abs(Math.atan2(side, depth)) <= halfFov;
  };
  let low = MathUtils.clamp(minBias, 0, 1);
  if (visible(low)) return baseYaw + delta * low;
  let high = 1;
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;
    if (visible(middle)) high = middle;
    else low = middle;
  }
  return baseYaw + delta * high;
}

const corner = new Vector3();
/** Percentage of viewport height covered by the projected world-space bounding box. */
export function projectedBoxHeight(camera: PerspectiveCamera, bounds: Box3): number {
  if (bounds.isEmpty()) return 0;
  camera.updateMatrixWorld(true);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    if (corner.z >= -camera.near) return 0;
    corner.applyMatrix4(camera.projectionMatrix);
    low = Math.min(low, corner.y);
    high = Math.max(high, corner.y);
  }
  return Number.isFinite(high - low) ? (high - low) * 50 : 0;
}

/** Clamp an orbital direction to the outside cone, preserving its vertical pitch. */
export function wallSafeDirection(direction: Vector3, normal: Vector3, minDot: number): Vector3 {
  const length = Math.hypot(normal.x, normal.z);
  if (length < 1e-6) return direction;
  direction.normalize();
  const nx = normal.x / length;
  const nz = normal.z / length;
  const horizontal = Math.hypot(direction.x, direction.z);
  const required = Math.min(Math.max(minDot, 0), horizontal);
  const dot = direction.x * nx + direction.z * nz;
  if (dot >= required) return direction;
  const side = direction.x * nz - direction.z * nx >= 0 ? 1 : -1;
  const tangent = Math.sqrt(Math.max(0, horizontal * horizontal - required * required)) * side;
  direction.x = nx * required + nz * tangent;
  direction.z = nz * required - nx * tangent;
  return direction;
}

/** A held ground key chord keeps the camera yaw that existed when it started. */
export class GroundInputReference {
  private yaw = 0;
  private mask = -1;
  private grounded = false;
  private enabled = false;

  update(yaw: number, keyMask: number, enabled: boolean, grounded: boolean): number {
    if (!enabled || !grounded || keyMask !== this.mask || grounded !== this.grounded || enabled !== this.enabled) this.yaw = yaw;
    this.mask = keyMask;
    this.grounded = grounded;
    this.enabled = enabled;
    return this.yaw;
  }

  look(yaw: number): void {
    this.yaw = yaw;
  }
}
