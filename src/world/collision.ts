/**
 * Static collision world: axis-aligned boxes (buildings, tiers, slabs, roof props) plus a
 * ground plane. A uniform XZ grid keeps every query local. Pure math, no three.js, so the
 * movement simulation can run (and be tested) without a renderer.
 */

/** Rope and zip may attach to this box. */
export const ANCHORABLE = 1;
/** Wall run and wall climb are allowed on this box. */
export const CLIMBABLE = 2;
/** Its top edges are ledges the hero can launch onto and perch on (E). */
export const PERCHABLE = 4;

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  flags: number;
  /** Index in CollisionWorld.boxes. */
  id: number;
}

export interface Hit {
  /** Sweep: fraction of the move in [0, 1]. Raycast: distance along the ray. */
  t: number;
  nx: number;
  ny: number;
  nz: number;
  /** null when the ground plane was hit. */
  box: Box | null;
}

export interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}

export function createHit(): Hit {
  return { t: 0, nx: 0, ny: 0, nz: 0, box: null };
}

const PARALLEL_EPS = 1e-12;

export class CollisionWorld {
  readonly boxes: Box[] = [];
  private readonly cells = new Map<number, Box[]>();
  private stamps = new Uint32Array(256);
  private stamp = 0;
  private readonly scratch: Box[] = [];

  constructor(
    readonly cellSize = 32,
    readonly groundY = 0,
  ) {}

  addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, flags: number): Box {
    const box: Box = { minX, minY, minZ, maxX, maxY, maxZ, flags, id: this.boxes.length };
    this.boxes.push(box);
    if (this.stamps.length < this.boxes.length) {
      const grown = new Uint32Array(this.stamps.length * 2);
      grown.set(this.stamps);
      this.stamps = grown;
    }
    const x0 = Math.floor(minX / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const z0 = Math.floor(minZ / this.cellSize);
    const z1 = Math.floor(maxZ / this.cellSize);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = cellKey(ix, iz);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(box);
      }
    }
    return box;
  }

  /** Boxes whose XZ footprint overlaps the rectangle, written into `out`. */
  queryRect(minX: number, minZ: number, maxX: number, maxZ: number, out: Box[]): Box[] {
    out.length = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    const x0 = Math.floor(minX / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const z0 = Math.floor(minZ / this.cellSize);
    const z1 = Math.floor(maxZ / this.cellSize);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.cells.get(cellKey(ix, iz));
        if (!cell) continue;
        for (const box of cell) {
          if (this.stamps[box.id] === this.stamp) continue;
          this.stamps[box.id] = this.stamp;
          if (box.maxX < minX || box.minX > maxX || box.maxZ < minZ || box.minZ > maxZ) continue;
          out.push(box);
        }
      }
    }
    return out;
  }

  /**
   * Moves an AABB (centre c, half extents h) by d and reports the first contact.
   * Boxes the AABB already overlaps are ignored; call depenetrate() for those.
   */
  sweep(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    dx: number,
    dy: number,
    dz: number,
    hit: Hit,
  ): boolean {
    let best = Infinity;
    if (dy < 0) {
      const bottom = cy - hy;
      if (bottom >= this.groundY - 1e-6) {
        const t = (this.groundY - bottom) / dy;
        if (t >= 0 && t <= 1) {
          best = t;
          setHit(hit, t, 0, 1, 0, null);
        }
      }
    }
    const boxes = this.queryRect(
      Math.min(cx, cx + dx) - hx,
      Math.min(cz, cz + dz) - hz,
      Math.max(cx, cx + dx) + hx,
      Math.max(cz, cz + dz) + hz,
      this.scratch,
    );
    for (const box of boxes) {
      const t = slab(
        cx,
        cy,
        cz,
        dx,
        dy,
        dz,
        box.minX - hx,
        box.minY - hy,
        box.minZ - hz,
        box.maxX + hx,
        box.maxY + hy,
        box.maxZ + hz,
        true,
      );
      if (t === null || t > 1 || t >= best) continue;
      best = t;
      setHit(hit, t, slabNormal[0], slabNormal[1], slabNormal[2], box);
    }
    return best !== Infinity;
  }

  /**
   * Ray against boxes inflated by `inflate` (a cheap sphere cast) and the ground.
   * `dir` must be normalised; hit.t is the distance.
   */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDist: number,
    inflate: number,
    hit: Hit,
    flagsRequired = 0,
  ): boolean {
    let best = Infinity;
    if (dirY < 0) {
      const t = (this.groundY + inflate - oy) / dirY;
      if (t >= 0 && t <= maxDist) {
        best = t;
        setHit(hit, t, 0, 1, 0, null);
      }
    }
    const ex = dirX * maxDist;
    const ez = dirZ * maxDist;
    const boxes = this.queryRect(
      Math.min(ox, ox + ex) - inflate,
      Math.min(oz, oz + ez) - inflate,
      Math.max(ox, ox + ex) + inflate,
      Math.max(oz, oz + ez) + inflate,
      this.scratch,
    );
    for (const box of boxes) {
      if ((box.flags & flagsRequired) !== flagsRequired) continue;
      const t = slab(
        ox,
        oy,
        oz,
        dirX * maxDist,
        dirY * maxDist,
        dirZ * maxDist,
        box.minX - inflate,
        box.minY - inflate,
        box.minZ - inflate,
        box.maxX + inflate,
        box.maxY + inflate,
        box.maxZ + inflate,
        false,
      );
      if (t === null) continue;
      const distance = t * maxDist;
      if (distance > maxDist || distance >= best) continue;
      best = distance;
      setHit(hit, distance, slabNormal[0], slabNormal[1], slabNormal[2], box);
    }
    return best !== Infinity;
  }

  /** First box the AABB overlaps (touching does not count), or null. */
  overlaps(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box | null {
    if (cy - hy < this.groundY - 1e-4) return null;
    const boxes = this.queryRect(cx - hx, cz - hz, cx + hx, cz + hz, this.scratch);
    for (const box of boxes) {
      if (
        cx + hx > box.minX &&
        cx - hx < box.maxX &&
        cy + hy > box.minY &&
        cy - hy < box.maxY &&
        cz + hz > box.minZ &&
        cz - hz < box.maxZ
      ) {
        return box;
      }
    }
    return null;
  }

  /** Pushes an AABB out of every box (and the ground) it overlaps, smallest axis first. */
  depenetrate(c: MutableVec3, hx: number, hy: number, hz: number): boolean {
    let moved = false;
    if (c.y - hy < this.groundY) {
      c.y = this.groundY + hy;
      moved = true;
    }
    for (let iteration = 0; iteration < 4; iteration++) {
      const box = this.overlaps(c.x, c.y, c.z, hx, hy, hz);
      if (!box) break;
      const px0 = c.x + hx - box.minX;
      const px1 = box.maxX - (c.x - hx);
      const py0 = c.y + hy - box.minY;
      const py1 = box.maxY - (c.y - hy);
      const pz0 = c.z + hz - box.minZ;
      const pz1 = box.maxZ - (c.z - hz);
      // A box standing on the ground cannot be left downward (that would push through the street).
      const down = box.minY <= this.groundY + 1e-3 ? Infinity : py0;
      const smallest = Math.min(px0, px1, down, py1, pz0, pz1);
      const skin = 1e-3;
      if (smallest === py1) c.y += py1 + skin;
      else if (smallest === px0) c.x -= px0 + skin;
      else if (smallest === px1) c.x += px1 + skin;
      else if (smallest === pz0) c.z -= pz0 + skin;
      else if (smallest === pz1) c.z += pz1 + skin;
      else c.y -= py0 + skin;
      moved = true;
    }
    return moved;
  }

  /** Highest surface under the XZ footprint whose top is at or below `maxY`; at least the ground. */
  supportHeight(x: number, z: number, hx: number, hz: number, maxY: number): number {
    let best = this.groundY;
    const boxes = this.queryRect(x - hx, z - hz, x + hx, z + hz, this.scratch);
    for (const box of boxes) {
      if (box.maxY > maxY + 1e-3 || box.maxY <= best) continue;
      if (x + hx <= box.minX || x - hx >= box.maxX || z + hz <= box.minZ || z - hz >= box.maxZ) continue;
      best = box.maxY;
    }
    return best;
  }
}

function cellKey(ix: number, iz: number): number {
  return (ix + 32768) * 65536 + (iz + 32768);
}

function setHit(hit: Hit, t: number, nx: number, ny: number, nz: number, box: Box | null): void {
  hit.t = t;
  hit.nx = nx;
  hit.ny = ny;
  hit.nz = nz;
  hit.box = box;
}

/** Normal of the face entered by the last slab() call. */
const slabNormal = [0, 0, 0];

/**
 * Segment p + s·d (s in [0, 1]) against a box. Returns the entry fraction or null.
 * With `skipInside`, a start inside the box is not a hit (resolved elsewhere).
 */
function slab(
  px: number,
  py: number,
  pz: number,
  dx: number,
  dy: number,
  dz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  skipInside: boolean,
): number | null {
  if (px > x0 && px < x1 && py > y0 && py < y1 && pz > z0 && pz < z1) {
    if (skipInside) return null;
    slabNormal[0] = 0;
    slabNormal[1] = 0;
    slabNormal[2] = 0;
    return 0;
  }
  let enter = -Infinity;
  let exit = Infinity;
  let axis = -1;
  let sign = 0;

  if (Math.abs(dx) < PARALLEL_EPS) {
    if (px <= x0 || px >= x1) return null;
  } else {
    let t0 = (x0 - px) / dx;
    let t1 = (x1 - px) / dx;
    let s = -1;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      s = 1;
    }
    if (t0 > enter) {
      enter = t0;
      axis = 0;
      sign = s;
    }
    if (t1 < exit) exit = t1;
  }
  if (Math.abs(dy) < PARALLEL_EPS) {
    if (py <= y0 || py >= y1) return null;
  } else {
    let t0 = (y0 - py) / dy;
    let t1 = (y1 - py) / dy;
    let s = -1;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      s = 1;
    }
    if (t0 > enter) {
      enter = t0;
      axis = 1;
      sign = s;
    }
    if (t1 < exit) exit = t1;
  }
  if (Math.abs(dz) < PARALLEL_EPS) {
    if (pz <= z0 || pz >= z1) return null;
  } else {
    let t0 = (z0 - pz) / dz;
    let t1 = (z1 - pz) / dz;
    let s = -1;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      s = 1;
    }
    if (t0 > enter) {
      enter = t0;
      axis = 2;
      sign = s;
    }
    if (t1 < exit) exit = t1;
  }
  if (axis < 0 || enter > exit || exit < 0 || enter < -1e-9) return null;
  slabNormal[0] = axis === 0 ? sign : 0;
  slabNormal[1] = axis === 1 ? sign : 0;
  slabNormal[2] = axis === 2 ? sign : 0;
  return Math.max(enter, 0);
}
