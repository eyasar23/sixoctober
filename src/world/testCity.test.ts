import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { generateTestCity } from './testCity';

describe('generateTestCity', () => {
  it('builds the same city from the same seed', () => {
    expect(generateTestCity(42)).toEqual(generateTestCity(42));
  });

  it('builds a different city from a different seed', () => {
    expect(generateTestCity(42)).not.toEqual(generateTestCity(43));
  });

  it('creates about 30 buildings and keeps the spawn plaza empty', () => {
    const { buildings, windows } = generateTestCity(tuning.city.seed);
    expect(buildings.length).toBeGreaterThanOrEqual(25);
    expect(buildings.length).toBeLessThanOrEqual(35);
    expect(windows.length).toBeGreaterThan(0);
    for (const b of buildings) {
      // Distance from the origin to the nearest point of the footprint.
      const dx = Math.max(Math.abs(b.x) - b.width / 2, 0);
      const dz = Math.max(Math.abs(b.z) - b.depth / 2, 0);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(10);
    }
  });
});
