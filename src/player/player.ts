import * as THREE from 'three';
import { palette } from '../config/palette';
import { tuning } from '../config/tuning';
import type { Input } from '../core/input';
import type { BoxCollider } from '../world/testCityMesh';

/** Stage 0 stand-in for the hero: a capsule with simple kinematic movement (no physics engine). */
export class Player {
  readonly object: THREE.Mesh;
  /** Feet position, m. */
  readonly position = new THREE.Vector3();
  /** m/s. */
  readonly velocity = new THREE.Vector3();
  private grounded = true;
  private readonly wish = new THREE.Vector3();

  constructor() {
    const { radius, height } = tuning.player;
    const geometry = new THREE.CapsuleGeometry(radius, height - 2 * radius, 4, 12).translate(0, height / 2, 0);
    const material = new THREE.MeshLambertMaterial({
      color: palette.neonCyan,
      emissive: palette.neonCyan,
      emissiveIntensity: 0.25,
    });
    this.object = new THREE.Mesh(geometry, material);
  }

  /** `cameraYaw` makes W always move away from the camera. */
  update(dt: number, input: Input, cameraYaw: number, colliders: readonly BoxCollider[]): void {
    const p = tuning.player;

    // Camera-relative direction on the ground plane.
    const forward = Number(input.isHeld('KeyW')) - Number(input.isHeld('KeyS'));
    const right = Number(input.isHeld('KeyD')) - Number(input.isHeld('KeyA'));
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    this.wish.set(-sin * forward + cos * right, 0, -cos * forward - sin * right);
    if (this.wish.lengthSq() > 1) this.wish.normalize();
    this.wish.multiplyScalar(p.runSpeed);

    // Ease the horizontal velocity towards the wished one; less control in the air.
    const acceleration = this.grounded ? p.acceleration : p.acceleration * p.airControl;
    const blend = 1 - Math.exp(-acceleration * dt);
    this.velocity.x += (this.wish.x - this.velocity.x) * blend;
    this.velocity.z += (this.wish.z - this.velocity.z) * blend;

    if (this.grounded && input.wasPressed('Space')) {
      this.velocity.y = p.jumpStrength;
      this.grounded = false;
    }
    this.velocity.y -= p.gravity * dt;

    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    }
    this.pushOutOfBuildings(colliders);
    this.object.position.copy(this.position);
  }

  /** Keeps the capsule outside building footprints and stops velocity into walls. */
  private pushOutOfBuildings(colliders: readonly BoxCollider[]): void {
    const r = tuning.player.radius;
    const pos = this.position;
    for (const box of colliders) {
      if (pos.y >= box.height) continue;
      const nearestX = THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
      const nearestZ = THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
      let nx = pos.x - nearestX;
      let nz = pos.z - nearestZ;
      const distance = Math.hypot(nx, nz);
      if (distance >= r) continue;

      if (distance > 1e-6) {
        nx /= distance;
        nz /= distance;
        pos.x = nearestX + nx * r;
        pos.z = nearestZ + nz * r;
      } else {
        // Centre ended up inside the box (very low FPS): leave through the nearest side.
        const toMinX = pos.x - box.minX;
        const toMaxX = box.maxX - pos.x;
        const toMinZ = pos.z - box.minZ;
        const nearest = Math.min(toMinX, toMaxX, toMinZ, box.maxZ - pos.z);
        nx = nearest === toMinX ? -1 : nearest === toMaxX ? 1 : 0;
        nz = nx !== 0 ? 0 : nearest === toMinZ ? -1 : 1;
        if (nx !== 0) pos.x = nx < 0 ? box.minX - r : box.maxX + r;
        else pos.z = nz < 0 ? box.minZ - r : box.maxZ + r;
      }

      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        this.velocity.x -= into * nx;
        this.velocity.z -= into * nz;
      }
    }
  }
}
