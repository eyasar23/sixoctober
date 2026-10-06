import * as THREE from 'three';
import { tuning } from '../config/tuning';
import type { Input } from '../core/input';

/** Third-person camera orbiting behind the player, steered by the mouse. */
export class FollowCamera {
  /** Angle around the player, radians. 0 = camera on +Z looking towards -Z. */
  yaw = 0;
  /** Radians. Positive = camera above the player looking down. */
  pitch = 0.25;
  private readonly target = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Applies mouse movement. Call before moving the player so WASD uses this frame's yaw. */
  look(input: Input): void {
    const c = tuning.camera;
    const delta = input.takeMouseDelta();
    this.yaw -= delta.x * c.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + delta.y * c.mouseSensitivity, c.minPitch, c.maxPitch);
  }

  /** Places the camera behind `feet` and aims it at the player's upper body. */
  follow(feet: THREE.Vector3): void {
    const c = tuning.camera;
    this.target.set(feet.x, feet.y + c.targetHeight, feet.z);
    const horizontal = Math.cos(this.pitch) * c.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      Math.max(this.target.y + Math.sin(this.pitch) * c.distance, c.minHeight),
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.target);
    if (this.camera.fov !== c.fov) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
