import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../config/palette';
import { KMH, type Tuning } from '../config/tuning';
import type { LandingKind, MoveState } from './playerSim';

const JOINTS = ['pelvis', 'spine', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;
type JointName = (typeof JOINTS)[number];
type Pose = Record<JointName, [number, number, number]>;

/** Everything the figure needs to pick and animate its pose. */
export interface HeroFrame {
  state: MoveState;
  stateTime: number;
  /** Interpolated feet position and body yaw. */
  position: Vector3;
  yaw: number;
  velocity: Vector3;
  sprinting: boolean;
  landingKind: LandingKind;
  /** Rope target (swing anchor or zip hook) or null. */
  ropeTarget: Vector3 | null;
  /** Anchor side: −1 left, 1 right. */
  ropeSide: number;
  wallNormal: Vector3;
}

const POSE_RATE = 18;
const TWOS_RATE = 12;
const FLIP_TIME = 0.6;

const outlineVertex = /* glsl */ `
  uniform float width;
  void main() {
    vec3 p = position + normal * width;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const outlineFragment = /* glsl */ `
  uniform vec3 color;
  void main() { gl_FragColor = vec4(color, 1.0); }
`;

/**
 * Stage 1 stand-in hero built from primitives (matches the stage 0 Blender figure): hoodie,
 * jeans, sneakers and the hexagonal ModeBand on the left wrist. Poses are computed in code each
 * frame and, with "animate on twos", shown 12 times a second like a comic animation.
 */
export class HeroFigure {
  readonly root = new Group();
  private readonly joints = {} as Record<JointName, Group>;
  private readonly current = {} as Pose;
  private readonly target = {} as Pose;
  private readonly bandMaterial: MeshBasicMaterial;
  private readonly outlineMaterial: ShaderMaterial;
  private readonly outlines: Mesh[] = [];
  private rightWrist = new Group();
  private leftWrist = new Group();
  private pelvisY = 0;
  private pelvisYTarget = 0;
  /** Body tilt around the hips: lean along the rope or the velocity (smoothed)… */
  private alignPitch = 0;
  private alignRoll = 0;
  private alignPitchTarget = 0;
  private alignRollTarget = 0;
  /** …plus whole turns for rolls and flips (not smoothed). */
  private spin = 0;
  private runPhase = 0;
  private climbPhase = 0;
  private twosClock = 0;
  private flipTime = -1;

  constructor(private readonly tuning: Tuning) {
    const lambert = (hex: string, emissive = 0.16) =>
      new MeshLambertMaterial({ color: hex, emissive: new Color(hex).multiplyScalar(emissive) });
    const hoodie = lambert(palette.hoodie);
    const jeans = lambert(palette.jeans);
    const sneakers = lambert(palette.sneakers, 0.25);
    const skin = lambert(palette.skin, 0.2);
    const hair = lambert(palette.hair, 0.05);
    this.bandMaterial = new MeshBasicMaterial({ color: new Color('#3FD6FF').multiplyScalar(2.6) });
    this.outlineMaterial = new ShaderMaterial({
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      side: BackSide,
      uniforms: { width: new Uniform(tuning.hero.outlineWidth), color: new Uniform(new Color(palette.ink)) },
    });

    const joint = (name: JointName, parent: Object3D, x: number, y: number, z: number): Group => {
      const g = new Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      this.current[name] = [0, 0, 0];
      this.target[name] = [0, 0, 0];
      return g;
    };
    const part = (parent: Object3D, geometry: BufferGeometry, material: MeshLambertMaterial | MeshBasicMaterial, outline = true): Mesh => {
      const mesh = new Mesh(geometry, material);
      parent.add(mesh);
      if (outline) {
        const shell = new Mesh(smoothNormals(geometry), this.outlineMaterial);
        mesh.add(shell);
        this.outlines.push(shell);
      }
      return mesh;
    };
    const limb = (radiusTop: number, radiusBottom: number, length: number) =>
      new CylinderGeometry(radiusTop, radiusBottom, length, 8).translate(0, -length / 2, 0);

    // The figure faces −Z; its right side is +X.
    const pelvis = joint('pelvis', this.root, 0, 0.98, 0);
    part(pelvis, new BoxGeometry(0.34, 0.18, 0.21), jeans);
    const spine = joint('spine', pelvis, 0, 0.05, 0);
    part(spine, new BoxGeometry(0.42, 0.5, 0.25).translate(0, 0.25, 0), hoodie);
    part(spine, new SphereGeometry(0.16, 8, 6).scale(1, 0.55, 0.65).translate(0, 0.47, 0.1), hoodie);
    const neck = joint('neck', spine, 0, 0.5, 0);
    part(neck, new CylinderGeometry(0.05, 0.055, 0.08, 6).translate(0, 0.03, 0), skin, false);
    part(neck, new SphereGeometry(0.12, 10, 8).scale(0.95, 1.08, 1.02).translate(0, 0.16, 0), skin);
    part(neck, new SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.18, 0.02), hair, false);

    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const shoulder = joint(`shoulder${s}`, spine, side * 0.26, 0.44, 0);
      part(shoulder, limb(0.06, 0.055, 0.3), hoodie);
      const elbow = joint(`elbow${s}`, shoulder, 0, -0.3, 0);
      part(elbow, limb(0.055, 0.048, 0.27), hoodie);
      const wrist = new Group();
      wrist.position.set(0, -0.27, 0);
      elbow.add(wrist);
      part(wrist, new BoxGeometry(0.075, 0.1, 0.065).translate(0, -0.05, 0), skin);
      if (side < 0) {
        // ModeBand: thick hexagonal band on the left wrist.
        part(elbow, new CylinderGeometry(0.07, 0.07, 0.065, 6).translate(0, -0.22, 0), this.bandMaterial);
        this.leftWrist = wrist;
      } else {
        this.rightWrist = wrist;
      }
      const hip = joint(`hip${s}`, pelvis, side * 0.1, -0.02, 0);
      part(hip, limb(0.085, 0.07, 0.44), jeans);
      const knee = joint(`knee${s}`, hip, 0, -0.44, 0);
      part(knee, limb(0.068, 0.058, 0.42), jeans);
      const ankle = joint(`ankle${s}`, knee, 0, -0.42, 0);
      part(ankle, new BoxGeometry(0.12, 0.09, 0.27).translate(0, -0.035, -0.06), sneakers);
    }
  }

  /** Band glow colour, from the active ModeBand mode. */
  setBandColor(hex: string): void {
    this.bandMaterial.color.set(hex).multiplyScalar(2.6);
  }

  /** Front flip (creative: after letting go of a fast swing). */
  flip(): void {
    if (this.tuning.hero.releaseFlip) this.flipTime = 0;
  }

  /** World position of the hand holding the rope. */
  ropeHand(side: number, out: Vector3): Vector3 {
    return (side < 0 ? this.leftWrist : this.rightWrist).getWorldPosition(out);
  }

  /** `dt`: simulated seconds (slow motion slows the animation too). */
  update(dt: number, f: HeroFrame): void {
    const hero = this.tuning.hero;
    this.root.position.copy(f.position);
    this.root.rotation.set(0, f.yaw, 0);
    for (const shell of this.outlines) shell.visible = hero.outline;
    this.outlineMaterial.uniforms.width!.value = hero.outlineWidth;

    this.buildPose(dt, f);
    const k = 1 - Math.exp(-POSE_RATE * dt);
    for (const name of JOINTS) {
      const c = this.current[name];
      const t = this.target[name];
      c[0] += (t[0] - c[0]) * k;
      c[1] += (t[1] - c[1]) * k;
      c[2] += (t[2] - c[2]) * k;
    }
    this.pelvisY += (this.pelvisYTarget - this.pelvisY) * k;
    const lean = 1 - Math.exp(-10 * dt);
    this.alignPitch += wrap(this.alignPitchTarget - this.alignPitch) * lean;
    this.alignRoll += wrap(this.alignRollTarget - this.alignRoll) * lean;

    // On twos: the drawing changes 12 times a second; the figure still moves smoothly through the world.
    this.twosClock += dt;
    if (hero.animateOnTwos && this.twosClock < 1 / TWOS_RATE) return;
    this.twosClock = 0;
    for (const name of JOINTS) {
      const c = this.current[name];
      this.joints[name].rotation.set(c[0], c[1], c[2]);
    }
    const pelvis = this.joints.pelvis;
    pelvis.position.y = 0.98 + this.pelvisY;
    pelvis.rotation.x += this.alignPitch + this.spin;
    pelvis.rotation.z += this.alignRoll;
  }

  private buildPose(dt: number, f: HeroFrame): void {
    const t = this.target;
    const v = f.velocity;
    const speed = Math.hypot(v.x, v.z);
    this.alignPitchTarget = 0;
    this.alignRollTarget = 0;
    this.spin = 0;
    this.pelvisYTarget = 0;
    rest(t);

    switch (f.state) {
      case 'grounded':
      case 'landing': {
        if (f.state === 'landing' && f.landingKind !== 'soft') {
          this.landingPose(f);
          break;
        }
        if (speed < 0.6) {
          this.idlePose(f.stateTime);
          break;
        }
        this.runPhase += (speed * dt * Math.PI * 2) / this.tuning.hero.strideLength;
        this.runPose(Math.min(speed / (this.tuning.movement.runSpeed * KMH), 1.5), f.sprinting);
        break;
      }
      case 'airborne':
        this.airPose(v.y);
        break;
      case 'swinging':
        this.swingPose(f);
        break;
      case 'zip':
        this.zipPose(f);
        break;
      case 'dive':
        this.divePose(f);
        break;
      case 'wallRun': {
        this.runPhase += (speed * dt * Math.PI * 2) / (this.tuning.hero.strideLength * 1.2);
        this.runPose(1.2, true);
        const rightX = Math.cos(f.yaw);
        const rightZ = -Math.sin(f.yaw);
        const wallOnLeft = f.wallNormal.x * rightX + f.wallNormal.z * rightZ > 0;
        this.alignRollTarget = wallOnLeft ? 0.42 : -0.42;
        break;
      }
      case 'wallClimb':
        this.climbPhase += Math.abs(v.y) * dt * 2.2 + Math.hypot(v.x, v.z) * dt * 1.5;
        this.climbPose();
        break;
      case 'mantle':
        set(t, 'shoulderL', -0.5, 0, -0.2);
        set(t, 'shoulderR', -0.5, 0, 0.2);
        set(t, 'elbowL', 0.3, 0, 0);
        set(t, 'elbowR', 0.3, 0, 0);
        set(t, 'hipL', 1.3, 0, 0);
        set(t, 'hipR', 0.9, 0, 0);
        set(t, 'kneeL', -1.6, 0, 0);
        set(t, 'kneeR', -1.2, 0, 0);
        set(t, 'spine', 0.45, 0, 0);
        break;
    }

    // Release flip: a tucked front flip over the arc.
    if (this.flipTime >= 0) {
      this.flipTime += dt;
      const p = this.flipTime / FLIP_TIME;
      if (p >= 1 || f.state !== 'airborne') {
        this.flipTime = -1;
      } else {
        this.spin = -easeInOut(p) * Math.PI * 2;
        tuck(t, Math.sin(p * Math.PI));
      }
    }
  }

  private idlePose(time: number): void {
    const t = this.target;
    const breathe = Math.sin(time * 2.2) * 0.025;
    set(t, 'spine', 0.04 + breathe, 0, 0);
    set(t, 'shoulderL', 0.05, 0, -0.14);
    set(t, 'shoulderR', 0.05, 0, 0.14);
    set(t, 'elbowL', 0.3, 0, 0);
    set(t, 'elbowR', 0.3, 0, 0);
    set(t, 'kneeL', -0.06, 0, 0);
    set(t, 'kneeR', -0.06, 0, 0);
  }

  private runPose(amount: number, sprint: boolean): void {
    const t = this.target;
    const a = MathUtils.clamp(amount, 0, 1.5) * (sprint ? 1.2 : 1);
    const s = Math.sin(this.runPhase);
    const c = Math.cos(this.runPhase);
    set(t, 'hipL', s * 0.75 * a, 0, 0);
    set(t, 'hipR', -s * 0.75 * a, 0, 0);
    set(t, 'kneeL', -(0.2 + 1.15 * Math.max(0, c)) * a, 0, 0);
    set(t, 'kneeR', -(0.2 + 1.15 * Math.max(0, -c)) * a, 0, 0);
    set(t, 'ankleL', 0.25 * s * a, 0, 0);
    set(t, 'ankleR', -0.25 * s * a, 0, 0);
    set(t, 'shoulderL', -s * 0.85 * a, 0, -0.12);
    set(t, 'shoulderR', s * 0.85 * a, 0, 0.12);
    set(t, 'elbowL', 1.1 + (sprint ? 0.4 : 0), 0, 0);
    set(t, 'elbowR', 1.1 + (sprint ? 0.4 : 0), 0, 0);
    set(t, 'spine', 0.1 + (sprint ? 0.3 : 0.14) * Math.min(a, 1), s * 0.14 * a, 0);
    this.pelvisYTarget = 0.05 * a * Math.abs(c) - 0.04 * a;
  }

  private airPose(vy: number): void {
    const t = this.target;
    const rising = MathUtils.clamp(vy / 8 + 0.5, 0, 1);
    // Rising: one knee up, arms forward. Falling: arms up and out, legs apart.
    set(t, 'hipL', MathUtils.lerp(0.35, 1.0, rising), 0, -0.05);
    set(t, 'hipR', MathUtils.lerp(-0.15, -0.2, rising), 0, 0.05);
    set(t, 'kneeL', MathUtils.lerp(-0.7, -1.4, rising), 0, 0);
    set(t, 'kneeR', MathUtils.lerp(-0.9, -0.5, rising), 0, 0);
    set(t, 'shoulderL', MathUtils.lerp(0.5, 0.7, rising), 0, MathUtils.lerp(-1.15, -0.45, rising));
    set(t, 'shoulderR', MathUtils.lerp(0.5, -0.3, rising), 0, MathUtils.lerp(1.15, 0.5, rising));
    set(t, 'elbowL', 0.5, 0, 0);
    set(t, 'elbowR', 0.6, 0, 0);
    set(t, 'spine', MathUtils.lerp(-0.08, 0.15, rising), 0, 0);
  }

  private swingPose(f: HeroFrame): void {
    const t = this.target;
    const ropeRight = f.ropeSide >= 0;
    // Rope arm straight up toward the anchor, the other arm out for balance, legs trailing.
    set(t, ropeRight ? 'shoulderR' : 'shoulderL', Math.PI - 0.05, 0, ropeRight ? -0.12 : 0.12);
    set(t, ropeRight ? 'elbowR' : 'elbowL', 0.08, 0, 0);
    set(t, ropeRight ? 'shoulderL' : 'shoulderR', 0.2, 0, ropeRight ? -1.25 : 1.25);
    set(t, ropeRight ? 'elbowL' : 'elbowR', 0.7, 0, 0);
    set(t, 'hipL', -0.25, 0, 0);
    set(t, 'hipR', -0.05, 0, 0);
    set(t, 'kneeL', -0.65, 0, 0);
    set(t, 'kneeR', -0.35, 0, 0);
    set(t, 'spine', -0.05, 0, 0);
    // The whole body hangs along the rope.
    if (f.ropeTarget) this.alignBodyTo(f, f.ropeTarget.x - f.position.x, f.ropeTarget.y - (f.position.y + 1.4), f.ropeTarget.z - f.position.z);
  }

  private zipPose(f: HeroFrame): void {
    const t = this.target;
    set(t, 'shoulderL', 2.4, 0, 0.15);
    set(t, 'shoulderR', 2.4, 0, -0.15);
    set(t, 'elbowL', 0.25, 0, 0);
    set(t, 'elbowR', 0.25, 0, 0);
    set(t, 'hipL', -0.35, 0, 0);
    set(t, 'hipR', -0.15, 0, 0);
    set(t, 'kneeL', -0.5, 0, 0);
    set(t, 'kneeR', -0.3, 0, 0);
    const v = f.velocity;
    this.alignBodyTo(f, v.x, v.y, v.z);
  }

  private divePose(f: HeroFrame): void {
    const t = this.target;
    // Streamlined: arms swept back, legs straight together, head first along the velocity.
    set(t, 'shoulderL', -0.45, 0, -0.25);
    set(t, 'shoulderR', -0.45, 0, 0.25);
    set(t, 'elbowL', 0.1, 0, 0);
    set(t, 'elbowR', 0.1, 0, 0);
    set(t, 'kneeL', -0.08, 0, 0);
    set(t, 'kneeR', -0.15, 0, 0);
    set(t, 'neck', -0.3, 0, 0);
    const v = f.velocity;
    this.alignBodyTo(f, v.x, v.y, v.z);
  }

  private climbPose(): void {
    const t = this.target;
    const s = Math.sin(this.climbPhase);
    set(t, 'shoulderL', 2.55 + 0.45 * s, 0, 0.1);
    set(t, 'shoulderR', 2.55 - 0.45 * s, 0, -0.1);
    set(t, 'elbowL', 0.7 - 0.4 * s, 0, 0);
    set(t, 'elbowR', 0.7 + 0.4 * s, 0, 0);
    set(t, 'hipL', 0.7 - 0.45 * s, 0, -0.1);
    set(t, 'hipR', 0.7 + 0.45 * s, 0, 0.1);
    set(t, 'kneeL', -1.3 + 0.4 * s, 0, 0);
    set(t, 'kneeR', -1.3 - 0.4 * s, 0, 0);
    set(t, 'spine', 0.1, 0, 0);
    this.alignPitchTarget = 0.12;
  }

  private landingPose(f: HeroFrame): void {
    const t = this.target;
    const m = this.tuning.movement;
    if (f.landingKind === 'hero') {
      const rise = MathUtils.smoothstep(f.stateTime / m.heroLandTime, 0.55, 1);
      // Superhero landing: one knee down, a fist on the ground, the other arm swept back.
      set(t, 'hipL', MathUtils.lerp(1.25, 0.2, rise), 0, -0.1);
      set(t, 'kneeL', MathUtils.lerp(-2.3, -0.4, rise), 0, 0);
      set(t, 'hipR', MathUtils.lerp(-0.45, 0, rise), 0, 0.12);
      set(t, 'kneeR', MathUtils.lerp(-2.05, -0.3, rise), 0, 0);
      set(t, 'ankleR', MathUtils.lerp(0.8, 0, rise), 0, 0);
      set(t, 'shoulderR', MathUtils.lerp(0.95, 0.1, rise), 0, 0.15);
      set(t, 'elbowR', MathUtils.lerp(0.15, 0.3, rise), 0, 0);
      set(t, 'shoulderL', MathUtils.lerp(-0.7, 0.05, rise), 0, MathUtils.lerp(-0.95, -0.15, rise));
      set(t, 'elbowL', 0.3, 0, 0);
      set(t, 'spine', MathUtils.lerp(0.6, 0.05, rise), 0, 0);
      set(t, 'neck', MathUtils.lerp(0.25, 0, rise), 0, 0);
      this.pelvisYTarget = MathUtils.lerp(-0.52, -0.05, rise);
    } else if (f.landingKind === 'roll') {
      const p = Math.min(f.stateTime / m.rollTime, 1);
      tuck(this.target, Math.sin(p * Math.PI));
      this.spin = -easeInOut(p) * Math.PI * 2;
      this.pelvisYTarget = -0.45 * Math.sin(p * Math.PI);
    } else {
      set(t, 'hipL', 0.6, 0, 0);
      set(t, 'hipR', 0.6, 0, 0);
      set(t, 'kneeL', -1.1, 0, 0);
      set(t, 'kneeR', -1.1, 0, 0);
      set(t, 'spine', 0.35, 0, 0);
      set(t, 'shoulderL', 0.4, 0, -0.4);
      set(t, 'shoulderR', 0.4, 0, 0.4);
      this.pelvisYTarget = -0.28;
    }
  }

  /** Tilts the body (around the hips) so its up axis points along (x, y, z) in world space. */
  private alignBodyTo(f: HeroFrame, x: number, y: number, z: number): void {
    // Into the figure's local frame (facing −Z after the yaw rotation).
    const c = Math.cos(-f.yaw);
    const s = Math.sin(-f.yaw);
    const lx = x * c + z * s;
    const lz = -x * s + z * c;
    const length = Math.hypot(lx, y, lz);
    if (length < 1e-3) return;
    this.alignPitchTarget = Math.atan2(lz, y);
    this.alignRollTarget = Math.atan2(-lx, Math.hypot(y, lz));
  }
}

function rest(t: Pose): void {
  for (const name of JOINTS) {
    const j = t[name];
    j[0] = 0;
    j[1] = 0;
    j[2] = 0;
  }
}

function set(t: Pose, name: JointName, x: number, y: number, z: number): void {
  const j = t[name];
  j[0] = x;
  j[1] = y;
  j[2] = z;
}

/** Curl into a ball (rolls and flips), `amount` 0..1. */
function tuck(t: Pose, amount: number): void {
  set(t, 'hipL', 1.7 * amount, 0, 0);
  set(t, 'hipR', 1.6 * amount, 0, 0);
  set(t, 'kneeL', -2.3 * amount, 0, 0);
  set(t, 'kneeR', -2.2 * amount, 0, 0);
  set(t, 'shoulderL', 1.3 * amount, 0, -0.2);
  set(t, 'shoulderR', 1.3 * amount, 0, 0.2);
  set(t, 'elbowL', 1.7 * amount, 0, 0);
  set(t, 'elbowR', 1.7 * amount, 0, 0);
  set(t, 'spine', 0.6 * amount, 0, 0);
  set(t, 'neck', 0.5 * amount, 0, 0);
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/** Copy with welded vertices and averaged normals, so an inflated outline shell has no gaps. */
function smoothNormals(geometry: BufferGeometry): BufferGeometry {
  const copy = geometry.clone();
  copy.deleteAttribute('normal');
  copy.deleteAttribute('uv');
  const welded = mergeVertices(copy, 1e-4);
  welded.computeVertexNormals();
  return welded;
}
