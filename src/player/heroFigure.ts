import { type Bone, BoxGeometry, Color, CylinderGeometry, MathUtils, SphereGeometry, Vector3 } from 'three';
import { palette } from '../config/palette';
import { KMH, type Tuning } from '../config/tuning';
import { type Figure, FigureBuilder } from '../figures/articulated';
import type { ModeDefinition } from '../modes/modeBand';
import type { ActionKind, LandingKind, MoveState } from './playerSim';

const JOINTS = ['pelvis', 'spine', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const;
type JointName = (typeof JOINTS)[number];
type Pose = Record<JointName, [number, number, number]>;
/**
 * In poses a positive X angle swings a joint toward the front: hanging limbs forward, and the
 * spine and neck (which point up) forward too, which for them is a negative turn about X.
 */
const POINTS_UP: ReadonlySet<JointName> = new Set(['spine', 'neck']);

/** Armour pieces in the order they snap on (chest first), each on its own bone so it can scale in. */
const ARMOR = ['armorChest', 'armorBelt', 'armorShoulderL', 'armorShoulderR', 'armorForearmL', 'armorForearmR', 'armorKneeL', 'armorKneeR'] as const;

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
  /** Fight move in progress (state 'action'). */
  action: { kind: ActionKind; step: number; duration: number };
  /** Titan charge 0..1. */
  charge: number;
}

const POSE_RATE = 18;
/** Fight moves snap harder between key poses (anticipation → strike → settle). */
const ACTION_POSE_RATE = 42;
const TWOS_RATE = 12;
const FLIP_TIME = 0.6;
const ARMOR_IN = 0.34;
const ARMOR_OUT = 0.16;
const PULSE_TIME = 0.32;

/**
 * Stand-in hero built in code (matches the stage 0 Blender figure): hoodie, jeans, sneakers and
 * the hexagonal ModeBand on the left wrist. One skinned mesh plus an ink outline. Poses are
 * computed every frame and, with "animate on twos", shown 12 times a second like a comic.
 * The costume follows the mode: Titan darkens the hoodie, snaps armour plates on (amber light
 * lines) and makes the stance wider and heavier.
 */
export class HeroFigure {
  readonly figure: Figure;
  private readonly joints = {} as Record<JointName, Bone>;
  private readonly armorBones: Bone[] = [];
  private readonly current = {} as Pose;
  private readonly target = {} as Pose;
  private readonly slotHoodie: number;
  private readonly slotJeans: number;
  private readonly slotBand: number;
  private readonly slotArmorLight: number;
  private readonly baseGlow: Color[];
  private readonly hoodieFrom = new Color();
  private readonly hoodieTo = new Color();
  private readonly jeansFrom = new Color();
  private readonly jeansTo = new Color();
  private readonly bandColor = new Color();
  private readonly pulseColor = new Color();
  private costumeBlend = 1;
  private weight = 0;
  private weightTarget = 0;
  private armorOn = false;
  private armorTime = 99;
  private pulseTime = -1;
  private pelvisY = 0;
  private pelvisYTarget = 0;
  /** Body tilt around the hips: lean along the rope or the velocity (smoothed)… */
  private alignPitch = 0;
  private alignRoll = 0;
  private alignPitchTarget = 0;
  private alignRollTarget = 0;
  /** …plus whole turns for rolls, flips and spin kicks (not smoothed). */
  private spin = 0;
  private spinYaw = 0;
  private runPhase = 0;
  private climbPhase = 0;
  private twosClock = 0;
  private flipTime = -1;
  private poseRate = POSE_RATE;
  private time = 0;

  constructor(private readonly tuning: Tuning) {
    const b = new FigureBuilder();
    this.slotHoodie = b.slot(palette.hoodie);
    this.slotJeans = b.slot(palette.jeans);
    const sneakers = b.slot(palette.sneakers, 0.25);
    const skin = b.slot(palette.skin, 0.2);
    const hair = b.slot(palette.hair, 0.05);
    this.slotBand = b.slot('#000000', 0, new Color('#3FD6FF').multiplyScalar(2.6));
    const armor = b.slot(palette.armor, 0.12);
    this.slotArmorLight = b.slot('#000000', 0, new Color(palette.armorLight).multiplyScalar(2.4));

    const limb = (radiusTop: number, radiusBottom: number, length: number) =>
      new CylinderGeometry(radiusTop, radiusBottom, length, 8).translate(0, -length / 2, 0);

    // The figure faces −Z; its right side is +X.
    b.bone('pelvis', null, 0, 0.98, 0);
    b.part('pelvis', new BoxGeometry(0.34, 0.18, 0.21), this.slotJeans);
    b.bone('spine', 'pelvis', 0, 0.05, 0);
    b.part('spine', new BoxGeometry(0.42, 0.5, 0.25).translate(0, 0.25, 0), this.slotHoodie);
    b.part('spine', new SphereGeometry(0.16, 8, 6).scale(1, 0.55, 0.65).translate(0, 0.47, 0.1), this.slotHoodie);
    b.bone('neck', 'spine', 0, 0.5, 0);
    b.part('neck', new CylinderGeometry(0.05, 0.055, 0.08, 6).translate(0, 0.03, 0), skin, false);
    b.part('neck', new SphereGeometry(0.12, 10, 8).scale(0.95, 1.08, 1.02).translate(0, 0.16, 0), skin);
    b.part('neck', new SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.18, 0.02), hair, false);

    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      b.bone(`shoulder${s}`, 'spine', side * 0.26, 0.44, 0);
      b.part(`shoulder${s}`, limb(0.06, 0.055, 0.3), this.slotHoodie);
      b.bone(`elbow${s}`, `shoulder${s}`, 0, -0.3, 0);
      b.part(`elbow${s}`, limb(0.055, 0.048, 0.27), this.slotHoodie);
      b.bone(`wrist${s}`, `elbow${s}`, 0, -0.27, 0);
      b.part(`wrist${s}`, new BoxGeometry(0.075, 0.1, 0.065).translate(0, -0.05, 0), skin);
      // ModeBand: thick hexagonal band on the left wrist.
      if (side < 0) b.part('elbowL', new CylinderGeometry(0.07, 0.07, 0.065, 6).translate(0, -0.22, 0), this.slotBand);
      b.bone(`hip${s}`, 'pelvis', side * 0.1, -0.02, 0);
      b.part(`hip${s}`, limb(0.085, 0.07, 0.44), this.slotJeans);
      b.bone(`knee${s}`, `hip${s}`, 0, -0.44, 0);
      b.part(`knee${s}`, limb(0.068, 0.058, 0.42), this.slotJeans);
      b.bone(`ankle${s}`, `knee${s}`, 0, -0.42, 0);
      b.part(`ankle${s}`, new BoxGeometry(0.12, 0.09, 0.27).translate(0, -0.035, -0.06), sneakers);

      // Titan armour (scaled to zero while Kanca is on).
      b.bone(`armorShoulder${s}`, `shoulder${s}`, side * 0.02, 0.02, 0);
      b.part(`armorShoulder${s}`, new SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.25, 0.85, 1.15), armor);
      b.part(`armorShoulder${s}`, new BoxGeometry(0.2, 0.025, 0.03).translate(side * 0.02, 0.07, -0.14), this.slotArmorLight, false);
      // The left gauntlet stops short of the band so the band stays visible.
      const gauntlet = side < 0 ? 0.13 : 0.2;
      b.bone(`armorForearm${s}`, `elbow${s}`, 0, -0.03, 0);
      b.part(`armorForearm${s}`, new CylinderGeometry(0.078, 0.072, gauntlet, 6).translate(0, -gauntlet / 2, 0), armor);
      b.part(`armorForearm${s}`, new CylinderGeometry(0.081, 0.081, 0.022, 6).translate(0, -gauntlet + 0.02, 0), this.slotArmorLight, false);
      b.bone(`armorKnee${s}`, `knee${s}`, 0, 0, 0);
      b.part(`armorKnee${s}`, new BoxGeometry(0.13, 0.17, 0.07).translate(0, -0.03, -0.07), armor);
    }
    b.bone('armorChest', 'spine', 0, 0, 0);
    b.part('armorChest', new BoxGeometry(0.46, 0.34, 0.07).translate(0, 0.3, -0.15), armor);
    b.part('armorChest', new BoxGeometry(0.44, 0.36, 0.06).translate(0, 0.28, 0.15), armor);
    // Amber chevron on the chest plate (a power core, not a letter).
    for (const side of [-1, 1]) {
      b.part('armorChest', new BoxGeometry(0.13, 0.032, 0.02).rotateZ(side * 0.6).translate(side * 0.048, 0.31, -0.19), this.slotArmorLight, false);
    }
    b.bone('armorBelt', 'pelvis', 0, 0, 0);
    b.part('armorBelt', new BoxGeometry(0.38, 0.07, 0.25).translate(0, 0.05, 0), armor);

    this.figure = b.build(palette.ink, tuning.hero.outlineWidth);
    for (const name of JOINTS) {
      this.joints[name] = this.figure.bone(name);
      this.current[name] = [0, 0, 0];
      this.target[name] = [0, 0, 0];
    }
    for (const name of ARMOR) {
      const bone = this.figure.bone(name);
      bone.scale.setScalar(1e-3);
      this.armorBones.push(bone);
    }
    this.baseGlow = this.figure.glows.value.map((c) => c.clone());
    this.hoodieFrom.set(palette.hoodie);
    this.hoodieTo.set(palette.hoodie);
    this.jeansFrom.set(palette.jeans);
    this.jeansTo.set(palette.jeans);
    this.bandColor.set('#3FD6FF');
  }

  get root(): Figure['root'] {
    return this.figure.root;
  }

  /**
   * Puts on a mode's costume. `animate`: armour snaps on piece by piece and colours blend over
   * the transformation; otherwise everything changes at once.
   */
  setCostume(mode: ModeDefinition, animate: boolean): void {
    const c = mode.costume;
    this.hoodieFrom.copy(this.figure.colors.value[this.slotHoodie]!);
    this.jeansFrom.copy(this.figure.colors.value[this.slotJeans]!);
    this.hoodieTo.set(c.hoodie);
    this.jeansTo.set(c.jeans);
    this.costumeBlend = animate ? 0 : 1;
    this.weightTarget = c.weight;
    if (!animate) this.weight = c.weight;
    if (c.armor !== this.armorOn) {
      this.armorOn = c.armor;
      this.armorTime = animate ? 0 : 99;
    }
    this.bandColor.set(mode.glow);
    this.baseGlow[this.slotBand]!.set(mode.glow).multiplyScalar(2.6);
  }

  /** A bright flash over the whole figure (mode switch). */
  pulse(hex: string): void {
    this.pulseColor.set(hex);
    this.pulseTime = 0;
  }

  /** Front flip (creative: after letting go of a fast swing). */
  flip(): void {
    if (this.tuning.hero.releaseFlip) this.flipTime = 0;
  }

  /** World position of the hand holding the rope. */
  ropeHand(side: number, out: Vector3): Vector3 {
    return this.figure.bone(side < 0 ? 'wristL' : 'wristR').getWorldPosition(out);
  }

  /** `dt`: simulated seconds (slow motion slows the animation too). */
  update(dt: number, f: HeroFrame): void {
    const hero = this.tuning.hero;
    this.time += dt;
    this.root.position.copy(f.position);
    this.root.rotation.set(0, f.yaw, 0);
    this.figure.setOutline(hero.outline, hero.outlineWidth);
    this.updateCostume(dt);

    this.buildPose(dt, f);
    const k = 1 - Math.exp(-this.poseRate * dt);
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
      this.joints[name].rotation.set(POINTS_UP.has(name) ? -c[0] : c[0], c[1], c[2]);
    }
    const pelvis = this.joints.pelvis;
    pelvis.position.y = 0.98 + this.pelvisY;
    pelvis.rotation.x += this.alignPitch + this.spin;
    pelvis.rotation.y += this.spinYaw;
    pelvis.rotation.z += this.alignRoll;
  }

  private updateCostume(dt: number): void {
    const colors = this.figure.colors.value;
    if (this.costumeBlend < 1) {
      this.costumeBlend = Math.min(1, this.costumeBlend + dt / ARMOR_IN);
      const e = this.costumeBlend * this.costumeBlend * (3 - 2 * this.costumeBlend);
      colors[this.slotHoodie]!.copy(this.hoodieFrom).lerp(this.hoodieTo, e);
      colors[this.slotJeans]!.copy(this.jeansFrom).lerp(this.jeansTo, e);
    } else {
      colors[this.slotHoodie]!.copy(this.hoodieTo);
      colors[this.slotJeans]!.copy(this.jeansTo);
    }
    this.weight += (this.weightTarget - this.weight) * (1 - Math.exp(-8 * dt));

    // Armour: pieces snap on one after another with an overshoot, or pop off quickly.
    this.armorTime += dt;
    this.armorBones.forEach((bone, i) => {
      let s: number;
      if (this.armorOn) {
        const p = MathUtils.clamp((this.armorTime - i * 0.03) / ARMOR_IN, 0, 1);
        s = p <= 0 ? 0 : backOut(p);
      } else {
        const p = MathUtils.clamp((this.armorTime - i * 0.012) / ARMOR_OUT, 0, 1);
        s = p >= 1 ? 0 : 1 + 0.25 * Math.sin(p * Math.PI) - p;
      }
      bone.scale.setScalar(Math.max(s, 1e-3));
    });

    // Glow: base glow plus a fading flash, and the armour lights breathe a little.
    const glows = this.figure.glows.value;
    let flash = 0;
    if (this.pulseTime >= 0) {
      this.pulseTime += dt;
      flash = Math.max(0, 1 - this.pulseTime / PULSE_TIME);
      if (flash <= 0) this.pulseTime = -1;
    }
    glows.forEach((glow, i) => {
      glow.copy(this.baseGlow[i]!);
      if (i === this.slotArmorLight) glow.multiplyScalar(0.85 + 0.15 * Math.sin(this.time * 4));
      if (flash > 0) {
        const k = flash * flash * 1.6;
        glow.r += this.pulseColor.r * k;
        glow.g += this.pulseColor.g * k;
        glow.b += this.pulseColor.b * k;
      }
    });
  }

  private buildPose(dt: number, f: HeroFrame): void {
    const t = this.target;
    const v = f.velocity;
    const speed = Math.hypot(v.x, v.z);
    this.alignPitchTarget = 0;
    this.alignRollTarget = 0;
    this.spin = 0;
    this.spinYaw = 0;
    this.pelvisYTarget = 0;
    this.poseRate = POSE_RATE;
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
        const stride = this.tuning.hero.strideLength * (1 + this.weight * 0.3);
        this.runPhase += (speed * dt * Math.PI * 2) / stride;
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
      case 'perch':
        this.perchPose(f.stateTime);
        break;
      case 'charge':
        this.chargePose(f.charge);
        break;
      case 'pound':
        this.poundPose(f);
        break;
      case 'action':
        this.actionPose(f);
        break;
      case 'down':
        this.downPose(f.stateTime);
        break;
    }
    if (f.state === 'grounded' || f.state === 'landing') this.addWeight();

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

  /** Titan's heavier stance on the ground: wider legs, bent knees, arms held out, lower hips. */
  private addWeight(): void {
    const w = this.weight;
    if (w < 0.01) return;
    const t = this.target;
    t.hipL[2] -= 0.13 * w;
    t.hipR[2] += 0.13 * w;
    t.kneeL[0] -= 0.18 * w;
    t.kneeR[0] -= 0.18 * w;
    t.hipL[0] += 0.12 * w;
    t.hipR[0] += 0.12 * w;
    t.shoulderL[2] -= 0.28 * w;
    t.shoulderR[2] += 0.28 * w;
    t.elbowL[0] += 0.25 * w;
    t.elbowR[0] += 0.25 * w;
    t.spine[0] += 0.1 * w;
    t.neck[0] -= 0.06 * w;
    this.pelvisYTarget -= 0.09 * w;
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
    const heavy = 1 + this.weight * 0.25;
    set(t, 'hipL', s * 0.75 * a, 0, 0);
    set(t, 'hipR', -s * 0.75 * a, 0, 0);
    set(t, 'kneeL', -(0.2 + 1.15 * Math.max(0, c)) * a, 0, 0);
    set(t, 'kneeR', -(0.2 + 1.15 * Math.max(0, -c)) * a, 0, 0);
    set(t, 'ankleL', 0.25 * s * a, 0, 0);
    set(t, 'ankleR', -0.25 * s * a, 0, 0);
    set(t, 'shoulderL', -s * 0.85 * a * heavy, 0, -0.12);
    set(t, 'shoulderR', s * 0.85 * a * heavy, 0, 0.12);
    set(t, 'elbowL', 1.1 + (sprint ? 0.4 : 0), 0, 0);
    set(t, 'elbowR', 1.1 + (sprint ? 0.4 : 0), 0, 0);
    set(t, 'spine', 0.1 + (sprint ? 0.3 : 0.14) * Math.min(a, 1), s * 0.14 * a * heavy, 0);
    this.pelvisYTarget = (0.05 * a * Math.abs(c) - 0.04 * a) * heavy;
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

  /** Gargoyle crouch on a ledge: knees deep, one hand on the edge, looking out over the street. */
  private perchPose(time: number): void {
    const t = this.target;
    const settle = Math.min(time / 0.25, 1);
    const breathe = Math.sin(time * 2) * 0.03;
    set(t, 'hipL', 1.95, 0, -0.32);
    set(t, 'hipR', 1.75, 0, 0.3);
    set(t, 'kneeL', -2.35, 0, 0);
    set(t, 'kneeR', -2.2, 0, 0);
    set(t, 'ankleL', 0.55, 0, 0);
    set(t, 'ankleR', 0.5, 0, 0);
    set(t, 'spine', 0.55 + breathe, 0, 0);
    set(t, 'neck', -0.45 - breathe, 0, 0);
    set(t, 'shoulderR', 1.15, 0, 0.12);
    set(t, 'elbowR', 0.25, 0, 0);
    set(t, 'shoulderL', 0.45, 0, -0.35);
    set(t, 'elbowL', 1.5, 0, 0);
    this.pelvisYTarget = -0.62 + 0.12 * (1 - settle);
  }

  /** Titan charging: deep squat, fists pulled back, shaking harder as the charge fills. */
  private chargePose(charge: number): void {
    const t = this.target;
    const shake = Math.sin(this.time * 60) * 0.03 * charge;
    const c = 0.4 + 0.6 * charge;
    set(t, 'hipL', 1.45 * c, 0, -0.22);
    set(t, 'hipR', 1.45 * c, 0, 0.22);
    set(t, 'kneeL', -2.0 * c, 0, 0);
    set(t, 'kneeR', -2.0 * c, 0, 0);
    set(t, 'ankleL', 0.5 * c, 0, 0);
    set(t, 'ankleR', 0.5 * c, 0, 0);
    set(t, 'spine', 0.45 * c + shake, 0, 0);
    set(t, 'shoulderL', -0.65, 0, -0.45);
    set(t, 'shoulderR', -0.65, 0, 0.45);
    set(t, 'elbowL', 1.7, 0, 0);
    set(t, 'elbowR', 1.7, 0, 0);
    set(t, 'neck', -0.3, 0, 0);
    this.pelvisYTarget = -0.5 * c + shake;
  }

  /** Ground pound: a tucked hang with both fists overhead, then a straight slam fists-first. */
  private poundPose(f: HeroFrame): void {
    const t = this.target;
    const hang = f.stateTime < this.tuning.titan.poundHang;
    if (hang) {
      tuck(t, 0.7);
      set(t, 'shoulderL', 2.9, 0, 0.25);
      set(t, 'shoulderR', 2.9, 0, -0.25);
      set(t, 'elbowL', 0.5, 0, 0);
      set(t, 'elbowR', 0.5, 0, 0);
    } else {
      set(t, 'shoulderL', 2.8, 0, -0.15);
      set(t, 'shoulderR', 2.8, 0, 0.15);
      set(t, 'elbowL', 0.15, 0, 0);
      set(t, 'elbowR', 0.15, 0, 0);
      set(t, 'hipL', 0.25, 0, -0.1);
      set(t, 'hipR', 0.15, 0, 0.1);
      set(t, 'kneeL', -0.5, 0, 0);
      set(t, 'kneeR', -0.4, 0, 0);
      set(t, 'spine', 0.15, 0, 0);
      this.poseRate = ACTION_POSE_RATE;
    }
  }

  /** Fight moves, each with anticipation → strike → settle over the move's duration. */
  private actionPose(f: HeroFrame): void {
    const t = this.target;
    const a = f.action;
    const p = MathUtils.clamp(f.stateTime / Math.max(a.duration, 1e-3), 0, 1);
    // 0 = wind-up, 1 = full extension; settles back after the hit.
    const strike = p < 0.3 ? -smooth(p / 0.3) : p < 0.5 ? smooth((p - 0.3) / 0.2) * 2 - 1 : 1 - smooth((p - 0.5) / 0.5) * 0.7;
    const out = Math.max(strike, 0);
    const wind = Math.max(-strike, 0);
    this.poseRate = ACTION_POSE_RATE;
    const heavy = this.weight;
    switch (a.kind) {
      case 'punch':
        if (a.step === 2) {
          // Left hook.
          set(t, 'shoulderL', 0.2 + 1.25 * out, 0.0, -0.3 - 0.6 * out + 0.4 * wind);
          set(t, 'elbowL', 1.6 - 0.2 * out, 0, 0);
          set(t, 'shoulderR', 0.6, 0, 0.3);
          set(t, 'elbowR', 1.9, 0, 0);
          set(t, 'spine', 0.15, -0.45 * wind + 0.55 * out, 0);
        } else if (a.step === 3) {
          // Uppercut: from a crouch, rising through the fist.
          set(t, 'shoulderR', -0.4 * wind + 2.5 * out, 0, 0.15);
          set(t, 'elbowR', 1.9 - 1.3 * out, 0, 0);
          set(t, 'shoulderL', 0.4, 0, -0.5);
          set(t, 'elbowL', 1.6, 0, 0);
          set(t, 'spine', 0.4 * wind - 0.15 * out, 0.3 * wind - 0.2 * out, 0);
          set(t, 'hipL', 0.6 * wind, 0, -0.1);
          set(t, 'hipR', 0.5 * wind, 0, 0.1);
          set(t, 'kneeL', -0.9 * wind, 0, 0);
          set(t, 'kneeR', -0.8 * wind, 0, 0);
          this.pelvisYTarget = -0.25 * wind + 0.08 * out;
        } else {
          // Right straight.
          set(t, 'shoulderR', -0.35 * wind + 1.6 * out, 0, 0.15);
          set(t, 'elbowR', 1.8 - 1.65 * out, 0, 0);
          set(t, 'shoulderL', 0.5, 0, -0.3);
          set(t, 'elbowL', 1.9, 0, 0);
          set(t, 'spine', 0.12, 0.35 * wind - 0.5 * out, 0);
          set(t, 'hipL', 0.35, 0, 0);
          set(t, 'kneeL', -0.35, 0, 0);
        }
        break;
      case 'kick':
        if (a.step === 2) {
          // Roundhouse with the left leg.
          set(t, 'hipL', 0.4 + 0.9 * out, 0, -0.2 - 1.0 * out);
          set(t, 'kneeL', -1.6 + 1.45 * out, 0, 0);
          set(t, 'hipR', 0.1, 0, 0.1);
          set(t, 'kneeR', -0.3, 0, 0);
          set(t, 'spine', -0.1, 0.4 * out, 0.35 * out);
          set(t, 'shoulderL', 0.3, 0, -0.9);
          set(t, 'shoulderR', 0.3, 0, 0.9);
        } else if (a.step === 3) {
          // Spinning kick: a full turn, the right leg out.
          this.spinYaw = -smooth(p) * Math.PI * 2;
          set(t, 'hipR', 0.5 + 0.7 * out, 0, 0.2 + 1.1 * out);
          set(t, 'kneeR', -1.4 + 1.35 * out, 0, 0);
          set(t, 'hipL', 0.3, 0, 0);
          set(t, 'kneeL', -0.5, 0, 0);
          set(t, 'spine', -0.15 * out, 0, -0.3 * out);
          set(t, 'shoulderL', 0.2, 0, -1.2);
          set(t, 'shoulderR', 0.2, 0, 1.2);
          this.pelvisYTarget = 0.1 * out;
        } else {
          // Front kick.
          set(t, 'hipR', 0.9 * wind + 1.55 * out, 0, 0);
          set(t, 'kneeR', -1.8 * wind - 1.7 + 1.65 * out, 0, 0);
          set(t, 'ankleR', -0.3 * out, 0, 0);
          set(t, 'hipL', -0.1, 0, 0);
          set(t, 'kneeL', -0.35, 0, 0);
          set(t, 'spine', -0.2 * out, 0, 0);
          set(t, 'shoulderL', 0.4, 0, -0.6);
          set(t, 'shoulderR', 0.4, 0, 0.6);
          set(t, 'elbowL', 1.3, 0, 0);
          set(t, 'elbowR', 1.3, 0, 0);
        }
        break;
      case 'counter':
        // Duck under, then a spinning elbow.
        this.spinYaw = -smooth(MathUtils.clamp((p - 0.15) / 0.5, 0, 1)) * Math.PI * 2;
        set(t, 'shoulderR', 1.3, 0, 0.7);
        set(t, 'elbowR', 2.3, 0, 0);
        set(t, 'shoulderL', 0.5, 0, -0.8);
        set(t, 'elbowL', 1.2, 0, 0);
        set(t, 'hipL', 0.7 * wind, 0, -0.15);
        set(t, 'hipR', 0.7 * wind, 0, 0.15);
        set(t, 'kneeL', -1.1 * wind - 0.3, 0, 0);
        set(t, 'kneeR', -1.1 * wind - 0.3, 0, 0);
        set(t, 'spine', 0.3 + 0.2 * wind, 0, 0);
        this.pelvisYTarget = -0.3 * wind;
        break;
      case 'pull': {
        // Rope pull: arm thrown forward, then yanked back with the body leaning away.
        const yank = smooth(MathUtils.clamp((p - 0.25) / 0.35, 0, 1));
        set(t, 'shoulderR', 1.65 - 1.4 * yank, 0, 0.1);
        set(t, 'elbowR', 0.1 + 1.6 * yank, 0, 0);
        set(t, 'shoulderL', 0.8, 0, -0.5);
        set(t, 'elbowL', 1.0, 0, 0);
        set(t, 'spine', 0.1 - 0.35 * yank, -0.3 * yank, 0);
        set(t, 'hipR', 0.3 * yank, 0, 0);
        set(t, 'kneeL', -0.5 * yank, 0, 0);
        break;
      }
      case 'hurt': {
        // Knocked back: head and chest snap back, arms fly out, then recover.
        const hit = 1 - smooth(p);
        set(t, 'spine', -0.55 * hit, 0.2 * hit, 0);
        set(t, 'neck', -0.4 * hit, 0, 0);
        set(t, 'shoulderL', 0.6 * hit, 0, -1.0 * hit);
        set(t, 'shoulderR', 0.9 * hit, 0, 1.1 * hit);
        set(t, 'elbowL', 0.6, 0, 0);
        set(t, 'elbowR', 0.4, 0, 0);
        set(t, 'hipL', 0.4 * hit, 0, 0);
        set(t, 'kneeL', -0.6 * hit, 0, 0);
        set(t, 'kneeR', -0.3, 0, 0);
        break;
      }
    }
    if (heavy > 0.01 && a.kind !== 'hurt') {
      // Titan strikes: lower and wider.
      this.pelvisYTarget -= 0.08 * heavy;
      t.hipL[2] -= 0.1 * heavy;
      t.hipR[2] += 0.1 * heavy;
    }
  }

  private downPose(time: number): void {
    const t = this.target;
    const fall = smooth(Math.min(time / 0.35, 1));
    set(t, 'shoulderL', 0.3, 0, -1.3 * fall);
    set(t, 'shoulderR', 0.6, 0, 1.0 * fall);
    set(t, 'elbowL', 0.4, 0, 0);
    set(t, 'elbowR', 0.9, 0, 0);
    set(t, 'hipL', 0.2, 0, -0.2);
    set(t, 'hipR', 0.5, 0, 0.15);
    set(t, 'kneeL', -0.3, 0, 0);
    set(t, 'kneeR', -0.9, 0, 0);
    set(t, 'neck', 0.2, 0.4, 0);
    // Flat on the back (a positive pitch tips the body backwards).
    this.alignPitchTarget = 1.5 * fall;
    this.pelvisYTarget = -0.82 * fall;
  }

  private landingPose(f: HeroFrame): void {
    const t = this.target;
    const m = this.tuning.movement;
    if (f.landingKind === 'hero') {
      const rise = MathUtils.smoothstep(f.stateTime / m.heroLandTime, 0.55, 1);
      const heavy = this.weight;
      // Superhero landing: one knee down, a fist on the ground, the other arm swept back.
      // Titan lands on both fists.
      set(t, 'hipL', MathUtils.lerp(1.25, 0.2, rise), 0, -0.1 - 0.15 * heavy);
      set(t, 'kneeL', MathUtils.lerp(-2.3, -0.4, rise), 0, 0);
      set(t, 'hipR', MathUtils.lerp(-0.45 + 1.4 * heavy, 0, rise), 0, 0.12 + 0.15 * heavy);
      set(t, 'kneeR', MathUtils.lerp(-2.05, -0.3, rise), 0, 0);
      set(t, 'ankleR', MathUtils.lerp(0.8, 0, rise), 0, 0);
      set(t, 'shoulderR', MathUtils.lerp(0.95, 0.1, rise), 0, 0.15);
      set(t, 'elbowR', MathUtils.lerp(0.15, 0.3, rise), 0, 0);
      set(t, 'shoulderL', MathUtils.lerp(-0.7 + 1.65 * heavy, 0.05, rise), 0, MathUtils.lerp(-0.95 + 0.8 * heavy, -0.15, rise));
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

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

/** Overshoots past 1 and settles (armour snapping on). */
function backOut(x: number): number {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
