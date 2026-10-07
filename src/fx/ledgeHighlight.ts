import { AdditiveBlending, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, type Vector3 } from 'three';

/**
 * Glow on the ledge under the crosshair ("look and launch"): a bright strip along the edge
 * and a small diamond where the hero will land, both in the mode colour, gently pulsing.
 */
export class LedgeHighlight {
  readonly group = new Group();
  private readonly strip: Mesh;
  private readonly spot: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly color = new Color();
  private time = 0;
  private shown = 0;

  constructor() {
    this.material = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.strip = new Mesh(new BoxGeometry(1, 0.07, 0.07), this.material);
    this.spot = new Mesh(new OctahedronGeometry(0.22, 0), this.material);
    this.group.add(this.strip, this.spot);
    this.group.visible = false;
  }

  /** `edge`: null hides it. `dt`: real seconds. */
  update(dt: number, edge: { a: Vector3; b: Vector3; perch: Vector3 } | null, hex: string): void {
    this.time += dt;
    this.shown += ((edge ? 1 : 0) - this.shown) * (1 - Math.exp(-14 * dt));
    this.group.visible = this.shown > 0.02;
    if (!edge) return;
    const { a, b, perch } = edge;
    const length = Math.max(a.distanceTo(b), 0.1);
    this.strip.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.04, (a.z + b.z) / 2);
    this.strip.scale.set(length, 1, 1);
    this.strip.rotation.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), 0);
    this.spot.position.set(perch.x, perch.y + 0.55 + Math.sin(this.time * 5) * 0.08, perch.z);
    this.spot.rotation.y = this.time * 2.2;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 8);
    this.material.color.copy(this.color.set(hex)).multiplyScalar(2.4 * pulse);
    this.material.opacity = this.shown;
  }
}
