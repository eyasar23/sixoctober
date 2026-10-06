import type { Box, CollisionWorld, Hit } from '../world/collision';
import { createHit } from '../world/collision';

/** Gap kept between the body and surfaces so the next sweep does not start inside them, m. */
export const SKIN = 0.002;

export interface BodyShape {
  /** Half width (x and z), m. */
  halfWidth: number;
  /** Half height, m. The body's origin is at its feet. */
  halfHeight: number;
}

export interface MoveContacts {
  ground: boolean;
  ceiling: boolean;
  wall: boolean;
  wallNx: number;
  wallNz: number;
  wallBox: Box | null;
  stepped: boolean;
}

export function createContacts(): MoveContacts {
  return { ground: false, ceiling: false, wall: false, wallNx: 0, wallNz: 0, wallBox: null, stepped: false };
}

const hit: Hit = createHit();
const centre = { x: 0, y: 0, z: 0 };

/**
 * Swept collide-and-slide: moves `feet` by `velocity * dt` without ever passing through a
 * box, slides along surfaces it touches and removes the velocity that points into them.
 * With `stepHeight > 0`, ledges up to that height (kerbs, slabs) are climbed automatically.
 */
export function moveAndSlide(
  world: CollisionWorld,
  feet: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
  shape: BodyShape,
  stepHeight: number,
  contacts: MoveContacts,
): void {
  contacts.ground = false;
  contacts.ceiling = false;
  contacts.wall = false;
  contacts.wallBox = null;
  contacts.stepped = false;

  const hx = shape.halfWidth;
  const hy = shape.halfHeight;
  centre.x = feet.x;
  centre.y = feet.y + hy;
  centre.z = feet.z;
  world.depenetrate(centre, hx, hy, hx);

  let dx = velocity.x * dt;
  let dy = velocity.y * dt;
  let dz = velocity.z * dt;

  for (let iteration = 0; iteration < 5; iteration++) {
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) break;
    if (!world.sweep(centre.x, centre.y, centre.z, hx, hy, hx, dx, dy, dz, hit)) {
      centre.x += dx;
      centre.y += dy;
      centre.z += dz;
      break;
    }
    const travel = Math.max(hit.t - SKIN / length, 0);
    centre.x += dx * travel;
    centre.y += dy * travel;
    centre.z += dz * travel;
    const remaining = 1 - travel;
    dx *= remaining;
    dy *= remaining;
    dz *= remaining;

    if (stepHeight > 0 && hit.ny === 0 && hit.box) {
      const rise = hit.box.maxY - (centre.y - hy);
      if (rise > 0 && rise <= stepHeight && !world.overlaps(centre.x, centre.y + rise + SKIN, centre.z, hx, hy, hx)) {
        centre.y += rise + SKIN;
        contacts.stepped = true;
        contacts.ground = true;
        continue;
      }
    }

    if (hit.ny > 0.5) contacts.ground = true;
    else if (hit.ny < -0.5) contacts.ceiling = true;
    else {
      contacts.wall = true;
      contacts.wallNx = hit.nx;
      contacts.wallNz = hit.nz;
      contacts.wallBox = hit.box;
    }

    const intoMove = dx * hit.nx + dy * hit.ny + dz * hit.nz;
    dx -= hit.nx * intoMove;
    dy -= hit.ny * intoMove;
    dz -= hit.nz * intoMove;
    const intoVelocity = velocity.x * hit.nx + velocity.y * hit.ny + velocity.z * hit.nz;
    if (intoVelocity < 0) {
      velocity.x -= hit.nx * intoVelocity;
      velocity.y -= hit.ny * intoVelocity;
      velocity.z -= hit.nz * intoVelocity;
    }
  }

  feet.x = centre.x;
  feet.y = centre.y - hy;
  feet.z = centre.z;
}

/** Distance to the surface below the feet within `maxDistance`, or -1 when there is none. */
export function probeGround(
  world: CollisionWorld,
  feet: { x: number; y: number; z: number },
  shape: BodyShape,
  maxDistance: number,
): number {
  const hy = shape.halfHeight;
  if (!world.sweep(feet.x, feet.y + hy, feet.z, shape.halfWidth, hy, shape.halfWidth, 0, -maxDistance, 0, hit)) {
    return -1;
  }
  return hit.ny > 0.5 ? hit.t * maxDistance : -1;
}

/**
 * Looks for a wall within `distance` in the horizontal direction (dirX, dirZ).
 * On success `out` holds the wall normal and box.
 */
export function probeWall(
  world: CollisionWorld,
  feet: { x: number; y: number; z: number },
  shape: BodyShape,
  dirX: number,
  dirZ: number,
  distance: number,
  out: Hit,
): boolean {
  const hy = shape.halfHeight;
  if (!world.sweep(feet.x, feet.y + hy, feet.z, shape.halfWidth, hy * 0.8, shape.halfWidth, dirX * distance, 0, dirZ * distance, out)) {
    return false;
  }
  return out.ny === 0 && out.box !== null;
}
