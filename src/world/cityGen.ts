import { palette } from '../config/palette';
import type { CityTuning } from '../config/tuning';
import { createRng, type Rng } from '../core/random';
import { ANCHORABLE, CLIMBABLE, CollisionWorld } from './collision';

/**
 * City v1 as pure data (no three.js): roads, blocks, buildings, roof props, street furniture,
 * traffic lanes and the spawn point. The same seed and options always give the same city.
 *
 * Layout: avenues run north–south (along Z) every `avenueSpacing`, streets east–west. The
 * central avenue (x = 0) is the main swinging corridor and ends at the spawn tower in the south;
 * the hero starts on that tower's roof looking north down the avenue toward the skyscrapers.
 */

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Road extends Rect {
  /** 'z': avenue running north–south. 'x': street running east–west. */
  axis: 'x' | 'z';
  /** Centre line across the road: x for avenues, z for streets. */
  center: number;
  width: number;
}

export interface Building {
  /** Footprint centre and size, m. */
  x: number;
  z: number;
  width: number;
  depth: number;
  baseY: number;
  topY: number;
  colorIndex: number;
  /** Feeds the facade shader's window pattern. */
  seed: number;
  litShare: number;
  /** Window grid style (0–2). */
  style: number;
  /** Lit shop band on the ground floor. */
  shops: boolean;
}

export type RoofPropKind = 'tank' | 'ac' | 'antenna';

export interface RoofProp {
  kind: RoofPropKind;
  /** Base centre on the roof. */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Lamp {
  x: number;
  z: number;
  /** Yaw of the arm (points over the road). */
  rotation: number;
}

export interface Sign {
  /** Centre of the blade sign. */
  x: number;
  y: number;
  z: number;
  /** Yaw: the sign's flat faces look along this direction ± 90°. */
  rotation: number;
  height: number;
  brand: number;
  color: number;
}

export interface Billboard {
  /** Centre of the screen, already pushed off the facade. */
  x: number;
  y: number;
  z: number;
  /** Yaw the screen faces. */
  rotation: number;
  width: number;
  height: number;
  pattern: number;
  colorA: number;
  colorB: number;
  brand: number;
}

export interface Lane {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cars: number;
  /** km/h. */
  speed: number;
  seed: number;
}

export interface CityData {
  seed: number;
  halfSize: number;
  roads: Road[];
  /** Raised sidewalk slabs (one per block). */
  blocks: Rect[];
  buildings: Building[];
  roofProps: RoofProp[];
  lamps: Lamp[];
  signs: Sign[];
  billboards: Billboard[];
  lanes: Lane[];
  spawn: { x: number; y: number; z: number; yaw: number };
}

/** Number of fictional brands in the i18n file (brand.0 …). */
export const BRAND_COUNT = 12;
export const BILLBOARD_PATTERNS = 5;
export const SLAB_HEIGHT = 0.15;
/** Low wall around every roof: below step height, so it is stepped over. */
export const PARAPET_HEIGHT = 0.35;
const PARAPET_THICKNESS = 0.3;
const SPAWN_TOWER = { minX: -24, maxX: 24, minZ: 476, maxZ: 516, height: 92 };
const RESERVED: Rect = { minX: -30, minZ: 466, maxX: 30, maxZ: 520 };
const AVENUE_LANES = [-9.5, -4, 4, 9.5];
const STREET_LANES = [-3.5, 3.5];

export function generateCity(options: CityTuning): CityData {
  const rng = createRng(options.seed);
  const h = options.halfSize;
  const city: CityData = {
    seed: options.seed,
    halfSize: h,
    roads: [],
    blocks: [],
    buildings: [],
    roofProps: [],
    lamps: [],
    signs: [],
    billboards: [],
    lanes: [],
    // Near the north edge, so the first frame looks straight down the main avenue.
    spawn: { x: 0, y: SPAWN_TOWER.height, z: SPAWN_TOWER.minZ + 1.8, yaw: 0 },
  };

  // Roads -------------------------------------------------------------------------------
  const avenueCount = Math.floor(h / options.avenueSpacing);
  for (let k = -avenueCount; k <= avenueCount; k++) {
    const x = k * options.avenueSpacing;
    const w = options.avenueRoad;
    const maxZ = k === 0 ? RESERVED.minZ + 4 : h;
    city.roads.push({ axis: 'z', center: x, width: w, minX: x - w / 2, maxX: x + w / 2, minZ: -h, maxZ });
  }
  const streetCount = Math.floor(h / options.streetSpacing - 0.5);
  for (let j = -streetCount - 1; j <= streetCount; j++) {
    const z = (j + 0.5) * options.streetSpacing;
    if (Math.abs(z) > h - 20) continue;
    const w = j === -1 ? options.boulevardRoad : options.streetRoad;
    city.roads.push({ axis: 'x', center: z, width: w, minX: -h, maxX: h, minZ: z - w / 2, maxZ: z + w / 2 });
  }

  // Blocks: everything between roads ------------------------------------------------------
  const avenues = city.roads.filter((r) => r.axis === 'z').sort((a, b) => a.center - b.center);
  const streets = city.roads.filter((r) => r.axis === 'x').sort((a, b) => a.center - b.center);
  const xBands = bands(avenues.map((r) => [r.minX, r.maxX] as const), h);
  const zBands = bands(streets.map((r) => [r.minZ, r.maxZ] as const), h);
  for (const [minX, maxX] of xBands) {
    for (const [minZ, maxZ] of zBands) city.blocks.push({ minX, minZ, maxX, maxZ });
  }
  // The central avenue stops at the spawn tower: fill the gap with a plaza slab.
  const central = avenues.find((r) => r.center === 0);
  if (central) city.blocks.push({ minX: central.minX, minZ: central.maxZ, maxX: central.maxX, maxZ: h });

  // Spawn tower --------------------------------------------------------------------------
  city.buildings.push({
    x: (SPAWN_TOWER.minX + SPAWN_TOWER.maxX) / 2,
    z: (SPAWN_TOWER.minZ + SPAWN_TOWER.maxZ) / 2,
    width: SPAWN_TOWER.maxX - SPAWN_TOWER.minX,
    depth: SPAWN_TOWER.maxZ - SPAWN_TOWER.minZ,
    baseY: 0,
    topY: SPAWN_TOWER.height,
    colorIndex: 3,
    seed: 17.3,
    litShare: 0.45,
    style: 1,
    shops: true,
  });

  // Buildings on lots ----------------------------------------------------------------------
  for (const block of city.blocks) {
    const inner = inset(block, options.sidewalk);
    const width = inner.maxX - inner.minX;
    const depth = inner.maxZ - inner.minZ;
    if (width < options.lotMin * 0.6 || depth < options.lotMin * 0.6) continue;
    const alongX = width >= depth;
    const lots = split(alongX ? width : depth, options, rng);
    const rows = rowsFor(alongX ? depth : width, options, rng);
    for (const [a0, a1] of lots) {
      for (const [b0, b1] of rows) {
        const lot: Rect = alongX
          ? { minX: inner.minX + a0, maxX: inner.minX + a1, minZ: inner.minZ + b0, maxZ: inner.minZ + b1 }
          : { minX: inner.minX + b0, maxX: inner.minX + b1, minZ: inner.minZ + a0, maxZ: inner.minZ + a1 };
        placeBuilding(city, block, lot, options, rng);
      }
    }
  }

  // Street lamps -------------------------------------------------------------------------------
  for (const road of city.roads) placeLamps(city, road, options, rng);

  // Billboards on tall facades facing an avenue ----------------------------------------------------
  placeBillboards(city, options, rng);

  // Traffic lanes ------------------------------------------------------------------------------------
  for (const road of city.roads) {
    const offsets = road.width >= options.avenueRoad ? AVENUE_LANES : STREET_LANES;
    // The main avenue's lanes run on into the spawn tower, so its cars appear from inside it.
    const laneMaxZ = road.axis === 'z' && road.center === 0 ? SPAWN_TOWER.minZ + 25 : road.maxZ;
    for (const offset of offsets) {
      const lane: Lane =
        road.axis === 'z'
          ? offset > 0 // right-hand traffic: east side drives north (−Z)
            ? { x0: road.center + offset, z0: laneMaxZ, x1: road.center + offset, z1: road.minZ, cars: 0, speed: 0, seed: 0 }
            : { x0: road.center + offset, z0: road.minZ, x1: road.center + offset, z1: laneMaxZ, cars: 0, speed: 0, seed: 0 }
          : offset > 0 // south side drives east (+X)
            ? { x0: road.minX, z0: road.center + offset, x1: road.maxX, z1: road.center + offset, cars: 0, speed: 0, seed: 0 }
            : { x0: road.maxX, z0: road.center + offset, x1: road.minX, z1: road.center + offset, cars: 0, speed: 0, seed: 0 };
      const length = Math.hypot(lane.x1 - lane.x0, lane.z1 - lane.z0);
      lane.cars = Math.max(1, Math.round((length / 1000) * options.carsPerKm * rng.range(0.7, 1.3)));
      lane.speed = rng.range(36, 62);
      lane.seed = rng.next() * 1000;
      city.lanes.push(lane);
    }
  }

  return city;
}

/** The four low walls around a building's roof as [minX, minY, minZ, maxX, maxY, maxZ]. */
export function parapets(b: Building): Array<[number, number, number, number, number, number]> {
  const x0 = b.x - b.width / 2;
  const x1 = b.x + b.width / 2;
  const z0 = b.z - b.depth / 2;
  const z1 = b.z + b.depth / 2;
  const y0 = b.topY;
  const y1 = b.topY + PARAPET_HEIGHT;
  const t = PARAPET_THICKNESS;
  return [
    [x0, y0, z0, x1, y1, z0 + t],
    [x0, y0, z1 - t, x1, y1, z1],
    [x0, y0, z0 + t, x0 + t, y1, z1 - t],
    [x1 - t, y0, z0 + t, x1, y1, z1 - t],
  ];
}

/** Fills a collision world with the city's solid parts. */
export function buildCollision(city: CityData, world: CollisionWorld): void {
  for (const b of city.buildings) {
    world.addBox(b.x - b.width / 2, b.baseY, b.z - b.depth / 2, b.x + b.width / 2, b.topY, b.z + b.depth / 2, ANCHORABLE | CLIMBABLE);
    for (const [x0, y0, z0, x1, y1, z1] of parapets(b)) world.addBox(x0, y0, z0, x1, y1, z1, 0);
  }
  for (const s of city.blocks) world.addBox(s.minX, 0, s.minZ, s.maxX, SLAB_HEIGHT, s.maxZ, 0);
  for (const p of city.roofProps) {
    if (p.kind === 'antenna') continue;
    const flags = p.kind === 'tank' ? ANCHORABLE | CLIMBABLE : CLIMBABLE;
    world.addBox(p.x - p.sx / 2, p.y, p.z - p.sz / 2, p.x + p.sx / 2, p.y + p.sy, p.z + p.sz / 2, flags);
  }
  // Invisible walls keep the hero inside the city.
  const h = city.halfSize;
  const t = 20;
  const top = 2000;
  world.addBox(-h - t, 0, -h - t, h + t, top, -h, 0);
  world.addBox(-h - t, 0, h, h + t, top, h + t, 0);
  world.addBox(-h - t, 0, -h, -h, top, h, 0);
  world.addBox(h, 0, -h, h + t, top, h, 0);
}

// -------------------------------------------------------------------------------------------

/** Intervals of [−h, h] not covered by the given (sorted) road spans. */
function bands(roads: ReadonlyArray<readonly [number, number]>, h: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let cursor = -h;
  for (const [min, max] of roads) {
    if (min - cursor > 1) result.push([cursor, min]);
    cursor = Math.max(cursor, max);
  }
  if (h - cursor > 1) result.push([cursor, h]);
  return result;
}

function inset(r: Rect, amount: number): Rect {
  return { minX: r.minX + amount, minZ: r.minZ + amount, maxX: r.maxX - amount, maxZ: r.maxZ - amount };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Splits a length into lots with occasional alleys. */
function split(length: number, o: CityTuning, rng: Rng): Array<[number, number]> {
  const lots: Array<[number, number]> = [];
  let cursor = 0;
  while (length - cursor >= o.lotMin * 0.8) {
    let w = rng.range(o.lotMin, o.lotMax);
    if (length - cursor - w < o.lotMin * 0.8) w = length - cursor;
    lots.push([cursor, cursor + w]);
    cursor += w;
    if (rng.chance(o.alleyChance)) cursor += rng.range(3, 6);
  }
  return lots;
}

function rowsFor(depth: number, o: CityTuning, rng: Rng): Array<[number, number]> {
  if (depth < o.lotMin * 2 + 4) return [[0, depth]];
  const cut = depth * rng.range(0.42, 0.58);
  const alley = rng.chance(o.alleyChance) ? rng.range(3, 5) : 0;
  return [
    [0, cut - alley / 2],
    [cut + alley / 2, depth],
  ];
}

function heightFor(x: number, z: number, o: CityTuning, rng: Rng): number {
  const d = Math.hypot(x, z) / o.halfSize;
  const t = 1 - smoothstep(0.08, 0.95, d);
  let height = (o.edgeHeight + (o.centerHeight - o.edgeHeight) * t ** 1.6) * rng.range(0.55, 1.3);
  if (rng.chance(o.towerChance * t)) height *= 1.6;
  // The main avenue is a canyon of tall walls: the swinging corridor.
  if (Math.abs(x) < 120) height = Math.max(height, o.corridorHeight * rng.range(0.9, 1.4));
  // The boulevard (south of the centre) gets a lower corridor of its own.
  if (Math.abs(z + 50) < 70) height = Math.max(height, o.corridorHeight * 0.6 * rng.range(0.85, 1.25));
  return Math.min(Math.max(height, 12), 320);
}

function placeBuilding(city: CityData, block: Rect, lot: Rect, o: CityTuning, rng: Rng): void {
  const fp: Rect = {
    minX: lot.minX + rng.range(0, 1.5),
    maxX: lot.maxX - rng.range(0, 1.5),
    minZ: lot.minZ + rng.range(0, 1.5),
    maxZ: lot.maxZ - rng.range(0, 1.5),
  };
  if (fp.maxX - fp.minX < 9 || fp.maxZ - fp.minZ < 9) return;
  if (overlaps(fp, RESERVED)) return;
  const cx = (fp.minX + fp.maxX) / 2;
  const cz = (fp.minZ + fp.maxZ) / 2;
  const height = heightFor(cx, cz, o, rng);
  const colorIndex = rng.index(palette.buildings.length);
  const litShare = rng.range(o.litMin, o.litMax);
  const style = rng.index(3);
  const seed = rng.next() * 1000;

  // Stepped towers: each tier narrower than the one below.
  const tiers = height > 90 && rng.chance(o.tierChance) ? (height > 180 ? 3 : 2) : 1;
  let tier = fp;
  let baseY = 0;
  const splits = tiers === 1 ? [1] : tiers === 2 ? [rng.range(0.5, 0.68), 1] : [rng.range(0.4, 0.55), rng.range(0.72, 0.85), 1];
  for (let i = 0; i < tiers; i++) {
    const topY = Math.round(height * (splits[i] ?? 1));
    city.buildings.push({
      x: (tier.minX + tier.maxX) / 2,
      z: (tier.minZ + tier.maxZ) / 2,
      width: tier.maxX - tier.minX,
      depth: tier.maxZ - tier.minZ,
      baseY,
      topY,
      colorIndex,
      seed: seed + i * 13.7,
      litShare,
      style,
      shops: i === 0 && rng.chance(0.75),
    });
    if (i === tiers - 1) placeRoofProps(city, tier, topY, o, rng);
    baseY = topY;
    const w = tier.maxX - tier.minX;
    const d = tier.maxZ - tier.minZ;
    const nw = w * rng.range(0.68, 0.84);
    const nd = d * rng.range(0.68, 0.84);
    const ox = (w - nw) * rng.range(0.25, 0.75);
    const oz = (d - nd) * rng.range(0.25, 0.75);
    tier = { minX: tier.minX + ox, maxX: tier.minX + ox + nw, minZ: tier.minZ + oz, maxZ: tier.minZ + oz + nd };
  }

  if (rng.chance(o.signChance) && height > 14) placeSign(city, block, fp, height, rng);
}

function placeRoofProps(city: CityData, roof: Rect, y: number, o: CityTuning, rng: Rng): void {
  const placed: Rect[] = [];
  const tryPlace = (kind: RoofPropKind, sx: number, sy: number, sz: number): void => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = rng.range(roof.minX + sx / 2 + 1.5, roof.maxX - sx / 2 - 1.5);
      const z = rng.range(roof.minZ + sz / 2 + 1.5, roof.maxZ - sz / 2 - 1.5);
      if (!Number.isFinite(x) || !Number.isFinite(z) || roof.maxX - roof.minX < sx + 3 || roof.maxZ - roof.minZ < sz + 3) return;
      const r: Rect = { minX: x - sx / 2 - 0.8, maxX: x + sx / 2 + 0.8, minZ: z - sz / 2 - 0.8, maxZ: z + sz / 2 + 0.8 };
      if (placed.some((p) => overlaps(p, r))) continue;
      placed.push(r);
      city.roofProps.push({ kind, x, y, z, sx, sy, sz });
      return;
    }
  };
  if (y >= o.antennaMinHeight) {
    const count = 1 + rng.index(3);
    for (let i = 0; i < count; i++) tryPlace('antenna', 0.6, rng.range(10, 28), 0.6);
  }
  if (y < 170 && rng.chance(o.waterTankChance)) {
    const r = rng.range(2, 2.8);
    tryPlace('tank', r * 2, rng.range(6, 8), r * 2);
  }
  if (rng.chance(o.acChance)) {
    const count = 1 + rng.index(4);
    for (let i = 0; i < count; i++) tryPlace('ac', rng.range(1.8, 2.6), rng.range(1, 1.5), rng.range(1.4, 2.2));
  }
}

/** A vertical neon blade sign on the facade nearest a street. */
function placeSign(city: CityData, block: Rect, fp: Rect, height: number, rng: Rng): void {
  const gaps = [fp.minX - block.minX, block.maxX - fp.maxX, fp.minZ - block.minZ, block.maxZ - fp.maxZ];
  const side = gaps.indexOf(Math.min(...gaps));
  const signHeight = rng.range(4, 8);
  const y = Math.min(rng.range(6, 16), height - signHeight / 2 - 2);
  if (y - signHeight / 2 < 4.5) return;
  const out = 0.75;
  const along = rng.chance(0.5) ? 0.15 : 0.85;
  let x: number;
  let z: number;
  let rotation: number;
  if (side === 0 || side === 1) {
    x = side === 0 ? fp.minX - out : fp.maxX + out;
    z = fp.minZ + (fp.maxZ - fp.minZ) * along;
    rotation = 0;
  } else {
    z = side === 2 ? fp.minZ - out : fp.maxZ + out;
    x = fp.minX + (fp.maxX - fp.minX) * along;
    rotation = Math.PI / 2;
  }
  city.signs.push({ x, y, z, rotation, height: signHeight, brand: rng.index(BRAND_COUNT), color: rng.index(palette.neon.length) });
}

function placeLamps(city: CityData, road: Road, o: CityTuning, rng: Rng): void {
  const crossing = city.roads.filter((r) => r.axis !== road.axis);
  const length = road.axis === 'z' ? road.maxZ - road.minZ : road.maxX - road.minX;
  const start = road.axis === 'z' ? road.minZ : road.minX;
  const phase = rng.range(0, o.lampSpacing);
  for (let s = phase; s < length; s += o.lampSpacing) {
    const along = start + s;
    for (const sideSign of [-1, 1]) {
      const across = road.center + sideSign * (road.width / 2 + 1);
      const x = road.axis === 'z' ? across : along;
      const z = road.axis === 'z' ? along : across;
      const inCrossing = crossing.some((r) => x > r.minX - 4 && x < r.maxX + 4 && z > r.minZ - 4 && z < r.maxZ + 4);
      if (inCrossing || pointIn(RESERVED, x, z) || Math.abs(x) > city.halfSize - 2 || Math.abs(z) > city.halfSize - 2) continue;
      // The arm reaches over the road.
      const rotation = road.axis === 'z' ? (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2) : sideSign > 0 ? 0 : Math.PI;
      city.lamps.push({ x, z, rotation });
    }
  }
}

function placeBillboards(city: CityData, o: CityTuning, rng: Rng): void {
  const avenues = city.roads.filter((r) => r.axis === 'z');
  const candidates: Array<{ b: Building; face: number }> = [];
  for (const b of city.buildings) {
    if (b.baseY !== 0 || b.topY < 60 || b.width < 18 || b.depth < 18) continue;
    const minX = b.x - b.width / 2;
    const maxX = b.x + b.width / 2;
    for (const a of avenues) {
      if (b.z + b.depth / 2 < a.minZ || b.z - b.depth / 2 > a.maxZ) continue;
      if (minX - a.maxX > 0 && minX - a.maxX < o.sidewalk + 4) candidates.push({ b, face: -1 });
      if (a.minX - maxX > 0 && a.minX - maxX < o.sidewalk + 4) candidates.push({ b, face: 1 });
    }
  }
  const count = Math.min(o.billboardCount, candidates.length);
  for (let i = 0; i < count; i++) {
    const pick = candidates.splice(rng.index(candidates.length), 1)[0];
    if (!pick) break;
    const { b, face } = pick;
    const width = Math.min(b.depth - 4, rng.range(16, 30));
    const height = width * rng.range(0.42, 0.6);
    const top = Math.min(b.topY - height / 2 - 4, 110);
    const y = rng.range(Math.max(26, height / 2 + 12), Math.max(top, height / 2 + 12.5));
    const x = face < 0 ? b.x - b.width / 2 - 0.3 : b.x + b.width / 2 + 0.3;
    city.billboards.push({
      x,
      y,
      z: b.z + rng.range(-1, 1) * Math.max(0, (b.depth - width) / 2 - 1),
      rotation: face < 0 ? -Math.PI / 2 : Math.PI / 2,
      width,
      height,
      pattern: rng.index(BILLBOARD_PATTERNS),
      colorA: rng.index(palette.neon.length),
      colorB: rng.index(palette.neon.length),
      brand: rng.index(BRAND_COUNT),
    });
  }
}

function pointIn(r: Rect, x: number, z: number): boolean {
  return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
