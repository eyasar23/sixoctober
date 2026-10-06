import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  type Vector3,
} from 'three';
import { palette } from '../config/palette';

const DUST_PUFFS = 14;
const DUST_TIME = 0.75;

/** Soft round blob shadow under the hero, so jumps read clearly (stage 0 known issue). */
export class BlobShadow {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;

  constructor() {
    this.material = new MeshBasicMaterial({ map: radialTexture('rgba(10,4,16,0.85)', 'rgba(10,4,16,0)'), transparent: true, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), this.material);
    this.mesh.renderOrder = 1;
  }

  /** `groundY`: surface under the hero; `feet`: hero position. */
  update(feet: Vector3, groundY: number): void {
    const height = Math.max(feet.y - groundY, 0);
    this.mesh.position.set(feet.x, groundY + 0.04, feet.z);
    this.mesh.scale.setScalar(1 + height * 0.05);
    this.material.opacity = Math.max(0, 0.85 - height / 30);
    this.mesh.visible = this.material.opacity > 0.02;
  }
}

/** Dust ring and puffs on hard landings. */
export class LandingDust {
  readonly group = new Group();
  private readonly ring: Mesh;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly puffs: Sprite[] = [];
  private readonly velocities: Array<[number, number, number]> = [];
  private time = -1;
  private strength = 1;

  constructor() {
    this.ringMaterial = new MeshBasicMaterial({
      color: new Color(palette.groundLight),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.ring = new Mesh(new RingGeometry(0.75, 1, 48).rotateX(-Math.PI / 2), this.ringMaterial);
    this.group.add(this.ring);
    const texture = radialTexture('rgba(255,236,220,0.9)', 'rgba(255,236,220,0)');
    for (let i = 0; i < DUST_PUFFS; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map: texture, color: new Color(palette.warmGround), transparent: true, depthWrite: false }));
      this.puffs.push(sprite);
      this.velocities.push([0, 0, 0]);
      this.group.add(sprite);
    }
    this.group.visible = false;
  }

  /** `strength` 0..1 scales size and speed. */
  burst(position: Vector3, strength: number): void {
    this.time = 0;
    this.strength = strength;
    this.group.visible = true;
    this.group.position.copy(position);
    this.puffs.forEach((puff, i) => {
      const angle = (i / DUST_PUFFS) * Math.PI * 2 + Math.random() * 0.3;
      const speed = (4 + Math.random() * 4) * (0.6 + strength * 0.6);
      const v = this.velocities[i];
      if (v) {
        v[0] = Math.cos(angle) * speed;
        v[1] = 1 + Math.random() * 2;
        v[2] = Math.sin(angle) * speed;
      }
      puff.position.set(0, 0.3, 0);
    });
  }

  update(dt: number): void {
    if (this.time < 0) return;
    this.time += dt;
    const p = this.time / DUST_TIME;
    if (p >= 1) {
      this.time = -1;
      this.group.visible = false;
      return;
    }
    const ease = 1 - (1 - p) ** 3;
    this.ring.scale.setScalar(0.5 + ease * 6 * this.strength);
    this.ringMaterial.opacity = (1 - p) * 0.8;
    this.puffs.forEach((puff, i) => {
      const v = this.velocities[i];
      if (!v) return;
      const drag = Math.exp(-3 * dt);
      v[0] *= drag;
      v[2] *= drag;
      puff.position.x += v[0] * dt;
      puff.position.y += v[1] * dt;
      puff.position.z += v[2] * dt;
      puff.scale.setScalar((0.8 + p * 2.2) * (0.6 + this.strength * 0.6));
      puff.material.opacity = (1 - p) * 0.7;
    });
  }
}

function radialTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}
