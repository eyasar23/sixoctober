import { type Bone, BoxGeometry, Color, CylinderGeometry, MathUtils, SphereGeometry } from 'three';
import { palette } from '../config/palette';
import type { Tuning } from '../config/tuning';
import { type Figure, FigureBuilder } from '../figures/articulated';
import type { Enemy } from './enemy';

const JOINTS = ['pelvis', 'spine', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;
type JointName = (typeof JOINTS)[number];
type Pose = Record<JointName, [number, number, number]>;
/** Positive X angles in poses swing toward the front; for the upward spine and neck that is a negative turn. */
const POINTS_UP: ReadonlySet<JointName> = new Set(['spine', 'neck']);

/**
 * "The Static" gang look (our own design, BRIEF.md §2.8): dark plum tracksuits with hot
 * red-magenta reflective tape, white porcelain masks with one red slash, white chunky shoes.
 * The boss wears an oxblood bomber, two slashes and stands a head taller. Red-magenta keeps the
 * gang on the "crime" side of the palette; the hero's cyan and amber stay theirs alone.
 */
export const GANG = {
  jacket: '#1E1626',
  bossJacket: '#6E1A2E',
  trousers: '#26202E',
  tape: '#FF3B6B',
  mask: '#EDE6DA',
  eyes: '#0A0610',
  hood: '#2A1F33',
  gloves: '#18121E',
  shoes: '#E8E2D8',
} as const;

const TWOS_RATE = 12;
const POSE_RATE = 16;

export class EnemyFigure {
  readonly figure: Figure;
  private readonly joints = {} as Record<JointName, Bone>;
  private readonly current = {} as Pose;
  private readonly target = {} as Pose;
  private readonly baseGlow: Color[];
  private pelvisY = 0;
  private pelvisYTarget = 0;
  private bodyPitch = 0;
  private bodyPitchTarget = 0;
  private bodyRoll = 0;
  private runPhase = Math.random() * 6;
  private twosClock = Math.random() / TWOS_RATE;
  private time = Math.random() * 10;
  private recoilSide = 1;
  private lastState = '';

  constructor(
    readonly enemy: Enemy,
    private readonly tuning: Tuning,
  ) {
    const boss = enemy.role === 'brute';
    const b = new FigureBuilder();
    const jacket = b.slot(boss ? GANG.bossJacket : GANG.jacket, 0.1);
    const trousers = b.slot(GANG.trousers, 0.08);
    const tape = b.slot(GANG.tape, 0.35, new Color(GANG.tape).multiplyScalar(0.55));
    const mask = b.slot(GANG.mask, 0.22);
    const eyes = b.slot(GANG.eyes, 0);
    const hood = b.slot(GANG.hood, 0.06);
    const gloves = b.slot(GANG.gloves, 0.05);
    const shoes = b.slot(GANG.shoes, 0.2);
    const limb = (radiusTop: number, radiusBottom: number, length: number) =>
      new CylinderGeometry(radiusTop, radiusBottom, length, 8).translate(0, -length / 2, 0);

    // Faces −Z like the hero.
    b.bone('pelvis', null, 0, 0.98, 0);
    b.part('pelvis', new BoxGeometry(0.36, 0.18, 0.22), trousers);
    b.bone('spine', 'pelvis', 0, 0.05, 0);
    b.part('spine', new BoxGeometry(boss ? 0.52 : 0.45, 0.52, boss ? 0.32 : 0.27).translate(0, 0.26, 0), jacket);
    // Tape chevron on the back, a stripe down each side.
    for (const side of [-1, 1]) {
      b.part('spine', new BoxGeometry(0.2, 0.035, 0.02).rotateZ(side * -0.55).translate(side * 0.075, 0.36, boss ? 0.165 : 0.14), tape, false);
      b.part('spine', new BoxGeometry(0.02, 0.46, 0.04).translate(side * (boss ? 0.265 : 0.23), 0.26, 0), tape, false);
    }
    b.bone('neck', 'spine', 0, 0.52, 0);
    b.part('neck', new CylinderGeometry(0.055, 0.06, 0.08, 6).translate(0, 0.03, 0), hood, false);
    // Mask (front) inside a hood (back).
    b.part('neck', new SphereGeometry(0.12, 10, 8).scale(0.95, 1.1, 1).translate(0, 0.17, -0.005), mask);
    b.part('neck', new SphereGeometry(0.142, 10, 8).scale(1, 1.05, 1).translate(0, 0.18, 0.04), hood);
    b.part('neck', new BoxGeometry(0.035, 0.012, 0.02).translate(-0.045, 0.19, -0.115), eyes, false);
    b.part('neck', new BoxGeometry(0.035, 0.012, 0.02).translate(0.045, 0.19, -0.115), eyes, false);
    b.part('neck', new BoxGeometry(0.2, 0.022, 0.02).rotateZ(-0.7).translate(0, 0.16, -0.11), tape, false);
    if (boss) b.part('neck', new BoxGeometry(0.2, 0.022, 0.02).rotateZ(-0.7).translate(0.05, 0.11, -0.1), tape, false);

    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const wide = boss ? 0.3 : 0.27;
      b.bone(`shoulder${s}`, 'spine', side * wide, 0.45, 0);
      b.part(`shoulder${s}`, limb(boss ? 0.075 : 0.065, 0.058, 0.3), jacket);
      b.part(`shoulder${s}`, new BoxGeometry(0.018, 0.28, 0.03).translate(side * (boss ? 0.075 : 0.066), -0.15, 0), tape, false);
      b.bone(`elbow${s}`, `shoulder${s}`, 0, -0.3, 0);
      b.part(`elbow${s}`, limb(0.058, 0.05, 0.27), jacket);
      b.part(`elbow${s}`, new BoxGeometry(0.018, 0.25, 0.03).translate(side * 0.058, -0.13, 0), tape, false);
      b.bone(`wrist${s}`, `elbow${s}`, 0, -0.27, 0);
      b.part(`wrist${s}`, new BoxGeometry(0.09, 0.1, 0.08).translate(0, -0.05, 0), gloves);
      b.bone(`hip${s}`, 'pelvis', side * 0.1, -0.02, 0);
      b.part(`hip${s}`, limb(0.088, 0.072, 0.44), trousers);
      b.part(`hip${s}`, new BoxGeometry(0.018, 0.42, 0.03).translate(side * 0.083, -0.22, 0), tape, false);
      b.bone(`knee${s}`, `hip${s}`, 0, -0.44, 0);
      b.part(`knee${s}`, limb(0.07, 0.06, 0.42), trousers);
      b.part(`knee${s}`, new BoxGeometry(0.018, 0.4, 0.03).translate(side * 0.066, -0.2, 0), tape, false);
      b.bone(`ankle${s}`, `knee${s}`, 0, -0.42, 0);
      b.part(`ankle${s}`, new BoxGeometry(0.14, 0.11, 0.3).translate(0, -0.03, -0.06), shoes);
    }

    this.figure = b.build(palette.ink, tuning.hero.outlineWidth);
    if (boss) this.figure.root.scale.setScalar(1.18);
    for (const name of JOINTS) {
      this.joints[name] = this.figure.bone(name);
      this.current[name] = [0, 0, 0];
      this.target[name] = [0, 0, 0];
    }
    this.baseGlow = this.figure.glows.value.map((c) => c.clone());
  }

  get root(): Figure['root'] {
    return this.figure.root;
  }

  dispose(): void {
    this.figure.mesh.geometry.dispose();
    this.figure.outline.geometry.dispose();
  }

  /** `dt`: simulated seconds. */
  update(dt: number): void {
    const e = this.enemy;
    const hero = this.tuning.hero;
    this.time += dt;
    this.root.position.copy(e.position);
    this.root.rotation.set(0, e.yaw, 0);
    this.figure.setOutline(hero.outline, hero.outlineWidth);
    if (e.state !== this.lastState) {
      if (e.state === 'hitstun' || e.state === 'knockback') this.recoilSide = -this.recoilSide;
      this.lastState = e.state;
    }

    // White flash on a hit.
    const glows = this.figure.glows.value;
    glows.forEach((glow, i) => {
      glow.copy(this.baseGlow[i]!);
      if (e.hitFlash > 0) {
        const k = e.hitFlash ** 3 * 1.6;
        glow.r += k;
        glow.g += k;
        glow.b += k;
      }
    });

    this.buildPose(dt);
    const k = 1 - Math.exp(-(e.state === 'attack' || e.state === 'hitstun' ? POSE_RATE * 2.2 : POSE_RATE) * dt);
    for (const name of JOINTS) {
      const c = this.current[name];
      const t = this.target[name];
      c[0] += (t[0] - c[0]) * k;
      c[1] += (t[1] - c[1]) * k;
      c[2] += (t[2] - c[2]) * k;
    }
    this.pelvisY += (this.pelvisYTarget - this.pelvisY) * k;
    const lean = 1 - Math.exp(-9 * dt);
    this.bodyPitch += (this.bodyPitchTarget - this.bodyPitch) * lean;

    this.twosClock += dt;
    if (hero.animateOnTwos && this.twosClock < 1 / TWOS_RATE) return;
    this.twosClock = 0;
    for (const name of JOINTS) {
      const c = this.current[name];
      this.joints[name].rotation.set(POINTS_UP.has(name) ? -c[0] : c[0], c[1], c[2]);
    }
    const pelvis = this.joints.pelvis;
    pelvis.position.y = 0.98 + this.pelvisY;
    pelvis.rotation.x += this.bodyPitch;
    pelvis.rotation.z += this.bodyRoll;
  }

  private buildPose(dt: number): void {
    const e = this.enemy;
    const t = this.target;
    const tu = this.tuning.combat;
    rest(t);
    this.pelvisYTarget = 0;
    this.bodyPitchTarget = 0;
    this.bodyRoll = 0;
    const speed = Math.hypot(e.velocity.x, e.velocity.z);
    const p = (time: number) => MathUtils.clamp(e.stateTime / Math.max(time, 1e-3), 0, 1);

    switch (e.state) {
      case 'idle': {
        // Grabbing loot bags off the street.
        const grab = Math.sin(this.time * 2.4) * 0.5 + 0.5;
        set(t, 'hipL', 1.1, 0, -0.15);
        set(t, 'hipR', 1.3, 0, 0.15);
        set(t, 'kneeL', -1.5, 0, 0);
        set(t, 'kneeR', -1.8, 0, 0);
        set(t, 'ankleL', 0.4, 0, 0);
        set(t, 'ankleR', 0.5, 0, 0);
        set(t, 'spine', 0.55, 0, 0);
        set(t, 'shoulderL', 0.9 + 0.4 * grab, 0, -0.2);
        set(t, 'shoulderR', 1.2 - 0.4 * grab, 0, 0.2);
        set(t, 'elbowL', 0.5, 0, 0);
        set(t, 'elbowR', 0.6, 0, 0);
        this.pelvisYTarget = -0.42;
        break;
      }
      case 'approach':
        this.run(dt, speed, 1.15);
        break;
      case 'position':
      case 'getup':
        if (e.state === 'getup') {
          const up = smooth(p(tu.getupTime));
          this.bodyPitchTarget = 1.5 * (1 - up);
          this.pelvisYTarget = -0.8 * (1 - up);
          set(t, 'hipL', 1.4 * (1 - up), 0, 0);
          set(t, 'kneeL', -2.0 * (1 - up), 0, 0);
          set(t, 'shoulderR', 0.8 * (1 - up), 0, 0.4);
          break;
        }
        this.guard(dt, speed);
        break;
      case 'warn': {
        // Big wind-up: the striking arm far back, body twisted away, trembling.
        const w = smooth(p(0.25));
        const shake = Math.sin(this.time * 55) * 0.04;
        set(t, 'shoulderR', -1.0 * w, 0, 0.5 * w);
        set(t, 'elbowR', 1.5, 0, 0);
        set(t, 'shoulderL', 1.1, 0, -0.3);
        set(t, 'elbowL', 1.6, 0, 0);
        set(t, 'spine', -0.12 + shake, 0.75 * w, 0);
        set(t, 'neck', 0.1, -0.5 * w, 0);
        set(t, 'hipL', 0.45, 0, -0.1);
        set(t, 'kneeL', -0.6, 0, 0);
        set(t, 'hipR', -0.2, 0, 0.12);
        set(t, 'kneeR', -0.3, 0, 0);
        this.pelvisYTarget = -0.1;
        break;
      }
      case 'attack': {
        // Haymaker through the hero.
        const s = smooth(p(tu.attackTime * 0.6));
        set(t, 'shoulderR', -1.0 + 2.7 * s, 0, 0.5 - 0.4 * s);
        set(t, 'elbowR', 1.5 - 1.3 * s, 0, 0);
        set(t, 'shoulderL', 0.6, 0, -0.6);
        set(t, 'elbowL', 1.2, 0, 0);
        set(t, 'spine', 0.2 * s, 0.75 - 1.4 * s, 0);
        set(t, 'hipL', 0.7 * s, 0, -0.1);
        set(t, 'kneeL', -0.5, 0, 0);
        set(t, 'hipR', -0.3, 0, 0.1);
        this.pelvisYTarget = -0.08;
        break;
      }
      case 'recover':
        set(t, 'spine', 0.45, -0.3, 0);
        set(t, 'shoulderR', 1.0, 0, 0.2);
        set(t, 'elbowR', 0.4, 0, 0);
        set(t, 'shoulderL', 0.2, 0, -0.5);
        set(t, 'hipL', 0.5, 0, 0);
        set(t, 'kneeL', -0.7, 0, 0);
        set(t, 'kneeR', -0.4, 0, 0);
        this.pelvisYTarget = -0.14;
        break;
      case 'hitstun': {
        const hit = 1 - smooth(p(tu.hitstunTime));
        set(t, 'spine', -0.6 * hit, 0.35 * this.recoilSide * hit, 0);
        set(t, 'neck', -0.5 * hit, 0, 0);
        set(t, 'shoulderL', 0.7 * hit, 0, -1.2 * hit);
        set(t, 'shoulderR', 0.9 * hit, 0, 1.2 * hit);
        set(t, 'elbowL', 0.5, 0, 0);
        set(t, 'elbowR', 0.5, 0, 0);
        set(t, 'hipL', 0.3 * hit, 0, 0);
        set(t, 'kneeL', -0.6 * hit, 0, 0);
        set(t, 'kneeR', -0.3, 0, 0);
        break;
      }
      case 'knockback':
      case 'pulled': {
        // Flailing through the air (thrown back, or dragged in head first).
        const flail = Math.sin(this.time * 22);
        set(t, 'shoulderL', 1.5 + flail * 0.5, 0, -1.3);
        set(t, 'shoulderR', 1.5 - flail * 0.5, 0, 1.3);
        set(t, 'elbowL', 0.6, 0, 0);
        set(t, 'elbowR', 0.6, 0, 0);
        set(t, 'hipL', 0.6 - flail * 0.4, 0, -0.3);
        set(t, 'hipR', 0.6 + flail * 0.4, 0, 0.3);
        set(t, 'kneeL', -0.9, 0, 0);
        set(t, 'kneeR', -0.7, 0, 0);
        set(t, 'neck', -0.4, 0, 0);
        // Thrown back: tipped backwards; pulled in: head first.
        this.bodyPitchTarget = e.state === 'pulled' ? -0.8 : 1.1;
        this.bodyRoll = 0.3 * this.recoilSide;
        break;
      }
      case 'down':
      case 'ko': {
        const fall = smooth(p(0.25));
        set(t, 'shoulderL', 0.4, 0, -1.4 * fall);
        set(t, 'shoulderR', 0.2, 0, 1.2 * fall);
        set(t, 'elbowL', 0.3, 0, 0);
        set(t, 'elbowR', 0.8, 0, 0);
        set(t, 'hipL', 0.15, 0, -0.25);
        set(t, 'hipR', 0.6, 0, 0.2);
        set(t, 'kneeL', -0.2, 0, 0);
        set(t, 'kneeR', -1.1, 0, 0);
        set(t, 'neck', 0.2, e.state === 'ko' ? 0.7 : 0.3, 0);
        // Flat on the back (a positive pitch tips the body backwards).
        this.bodyPitchTarget = 1.52 * fall;
        this.pelvisYTarget = -0.84 * fall;
        break;
      }
    }
  }

  private guard(dt: number, speed: number): void {
    const t = this.target;
    const bounce = Math.sin(this.time * 7) * 0.025;
    this.runPhase += speed * dt * 2.8;
    const step = Math.sin(this.runPhase) * Math.min(speed / 2, 1);
    set(t, 'hipL', 0.35 + step * 0.35, 0, -0.12);
    set(t, 'hipR', 0.15 - step * 0.35, 0, 0.12);
    set(t, 'kneeL', -0.55 - Math.max(0, step) * 0.5, 0, 0);
    set(t, 'kneeR', -0.4 - Math.max(0, -step) * 0.5, 0, 0);
    set(t, 'ankleL', 0.2, 0, 0);
    set(t, 'spine', 0.18, -0.2, 0);
    set(t, 'shoulderL', 1.0, 0, -0.35);
    set(t, 'shoulderR', 0.8, 0, 0.35);
    set(t, 'elbowL', 1.9, 0, 0);
    set(t, 'elbowR', 2.0, 0, 0);
    set(t, 'neck', -0.15, 0.2, 0);
    this.pelvisYTarget = -0.12 + bounce;
  }

  private run(dt: number, speed: number, stride: number): void {
    const t = this.target;
    this.runPhase += (speed * dt * Math.PI * 2) / (2.3 * stride);
    const a = Math.min(speed / 5, 1.2);
    const s = Math.sin(this.runPhase);
    const c = Math.cos(this.runPhase);
    set(t, 'hipL', s * 0.75 * a, 0, 0);
    set(t, 'hipR', -s * 0.75 * a, 0, 0);
    set(t, 'kneeL', -(0.2 + 1.1 * Math.max(0, c)) * a, 0, 0);
    set(t, 'kneeR', -(0.2 + 1.1 * Math.max(0, -c)) * a, 0, 0);
    set(t, 'shoulderL', -s * 0.8 * a, 0, -0.15);
    set(t, 'shoulderR', s * 0.8 * a, 0, 0.15);
    set(t, 'elbowL', 1.3, 0, 0);
    set(t, 'elbowR', 1.3, 0, 0);
    set(t, 'spine', 0.25, s * 0.15 * a, 0);
    this.pelvisYTarget = 0.04 * a * Math.abs(c) - 0.04 * a;
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

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}
