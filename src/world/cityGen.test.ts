import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { CollisionWorld } from './collision';
import { buildCollision, generateCity } from './cityGen';

describe('generateCity', () => {
  const city = generateCity(tuning.city);

  it('builds the same city from the same seed', () => {
    expect(generateCity(tuning.city)).toEqual(city);
  });

  it('builds a different city from a different seed', () => {
    expect(generateCity({ ...tuning.city, seed: 42 })).not.toEqual(city);
  });

  it('is at least 1 km across with hundreds of buildings', () => {
    expect(city.halfSize * 2).toBeGreaterThanOrEqual(1000);
    expect(city.buildings.length).toBeGreaterThan(200);
    expect(city.lanes.length).toBeGreaterThan(20);
    expect(city.lamps.length).toBeGreaterThan(100);
    expect(city.billboards.length).toBeGreaterThan(5);
  });

  it('keeps roads clear of buildings', () => {
    for (const b of city.buildings) {
      for (const r of city.roads) {
        const overlap =
          b.x - b.width / 2 < r.maxX && b.x + b.width / 2 > r.minX && b.z - b.depth / 2 < r.maxZ && b.z + b.depth / 2 > r.minZ;
        expect(overlap).toBe(false);
      }
    }
  });

  it('spawns on a roof at the end of the main avenue, below the corridor walls', () => {
    const { spawn } = city;
    const tower = city.buildings.find(
      (b) => Math.abs(spawn.x - b.x) < b.width / 2 && Math.abs(spawn.z - b.z) < b.depth / 2 && b.topY === spawn.y,
    );
    expect(tower).toBeDefined();
    // Buildings along the avenue just north of the tower rise above it, so ropes have anchors.
    const corridor = city.buildings.filter((b) => Math.abs(b.x) < 60 && b.z > spawn.z - 220 && b.z < spawn.z - 20);
    expect(corridor.length).toBeGreaterThan(4);
    expect(corridor.filter((b) => b.topY > spawn.y + 10).length).toBeGreaterThan(3);
  });

  it('turns into a collision world', () => {
    const world = new CollisionWorld();
    buildCollision(city, world);
    expect(world.boxes.length).toBeGreaterThan(city.buildings.length);
  });
});
