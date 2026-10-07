import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../config/palette';
import type { CrimeDirector, CrimeSite } from './crimeDirector';

const pillarVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const pillarFragment = /* glsl */ `
  uniform vec3 colorCore;
  uniform vec3 colorEdge;
  uniform float time;
  uniform float strength;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    float h = vUv.y;
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormalW), view));
    // Comic beam: bright core, soft edges, rings racing upward, fading into the sky.
    float rings = 0.55 + 0.45 * step(0.5, fract(h * 70.0 - time * 1.6));
    float fade = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.01, h);
    vec3 color = mix(colorEdge, colorCore, facing * facing);
    float a = (0.25 + 0.75 * facing) * rings * fade * strength;
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

interface TruckView {
  root: Group;
  site: CrimeSite | null;
  bounce: number;
  bounceVelocity: number;
  tilt: number;
  tiltVelocity: number;
}

/**
 * What the crime looks like: an armoured truck with its back doors open and hazard lights
 * flashing red and orange, loot bags on the street, a red-orange light pillar up into the sky
 * and a pulsing ring on the ground. Two trucks: the current crime and the last stopped one.
 */
export class CrimeSceneView {
  readonly group = new Group();
  private readonly trucks: TruckView[] = [];
  private readonly lightA: MeshBasicMaterial;
  private readonly lightB: MeshBasicMaterial;
  private readonly pillar: Mesh;
  private readonly pillarStrength = new Uniform(0);
  private readonly pillarTime = new Uniform(0);
  private readonly ring: Mesh;
  private readonly ringMaterial: MeshBasicMaterial;
  private pillarSite: CrimeSite | null = null;
  private time = 0;

  /**
   * `seeThrough` adds the camera's see-through tunnel to a material (as on buildings), so a truck
   * between the camera and the hero opens up instead of hiding the fight.
   */
  constructor(seeThrough?: (material: Material) => void) {
    const truckGeometry = buildTruck();
    const bagGeometry = buildBags();
    const body = new MeshLambertMaterial({ vertexColors: true });
    this.lightA = new MeshBasicMaterial({ color: new Color(palette.crime).multiplyScalar(3) });
    this.lightB = new MeshBasicMaterial({ color: new Color(palette.crimeHot).multiplyScalar(3) });
    const glass = new MeshBasicMaterial({ color: new Color('#F7E7C6').multiplyScalar(1.6) });
    if (seeThrough) for (const material of [body, this.lightA, this.lightB, glass]) seeThrough(material);
    for (let i = 0; i < 2; i++) {
      const root = new Group();
      root.add(new Mesh(truckGeometry, body), new Mesh(bagGeometry, body));
      const light = new BoxGeometry(0.42, 0.16, 0.3);
      const left = new Mesh(light, this.lightA);
      left.position.set(-0.55, 2.62, 2.5);
      const right = new Mesh(light, this.lightB);
      right.position.set(0.55, 2.62, 2.5);
      const head = new BoxGeometry(0.42, 0.22, 0.06);
      const headL = new Mesh(head, glass);
      headL.position.set(-0.8, 0.95, 3.38);
      const headR = new Mesh(head, glass);
      headR.position.set(0.8, 0.95, 3.38);
      root.add(left, right, headL, headR);
      root.visible = false;
      this.group.add(root);
      this.trucks.push({ root, site: null, bounce: 0, bounceVelocity: 0, tilt: 0, tiltVelocity: 0 });
    }

    const pillarMaterial = new ShaderMaterial({
      vertexShader: pillarVertex,
      fragmentShader: pillarFragment,
      uniforms: {
        colorCore: new Uniform(new Color('#FFD2B0').multiplyScalar(1.4)),
        colorEdge: new Uniform(new Color(palette.crime).multiplyScalar(1.6)),
        time: this.pillarTime,
        strength: this.pillarStrength,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    });
    const height = 520;
    this.pillar = new Mesh(new CylinderGeometry(1.8, 2.6, height, 24, 1, true).translate(0, height / 2, 0), pillarMaterial);
    this.pillar.frustumCulled = false;
    this.pillar.renderOrder = 4;
    this.ringMaterial = new MeshBasicMaterial({
      color: new Color(palette.crime).multiplyScalar(2),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.ring = new Mesh(new RingGeometry(11, 12, 64).rotateX(-Math.PI / 2), this.ringMaterial);
    this.ring.position.y = 0.06;
    this.group.add(this.pillar, this.ring);
  }

  /** A Titan shockwave nearby: trucks jump and rock. */
  shock(x: number, z: number, radius: number): void {
    for (const t of this.trucks) {
      if (!t.site) continue;
      const d = Math.hypot(t.site.x - x, t.site.z - z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      t.bounceVelocity += 6 * k;
      t.tiltVelocity += (t.site.x - x > 0 ? 1 : -1) * 2.5 * k;
    }
  }

  /** `dt`: simulated seconds. `showPillar` is the tuning switch. */
  update(dt: number, director: CrimeDirector, showPillar: boolean): void {
    // The pillar guides from afar; up close it steps back so the fight stays readable.
    const near = Math.min(Math.max((director.distance - 25) / 70, 0), 1);
    this.time += dt;
    // Trucks: the current crime and the previous one (if still around).
    const wanted = [director.site, director.previous?.site ?? null];
    for (const site of wanted) {
      if (site && !this.trucks.some((t) => t.site?.id === site.id)) {
        const free = this.trucks.find((t) => !t.site || !wanted.some((w) => w?.id === t.site?.id));
        if (free) this.place(free, site);
      }
    }
    for (const t of this.trucks) {
      if (t.site && !wanted.some((w) => w?.id === t.site?.id)) {
        t.site = null;
        t.root.visible = false;
      }
      if (!t.site) continue;
      // A hop with a small bounce, and a springy rock, after a shockwave.
      if (t.bounce > 0 || t.bounceVelocity > 0) {
        t.bounceVelocity -= 26 * dt;
        t.bounce += t.bounceVelocity * dt;
        if (t.bounce <= 0) {
          t.bounce = 0;
          t.bounceVelocity = t.bounceVelocity < -2 ? -t.bounceVelocity * 0.3 : 0;
        }
      }
      t.tiltVelocity += (-t.tilt * 40 - t.tiltVelocity * 5) * dt;
      t.tilt += t.tiltVelocity * dt;
      t.root.position.y = t.bounce;
      t.root.rotation.set(0, t.site.heading, t.tilt * 0.12);
    }
    // Hazard lights flash in turn while the crime is on.
    const on = director.phase === 'active' || director.phase === 'engaged';
    const flash = Math.floor(this.time * 5) % 2;
    this.lightA.color.set(palette.crime).multiplyScalar(on ? (flash ? 3.4 : 0.3) : 0.2);
    this.lightB.color.set(palette.crimeHot).multiplyScalar(on ? (flash ? 0.3 : 3.4) : 0.2);

    // Pillar: fades in at a new crime, out once it is stopped.
    const site = director.site;
    if (site && site !== this.pillarSite && this.pillarStrength.value < 0.02) this.pillarSite = site;
    const target = showPillar && on && site === this.pillarSite ? 0.12 + 0.88 * near : 0;
    this.pillarStrength.value += (target - this.pillarStrength.value) * (1 - Math.exp(-2.5 * dt));
    this.pillarTime.value = this.time;
    this.pillar.visible = this.pillarStrength.value > 0.01 && this.pillarSite !== null;
    this.ring.visible = this.pillar.visible;
    if (this.pillarSite) {
      this.pillar.position.set(this.pillarSite.x, 0, this.pillarSite.z);
      this.ring.position.set(this.pillarSite.x, 0.06, this.pillarSite.z);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      this.ring.scale.setScalar(1 + pulse * 0.08);
      this.ringMaterial.opacity = (0.35 + 0.4 * pulse) * this.pillarStrength.value;
    }
  }

  private place(t: TruckView, site: CrimeSite): void {
    t.site = site;
    t.root.visible = true;
    t.root.position.set(site.x, 0, site.z);
    t.root.rotation.set(0, site.heading, 0);
    t.bounce = 0;
    t.bounceVelocity = 0;
    t.tilt = 0;
    t.tiltVelocity = 0;
  }
}

/** Armoured truck, facing +Z, built from boxes with vertex colours. */
function buildTruck(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, color: string) => parts.push(paint(geometry, color));
  const steel = '#3B4152';
  const dark = '#252A36';
  // Cargo box and cab.
  add(new BoxGeometry(2.5, 2.7, 4.4).translate(0, 1.75, -0.9), steel);
  add(new BoxGeometry(2.4, 2.1, 1.9).translate(0, 1.45, 2.4), dark);
  add(new BoxGeometry(2.2, 0.75, 0.05).translate(0, 1.95, 3.37), '#161B27');
  add(new BoxGeometry(2.5, 0.3, 0.25).translate(0, 0.55, 3.45), '#1A1E28');
  // Armour plates and a cream stripe along the sides.
  for (const side of [-1, 1]) {
    add(new BoxGeometry(0.04, 0.18, 4.2).translate(side * 1.27, 1.55, -0.9), palette.sneakers);
    add(new BoxGeometry(0.05, 0.9, 1.8).translate(side * 1.27, 2.4, -1.9), dark);
    add(new BoxGeometry(0.05, 0.9, 1.8).translate(side * 1.27, 2.4, 0.1), dark);
  }
  // Back doors flung open.
  for (const side of [-1, 1]) {
    const door = new BoxGeometry(1.2, 2.4, 0.08).translate(side * 0.6, 0, 0);
    door.rotateY(side * 1.9);
    door.translate(side * 1.25, 1.75, -3.12);
    add(door, steel);
  }
  // The open back shows a dark inside.
  add(new BoxGeometry(2.3, 2.4, 0.05).translate(0, 1.75, -3.08), '#0B0D13');
  // Wheels.
  for (const z of [2.4, -2.1]) {
    for (const side of [-1, 1]) {
      add(new CylinderGeometry(0.46, 0.46, 0.32, 12).rotateZ(Math.PI / 2).translate(side * 1.12, 0.46, z), '#101010');
    }
  }
  // Roof light bar housing.
  add(new BoxGeometry(1.7, 0.12, 0.36).translate(0, 2.5, 2.5), '#1A1E28');
  return mergeGeometries(parts);
}

/** Loot bags dropped behind the truck. */
function buildBags(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const spots: Array<[number, number, number]> = [
    [-0.6, 0, -4.2],
    [0.4, 0, -4.6],
    [1.3, 0, -4.0],
    [-1.5, 0, -5.1],
    [0.9, 0, -5.6],
  ];
  for (const [x, , z] of spots) {
    parts.push(paint(new SphereGeometry(0.34, 8, 6).scale(1, 0.8, 1).translate(x, 0.27, z), '#B9A27C'));
    parts.push(paint(new CylinderGeometry(0.08, 0.12, 0.14, 6).translate(x, 0.56, z), '#8C7A5C'));
  }
  return mergeGeometries(parts);
}

function paint(geometry: BufferGeometry, hex: string): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const color = new Color(hex);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
