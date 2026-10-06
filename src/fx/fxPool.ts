import {
  AdditiveBlending,
  Color,
  type ColorRepresentation,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Uniform,
  type Vector3,
} from 'three';

export type FxKind = 'burst' | 'shockwave' | 'impact' | 'flare';
const KIND_ID: Record<FxKind, number> = { burst: 0, shockwave: 1, impact: 2, flare: 3 };
const CAPACITY = 48;

const vertexShader = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec4 aData;  // kind, start time, duration, size
  attribute vec4 aColor; // rgb, seed
  uniform float uTime;
  varying vec2 vUv;
  varying float vProgress;
  varying float vKind;
  varying vec4 vColor;
  void main() {
    float kind = aData.x;
    float progress = (uTime - aData.y) / max(aData.z, 1e-3);
    vProgress = progress;
    vKind = kind;
    vColor = aColor;
    vUv = uv;
    float alive = step(0.0, progress) * step(progress, 1.0);
    float size = aData.w * alive;
    vec3 world;
    if (kind > 0.5 && kind < 1.5) {
      // Shockwave: lies flat on the ground.
      world = aOrigin + vec3(position.x * size, 0.06, -position.y * size);
    } else {
      // Billboards face the camera.
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = aOrigin + (right * position.x + up * position.y) * size;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vProgress;
  varying float vKind;
  varying vec4 vColor;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float t = clamp(vProgress, 0.0, 1.0);
    float seed = vColor.a;
    float v = 0.0;
    if (vKind < 0.5) {
      // Power burst: a ring that races out, plus comic spikes.
      float radius = 0.15 + 0.8 * (1.0 - pow(1.0 - t, 3.0));
      float ring = smoothstep(0.09 * (1.0 - t) + 0.01, 0.0, abs(r - radius));
      float spikes = pow(max(0.0, cos(a * 7.0 + seed * 6.0)), 18.0) * smoothstep(1.0, 0.3, r) * smoothstep(radius * 0.4, radius, r);
      v = (ring * 1.4 + spikes * 1.2) * (1.0 - t);
    } else if (vKind < 1.5) {
      // Ground shockwave: jagged ring plus a fading disc of dust light.
      float radius = 0.1 + 0.9 * (1.0 - pow(1.0 - t, 2.5));
      float jag = 0.035 * sin(a * 13.0 + seed * 9.0) + 0.02 * sin(a * 29.0 + seed * 3.0);
      float ring = smoothstep(0.08 * (1.0 - t) + 0.015, 0.0, abs(r - radius - jag));
      float disc = smoothstep(radius, 0.0, r) * 0.25;
      v = (ring * 1.6 + disc) * (1.0 - t) * step(r, 1.0);
    } else if (vKind < 2.5) {
      // Hit impact: a sharp star that pops and fades.
      float points = 0.55 + 0.45 * pow(abs(cos(a * 4.0 + seed * 5.0)), 6.0);
      float size = mix(0.35, 1.0, sqrt(t)) * points;
      v = smoothstep(size, size * 0.6, r) * (1.0 - t * t) * 1.6;
      v += smoothstep(0.25, 0.0, r) * (1.0 - t) * 2.0;
    } else {
      // Soft flare (counter flash, glints).
      v = exp(-r * r * 6.0) * (1.0 - t) * 1.5;
    }
    if (v <= 0.002) discard;
    gl_FragColor = vec4(vColor.rgb * v, 1.0);
  }
`;

/**
 * Short-lived effects drawn in one call: power bursts (mode switch), ground shockwaves (Titan),
 * hit stars and flares. Slots are reused round-robin; nothing is allocated after start.
 */
export class FxPool {
  readonly mesh: InstancedMesh;
  private readonly origin: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly time = new Uniform(0);
  private readonly scratch = new Color();
  private next = 0;
  private seed = 0;

  constructor() {
    const geometry = new PlaneGeometry(2, 2);
    this.origin = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    this.data = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4).fill(-1000), 4);
    this.color = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    geometry.setAttribute('aOrigin', this.origin);
    geometry.setAttribute('aData', this.data);
    geometry.setAttribute('aColor', this.color);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: this.time },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    const identity = new Matrix4();
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, identity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** `size`: half width in metres; `intensity` scales the colour (HDR for bloom). */
  spawn(kind: FxKind, at: Vector3, color: ColorRepresentation, size: number, duration: number, intensity = 1.5): void {
    const i = this.next;
    this.next = (this.next + 1) % CAPACITY;
    this.origin.setXYZ(i, at.x, at.y, at.z);
    this.data.setXYZW(i, KIND_ID[kind], this.time.value, duration, size);
    const c = this.scratch.set(color).multiplyScalar(intensity);
    this.seed = (this.seed + 0.618) % 1;
    this.color.setXYZW(i, c.r, c.g, c.b, this.seed);
    this.origin.needsUpdate = true;
    this.data.needsUpdate = true;
    this.color.needsUpdate = true;
  }

  /** `time`: the same clock passed every frame (world seconds). */
  update(time: number): void {
    this.time.value = time;
  }
}
