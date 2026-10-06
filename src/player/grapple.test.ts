import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { createAnchorResult, findAnchor } from './grapple';
import { makeWorld } from './simTestUtils';

/** A street running along Z with tall buildings on both sides. */
const canyon: Array<[number, number, number, number, number, number]> = [
  [-40, 0, -400, -12, 90, 400],
  [12, 0, -400, 40, 90, 400],
];

describe('findAnchor', () => {
  it('prefers points ahead and above while moving forward', () => {
    const out = createAnchorResult();
    const bob = new Vector3(0, 30, 0);
    expect(findAnchor(makeWorld(canyon), bob, new Vector3(0, 0, -20), 0, -1, 0, tuning.rope, out)).toBe(true);
    expect(out.point.z).toBeLessThan(-5);
    expect(out.point.y).toBeGreaterThan(bob.y + tuning.rope.minHeightAbove - 1e-6);
    expect(Math.abs(out.point.x)).toBe(12);
  });

  it('follows the travel direction, not just the camera', () => {
    const out = createAnchorResult();
    // Moving toward +Z while the camera looks toward −Z: the velocity wins.
    expect(findAnchor(makeWorld(canyon), new Vector3(0, 30, 0), new Vector3(0, 0, 25), 0, -1, 0, tuning.rope, out)).toBe(true);
    expect(out.point.z).toBeGreaterThan(5);
  });

  it('never picks anchors behind the body', () => {
    const out = createAnchorResult();
    const behind = makeWorld([[-30, 0, 20, 30, 90, 60]]);
    expect(findAnchor(behind, new Vector3(0, 30, 0), new Vector3(0, 0, -20), 0, -1, 0, tuning.rope, out)).toBe(false);
  });

  it('ignores points that are too close', () => {
    const out = createAnchorResult();
    const tiny = makeWorld([[-3, 0, -6, 3, 34, -2]]);
    expect(findAnchor(tiny, new Vector3(0, 30, 0), new Vector3(0, 0, -20), 0, -1, 0, tuning.rope, out)).toBe(false);
  });

  it('returns nothing when no building is in range', () => {
    const out = createAnchorResult();
    expect(findAnchor(makeWorld(), new Vector3(0, 30, 0), new Vector3(0, 0, -20), 0, -1, 0, tuning.rope, out)).toBe(false);
  });
});
