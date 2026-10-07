import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import {
  alignmentWeight,
  criticalDamped,
  frameDistance,
  GroundInputReference,
  groundAlignmentWeight,
  projectedBoxHeight,
  wallSafeDirection,
  wrapAngle,
} from './cameraMath';

const DEG = Math.PI / 180;

describe('reference camera math', () => {
  it('takes the shortest yaw path across the angle seam', () => {
    expect(wrapAngle(-179 * DEG - 179 * DEG)).toBeCloseTo(2 * DEG, 12);
    expect(wrapAngle(179 * DEG + 179 * DEG)).toBeCloseTo(-2 * DEG, 12);
  });

  it('reaches 95% of a 90 degree turn in the configured time at 30, 60 and 144 FPS', () => {
    const settleTime = 1.15;
    const target = Math.PI / 2;
    const times: number[] = [];
    for (const fps of [30, 60, 144]) {
      let value = 0;
      let velocity = 0;
      let elapsed = 0;
      while (value < target * 0.95 && elapsed < 3) {
        const next = criticalDamped(value, velocity, target, settleTime, 1 / fps);
        expect(next.value).toBeGreaterThanOrEqual(value);
        expect(next.value).toBeLessThanOrEqual(target);
        value = next.value;
        velocity = next.velocity;
        elapsed += 1 / fps;
      }
      expect(elapsed).toBeGreaterThanOrEqual(0.9);
      expect(elapsed).toBeLessThanOrEqual(1.4);
      expect(Math.abs(elapsed - settleTime)).toBeLessThanOrEqual(1 / fps + 1e-6);
      times.push(elapsed);
    }
    expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(1 / 30 + 1e-6);
  });

  it('matches the same elapsed time regardless of the integration frame rate', () => {
    const results = [30, 60, 144].map((fps) => {
      let value = 0;
      let velocity = 0;
      for (let frame = 0; frame < fps; frame++) {
        ({ value, velocity } = criticalDamped(value, velocity, Math.PI / 2, 1.15, 1 / fps));
      }
      return { value, velocity };
    });
    for (const result of results.slice(1)) {
      expect(result.value).toBeCloseTo(results[0].value, 10);
      expect(result.velocity).toBeCloseTo(results[0].velocity, 10);
    }
  });

  it('keeps automatic alignment off for the mouse hold, then ramps it over 0.4 seconds', () => {
    for (const idle of [0, 0.1, 0.4, 0.59, 0.6]) expect(alignmentWeight(idle, 0.6, 0.4)).toBe(0);
    const weights = [0.61, 0.7, 0.8, 0.9, 1].map((idle) => alignmentWeight(idle, 0.6, 0.4));
    expect(weights[0]).toBeGreaterThan(0);
    expect(weights[2]).toBeCloseTo(0.5, 8);
    expect(weights[4]).toBeCloseTo(1, 8);
    for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    expect(alignmentWeight(5, 0.6, 0.4)).toBe(1);
  });

  it('aligns forward and diagonal travel, reduces strafe assistance, and leaves reverse travel alone', () => {
    const camera = tuning.camera;
    expect(groundAlignmentWeight(0, camera)).toBe(1);
    expect(groundAlignmentWeight(45 * DEG, camera)).toBe(1);
    for (const angle of [60, 90, 120, -90]) {
      expect(groundAlignmentWeight(angle * DEG, camera)).toBeCloseTo(0.35, 8);
    }
    for (const angle of [136, 150, 180, -150, -180]) {
      expect(groundAlignmentWeight(angle * DEG, camera)).toBe(0);
    }
  });

  it('derives distance from the base FOV and respects arm limits', () => {
    const distance = frameDistance(1.8, 0.26, 68, 1, 80);
    expect(distance).toBeCloseTo(1.8 / (2 * 0.26 * Math.tan(34 * DEG)), 10);
    expect(frameDistance(1.8, 0.001, 68, 2, 40)).toBe(40);
    expect(frameDistance(1.8, 1, 68, 2, 40)).toBe(2);
  });

  it('measures the screen height of the projected bounding box, including its nearest face', () => {
    const camera = new PerspectiveCamera(68, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const bounds = new Box3(new Vector3(-0.35, -0.9, -0.35), new Vector3(0.35, 0.9, 0.35));
    const percent = projectedBoxHeight(camera, bounds);
    const nearestFacePercent = (100 * 0.9) / ((8 - 0.35) * Math.tan(34 * DEG));
    const centreLinePercent = (100 * 0.9) / (8 * Math.tan(34 * DEG));
    expect(percent).toBeCloseTo(nearestFacePercent, 8);
    expect(percent).toBeGreaterThan(centreLinePercent);
  });

  it('keeps the orbit outside the wall even when the mouse points behind it', () => {
    for (const normal of [new Vector3(1, 0, 0), new Vector3(0, 0, -1)]) {
      for (const direction of [normal.clone().negate(), new Vector3(0, 0.95, 0.3).normalize(), new Vector3(-1, -2, 1).normalize()]) {
        const safe = wallSafeDirection(direction, normal, 0.2);
        expect(safe.length()).toBeCloseTo(1, 8);
        expect(safe.dot(normal)).toBeGreaterThanOrEqual(0.2 - 1e-8);
      }
    }
  });

  it('never creates NaN from a missing wall direction or a stationary orbit', () => {
    for (const direction of [new Vector3(), new Vector3(0, 0, 1)]) {
      const safe = wallSafeDirection(direction, new Vector3(), 0.2);
      expect([safe.x, safe.y, safe.z].every(Number.isFinite)).toBe(true);
    }
    expect(projectedBoxHeight(new PerspectiveCamera(), new Box3())).toBe(0);
  });
});

describe('latched ground input reference', () => {
  it('keeps a held strafe on the same world line while automatic yaw turns', () => {
    const reference = new GroundInputReference();
    const firstYaw = reference.update(0, 1, true, true);
    const initialDirection = new Vector3(-Math.cos(firstYaw), 0, Math.sin(firstYaw));
    for (let frame = 1; frame <= 120; frame++) {
      const yaw = reference.update((Math.PI / 2) * (frame / 120), 1, true, true);
      const direction = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
      expect(direction.distanceTo(initialDirection)).toBeLessThan(1e-10);
    }
  });

  it('captures the current camera angle on key changes, release, and mouse movement', () => {
    const reference = new GroundInputReference();
    expect(reference.update(0, 1, true, true)).toBe(0);
    expect(reference.update(0.6, 1, true, true)).toBe(0);
    expect(reference.update(0.6, 3, true, true)).toBe(0.6);
    expect(reference.update(1.1, 0, true, true)).toBe(1.1);
    expect(reference.update(1.4, 1, true, true)).toBe(1.4);
    reference.look(1.7);
    expect(reference.update(1.8, 1, true, true)).toBe(1.7);
  });

  it('uses the live camera angle while airborne or when the latch is disabled', () => {
    const reference = new GroundInputReference();
    reference.update(0, 1, true, true);
    expect(reference.update(0.6, 1, true, false)).toBe(0.6);
    expect(reference.update(1.1, 1, false, true)).toBe(1.1);
  });
});
