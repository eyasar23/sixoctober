import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';

const SEGMENTS = 24;
const WIDTH = 0.05;
/** Seconds for the rope to fly out, plus a little per metre. */
const SHOT_TIME = 0.06;
const SHOT_PER_METRE = 0.0012;
const SPARK_TIME = 0.22;
/** A released rope whips: a travelling wave this wide (m) that dies out as it reels in. */
const WHIP_AMPLITUDE = 0.45;
const WHIP_SPEED = 38;

/**
 * The rope as a camera-facing ribbon: shoots out from the hand, hangs with a sag while slack,
 * pulls straight when taut and, once released, comes loose, whips and reels back into the hand.
 * A small spark flashes where it hooks.
 */
export class RopeVisual {
  readonly mesh: Mesh;
  readonly spark: Mesh;
  /** Seconds a released rope takes to reel back in (tuning.rope.retractTime). */
  retractTime = 0.25;
  private readonly positions: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;
  private readonly sparkMaterial: MeshBasicMaterial;
  private readonly end = new Vector3();
  private readonly from = new Vector3();
  private readonly target = new Vector3();
  private readonly point = new Vector3();
  private readonly prev = new Vector3();
  private readonly tangent = new Vector3();
  private readonly toCamera = new Vector3();
  private readonly side = new Vector3();
  private readonly whipAxis = new Vector3();
  private readonly cameraPosition = new Vector3();
  private phase: 'off' | 'shooting' | 'attached' | 'retracting' = 'off';
  private time = 0;
  private sparkTime = -1;
  private shotDuration = SHOT_TIME;

  constructor() {
    this.positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.material = new MeshBasicMaterial({ color: new Color('#3FD6FF').multiplyScalar(1.6), side: DoubleSide });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.sparkMaterial = new MeshBasicMaterial({
      color: new Color('#FFF4E6').multiplyScalar(3),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.spark = new Mesh(new PlaneGeometry(1, 1), this.sparkMaterial);
    this.spark.visible = false;
  }

  setColor(hex: string): void {
    this.material.color.set(hex).multiplyScalar(1.6);
  }

  /** A new rope fires toward `target`. */
  attach(target: Vector3): void {
    this.target.copy(target);
    this.phase = 'shooting';
    this.time = 0;
    this.shotDuration = SHOT_TIME;
  }

  /** The rope comes loose at the far end and reels back in. */
  release(): void {
    if (this.phase === 'off' || this.phase === 'retracting') return;
    this.phase = 'retracting';
    this.time = 0;
  }

  /** Gone at once (respawn, teleport). */
  hide(): void {
    this.phase = 'off';
    this.mesh.visible = false;
  }

  /**
   * `hand`: rope start; `target`: current hook point while attached (null after release);
   * `slack`: 0 = taut, 1 = loose.
   */
  update(dt: number, hand: Vector3, target: Vector3 | null, slack: number, camera: Camera): void {
    this.time += dt;
    // Nothing to hold on to any more: never leave a rope hanging from the building.
    if (!target && (this.phase === 'attached' || this.phase === 'shooting')) this.release();
    if (target && this.phase !== 'retracting') this.target.copy(target);
    this.from.copy(hand);

    let reach = 1;
    let whip = 0;
    let ribbonSlack = this.phase === 'attached' ? slack : 0.6;
    if (this.phase === 'shooting') {
      this.shotDuration = SHOT_TIME + this.from.distanceTo(this.target) * SHOT_PER_METRE;
      reach = Math.min(this.time / this.shotDuration, 1);
      if (reach >= 1) {
        this.phase = 'attached';
        this.sparkTime = 0;
      }
    } else if (this.phase === 'retracting') {
      // Loose first (it sags and whips), then it snaps back into the hand.
      const p = Math.min(this.time / Math.max(this.retractTime, 0.02), 1);
      reach = 1 - p * p;
      whip = 1 - p;
      ribbonSlack = 0.8 + p;
      if (p >= 1) this.phase = 'off';
    }
    this.mesh.visible = this.phase !== 'off';
    if (this.mesh.visible) this.buildRibbon(reach, ribbonSlack, whip, camera);
    this.updateSpark(dt, camera);
  }

  private buildRibbon(reach: number, slack: number, whip: number, camera: Camera): void {
    this.end.lerpVectors(this.from, this.target, reach);
    const length = this.from.distanceTo(this.end);
    const sag = length * 0.12 * slack;
    camera.getWorldPosition(this.cameraPosition);
    if (whip > 0) {
      // Wave across the line of sight so it reads on screen.
      this.whipAxis.subVectors(this.end, this.from).cross(this.toCamera.subVectors(this.cameraPosition, this.from));
      const axisLength = this.whipAxis.length();
      if (axisLength > 1e-6) this.whipAxis.multiplyScalar(1 / axisLength);
      else whip = 0;
    }
    const amplitude = Math.min(WHIP_AMPLITUDE, length * 0.08) * whip;
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      this.point.lerpVectors(this.from, this.end, s);
      this.point.y -= sag * 4 * s * (1 - s);
      if (amplitude > 0) this.point.addScaledVector(this.whipAxis, Math.sin(s * Math.PI * 3 - this.time * WHIP_SPEED) * amplitude * s);
      if (i === 0) {
        const next = this.prev.lerpVectors(this.from, this.end, 1 / SEGMENTS);
        next.y -= sag * 4 * (1 / SEGMENTS) * (1 - 1 / SEGMENTS);
        this.tangent.subVectors(next, this.point);
      } else {
        this.tangent.subVectors(this.point, this.prev);
      }
      this.prev.copy(this.point);
      this.side.crossVectors(this.tangent, this.toCamera.subVectors(this.cameraPosition, this.point));
      const sideLength = this.side.length();
      if (sideLength > 1e-6) this.side.multiplyScalar(WIDTH / 2 / sideLength);
      const o = i * 6;
      this.positions[o] = this.point.x + this.side.x;
      this.positions[o + 1] = this.point.y + this.side.y;
      this.positions[o + 2] = this.point.z + this.side.z;
      this.positions[o + 3] = this.point.x - this.side.x;
      this.positions[o + 4] = this.point.y - this.side.y;
      this.positions[o + 5] = this.point.z - this.side.z;
    }
    const attribute = this.geometry.getAttribute('position');
    attribute.needsUpdate = true;
  }

  private updateSpark(dt: number, camera: Camera): void {
    if (this.sparkTime < 0) {
      this.spark.visible = false;
      return;
    }
    this.sparkTime += dt;
    const p = this.sparkTime / SPARK_TIME;
    if (p >= 1) {
      this.sparkTime = -1;
      this.spark.visible = false;
      return;
    }
    this.spark.visible = true;
    this.spark.position.copy(this.target);
    this.spark.quaternion.copy(camera.quaternion);
    this.spark.scale.setScalar(0.4 + p * 2.6);
    this.sparkMaterial.opacity = 1 - p;
  }
}
