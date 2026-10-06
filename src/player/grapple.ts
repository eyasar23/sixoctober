import { Vector3 } from 'three';
import type { RopeTuning } from '../config/tuning';
import { ANCHORABLE, type Box, type CollisionWorld, createHit } from '../world/collision';

export interface AnchorResult {
  readonly point: Vector3;
  /** Outward normal of the facade the anchor sits on. */
  readonly normal: Vector3;
  box: Box | null;
  /** Rope length the swing reels in to, so its lowest point clears the street. */
  targetLength: number;
  /** Longest rope whose lowest point still clears the street, m. */
  maxLength: number;
  /** −1 = left of the travel direction, 1 = right. */
  side: number;
  score: number;
}

export function createAnchorResult(): AnchorResult {
  return { point: new Vector3(), normal: new Vector3(), box: null, targetLength: 0, maxLength: 0, side: 0, score: 0 };
}

interface Candidate {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  box: Box | null;
  targetLength: number;
  maxLength: number;
  side: number;
  score: number;
}

const MAX_CANDIDATES = 8;
const candidates: Candidate[] = Array.from({ length: MAX_CANDIDATES }, () => ({
  x: 0,
  y: 0,
  z: 0,
  nx: 0,
  nz: 0,
  box: null,
  targetLength: 0,
  maxLength: 0,
  side: 0,
  score: -Infinity,
}));
let candidateCount = 0;
const nearby: Box[] = [];
const hit = createHit();
const FACE_MARGIN = 0.6;

/**
 * Picks where the next rope attaches: a point on a building facade (or its top edge) that is
 * ahead in the travel direction, above the body, neither too close nor too far, with a clear
 * line of sight. Returns false when nothing in range qualifies.
 *
 * `bob` is the rope point on the body; `aimX/aimZ` the camera's horizontal look direction.
 */
export function findAnchor(
  world: CollisionWorld,
  bob: Vector3,
  velocity: Vector3,
  aimX: number,
  aimZ: number,
  lastSide: number,
  rope: RopeTuning,
  out: AnchorResult,
): boolean {
  const aimLength = Math.hypot(aimX, aimZ);
  const ax = aimLength > 1e-4 ? aimX / aimLength : 0;
  const az = aimLength > 1e-4 ? aimZ / aimLength : -1;
  let dirX = ax;
  let dirZ = az;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > 4) {
    const w = rope.aimWeight;
    dirX = (velocity.x / speed) * (1 - w) + ax * w;
    dirZ = (velocity.z / speed) * (1 - w) + az * w;
    const length = Math.hypot(dirX, dirZ);
    if (length > 1e-3) {
      dirX /= length;
      dirZ /= length;
    } else {
      dirX = ax;
      dirZ = az;
    }
  }

  const idealForward = Math.sqrt(Math.max(rope.idealDistance ** 2 - rope.idealHeight ** 2, 1));
  const idealX = bob.x + dirX * idealForward;
  const idealY = bob.y + rope.idealHeight;
  const idealZ = bob.z + dirZ * idealForward;
  const range = rope.maxRange;
  const minAnchorY = bob.y + rope.minHeightAbove;

  candidateCount = 0;
  for (const c of candidates) c.score = -Infinity;
  world.queryRect(bob.x - range, bob.z - range, bob.x + range, bob.z + range, nearby);

  for (const box of nearby) {
    if ((box.flags & ANCHORABLE) === 0) continue;
    const top = box.maxY - 0.4;
    if (top < minAnchorY) continue;
    for (let face = 0; face < 4; face++) {
      let nx = 0;
      let nz = 0;
      let outside: number;
      if (face === 0) {
        nx = 1;
        outside = bob.x - box.maxX;
      } else if (face === 1) {
        nx = -1;
        outside = box.minX - bob.x;
      } else if (face === 2) {
        nz = 1;
        outside = bob.z - box.maxZ;
      } else {
        nz = -1;
        outside = box.minZ - bob.z;
      }
      // The body must be in front of this facade, or the rope would pass through the building.
      if (outside < 0.5) continue;

      let cx: number;
      let cz: number;
      if (nx !== 0) {
        cx = nx > 0 ? box.maxX : box.minX;
        cz = clamp(idealZ, box.minZ + FACE_MARGIN, box.maxZ - FACE_MARGIN);
      } else {
        cz = nz > 0 ? box.maxZ : box.minZ;
        cx = clamp(idealX, box.minX + FACE_MARGIN, box.maxX - FACE_MARGIN);
      }
      const cy = clamp(idealY, Math.max(minAnchorY, box.minY + 1), top);

      const ox = cx - bob.x;
      const oy = cy - bob.y;
      const oz = cz - bob.z;
      const distance = Math.hypot(ox, oy, oz);
      if (distance < rope.minRange || distance > range) continue;
      const horizontal = Math.hypot(ox, oz);
      if (horizontal < 1e-3) continue;
      const forward = (ox * dirX + oz * dirZ) / horizontal;
      if (forward < rope.forwardMinDot) continue;

      // Shorten the rope if a full-length swing would scrape the street.
      const below = world.supportHeight(cx + nx * 1.5, cz + nz * 1.5, 0.3, 0.3, cy);
      const maxLength = cy - below - rope.swingClearance;
      const targetLength = Math.min(distance, maxLength);
      if (targetLength < rope.minRange * 0.8) continue;

      const side = dirX * oz - dirZ * ox > 0 ? 1 : -1;
      let score =
        forward * 1.2 +
        (1 - Math.min(Math.abs(distance - rope.idealDistance) / range, 1)) +
        (1 - Math.min(Math.abs(oy - rope.idealHeight) / rope.idealHeight, 1)) * 0.8 -
        ((distance - targetLength) / range) * 0.5;
      if (lastSide !== 0 && side !== lastSide) score += rope.sideAlternation;
      insertCandidate(cx, cy, cz, nx, nz, box, targetLength, maxLength, side, score);
    }
  }

  // Best first; the first one with a clear line of sight wins.
  const sorted = candidates.slice(0, candidateCount).sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    const ox = c.x - bob.x;
    const oy = c.y - bob.y;
    const oz = c.z - bob.z;
    const distance = Math.hypot(ox, oy, oz);
    if (world.raycast(bob.x, bob.y, bob.z, ox / distance, oy / distance, oz / distance, distance, 0, hit) && hit.t < distance - 0.5) {
      continue;
    }
    out.point.set(c.x, c.y, c.z);
    out.normal.set(c.nx, 0, c.nz);
    out.box = c.box;
    out.targetLength = c.targetLength;
    out.maxLength = c.maxLength;
    out.side = c.side;
    out.score = c.score;
    return true;
  }
  return false;
}

function insertCandidate(
  x: number,
  y: number,
  z: number,
  nx: number,
  nz: number,
  box: Box,
  targetLength: number,
  maxLength: number,
  side: number,
  score: number,
): void {
  let slot: Candidate | undefined;
  if (candidateCount < MAX_CANDIDATES) {
    slot = candidates[candidateCount++];
  } else {
    let worst = candidates[0];
    for (const c of candidates) if (c.score < (worst?.score ?? Infinity)) worst = c;
    if (!worst || worst.score >= score) return;
    slot = worst;
  }
  if (!slot) return;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.nx = nx;
  slot.nz = nz;
  slot.box = box;
  slot.targetLength = targetLength;
  slot.maxLength = maxLength;
  slot.side = side;
  slot.score = score;
}

export interface ZipTarget {
  /** Where the feet travel to. */
  readonly destination: Vector3;
  /** Where the rope hooks (drawn rope end). */
  readonly attach: Vector3;
  /** Outward normal of the surface that was hit. */
  readonly normal: Vector3;
  /** true: pop over the roof edge on arrival; false: stick to the wall. */
  perch: boolean;
  box: Box | null;
}

export function createZipTarget(): ZipTarget {
  return { destination: new Vector3(), attach: new Vector3(), normal: new Vector3(), perch: false, box: null };
}

/**
 * Zip target under the screen centre: a ray from the camera along its look direction.
 * Hitting a roof, or a wall close below its roof edge, perches on top; otherwise the hero
 * ends up stuck to the wall. `feet` is the body position, `bobHeight` the rope point above it.
 */
export function findZipTarget(
  world: CollisionWorld,
  aimOrigin: Vector3,
  aimDir: Vector3,
  feet: Vector3,
  rope: RopeTuning,
  bodyRadius: number,
  out: ZipTarget,
): boolean {
  const camToBody = aimOrigin.distanceTo(feet);
  const maxDistance = rope.zipRange + camToBody;
  if (!world.raycast(aimOrigin.x, aimOrigin.y, aimOrigin.z, aimDir.x, aimDir.y, aimDir.z, maxDistance, 0, hit, ANCHORABLE)) {
    return false;
  }
  const box = hit.box;
  if (!box) return false;
  const hx = aimOrigin.x + aimDir.x * hit.t;
  const hy = aimOrigin.y + aimDir.y * hit.t;
  const hz = aimOrigin.z + aimDir.z * hit.t;
  out.attach.set(hx, hy, hz);
  out.normal.set(hit.nx, hit.ny, hit.nz);
  out.box = box;

  if (hit.ny > 0.5) {
    // Roof: land on it.
    out.perch = true;
    out.destination.set(hx, box.maxY + 0.4, hz);
  } else if (box.maxY - hy <= rope.zipLedgeSnap) {
    // Just below a roof edge: fly to a point above the edge, then pop over it.
    out.perch = true;
    out.attach.y = box.maxY;
    out.destination.set(hx + hit.nx * (bodyRadius + 0.2), box.maxY + 0.4, hz + hit.nz * (bodyRadius + 0.2));
  } else {
    // Facade: stop against the wall, rope at chest height.
    out.perch = false;
    out.destination.set(hx + hit.nx * (bodyRadius + 0.15), hy - rope.bobHeight, hz + hit.nz * (bodyRadius + 0.15));
  }

  const distance = out.destination.distanceTo(feet);
  if (distance < rope.zipMinRange || distance > rope.zipRange) return false;
  // The straight path from the body must be clear (the camera may see past corners the body cannot).
  const ox = out.destination.x - feet.x;
  const oy = out.destination.y + rope.bobHeight - (feet.y + rope.bobHeight);
  const oz = out.destination.z - feet.z;
  if (
    world.raycast(feet.x, feet.y + rope.bobHeight, feet.z, ox / distance, oy / distance, oz / distance, distance, bodyRadius * 0.8, hit) &&
    hit.t < distance - 0.3
  ) {
    return false;
  }
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
