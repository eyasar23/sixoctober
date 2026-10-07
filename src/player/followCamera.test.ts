import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning, type Tuning } from '../config/tuning';
import { CLIMBABLE, CollisionWorld } from '../world/collision';
import { projectedBoxHeight, wrapAngle } from './cameraMath';
import { FollowCamera, type CameraSubject } from './followCamera';
import { HeroFigure, type HeroFrame } from './heroFigure';

const DEG = Math.PI / 180;
const FPS = 60;

function makeSubject(edit: Partial<CameraSubject> = {}): CameraSubject {
  return {
    position: new Vector3(0, 80, 0),
    velocity: new Vector3(),
    state: 'grounded',
    wallNormal: new Vector3(),
    ropeAnchor: null,
    combat: 0,
    ...edit,
  };
}

function makeCamera(edit?: (copy: Tuning) => void): { rig: FollowCamera; copy: Tuning } {
  const copy = structuredClone(tuning);
  copy.camera.shake = false;
  edit?.(copy);
  const rig = new FollowCamera(copy, 16 / 9);
  rig.skipIntro();
  return { rig, copy };
}

function advance(rig: FollowCamera, subject: CameraSubject, world: CollisionWorld, seconds = 4, fps = FPS): void {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) rig.update(1 / fps, subject, world);
}

/** A full 3D body box, projected by all eight corners rather than distance/FOV alone. */
function bodyBounds(subject: CameraSubject): Box3 {
  return new Box3(
    subject.position.clone().add(new Vector3(-0.35, 0, -0.35)),
    subject.position.clone().add(new Vector3(0.35, tuning.camera.characterHeight, 0.35)),
  );
}

function viewPitch(rig: FollowCamera): number {
  return Math.asin(rig.camera.getWorldDirection(new Vector3()).y) / DEG;
}

describe('reference follow camera', () => {
  it('settles a ground 90 degree turn to 95% within the target band at every tested FPS', () => {
    const times: number[] = [];
    for (const fps of [30, 60, 144]) {
      const { rig } = makeCamera();
      const subject = makeSubject();
      const world = new CollisionWorld();
      advance(rig, subject, world, 4, fps);
      // The new input points left; the camera is still behind the previous direction.
      rig.yaw = Math.PI / 2;
      rig.setMovementKeys(1, true);
      rig.yaw = 0;
      subject.velocity.set(-10, 0, 0);
      let elapsed = 0;
      while (Math.abs(wrapAngle(Math.PI / 2 - rig.yaw)) > (Math.PI / 2) * 0.05 && elapsed < 3) {
        rig.update(1 / fps, subject, world);
        elapsed += 1 / fps;
      }
      expect(elapsed).toBeGreaterThanOrEqual(0.9);
      expect(elapsed).toBeLessThanOrEqual(1.4);
      times.push(elapsed);
    }
    expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(1 / 30 + 1e-6);
  });

  it('does not turn behind backwards ground movement', () => {
    const { rig } = makeCamera();
    const subject = makeSubject();
    const world = new CollisionWorld();
    advance(rig, subject, world);
    rig.yaw = 0;
    rig.setMovementKeys(1, true);
    subject.velocity.set(0, 0, 10);
    advance(rig, subject, world, 2);
    expect(rig.yaw).toBe(0);
    expect(rig.autoAlignActive).toBe(false);
  });

  it('applies mouse yaw immediately and disables automatic alignment for the next 0.6 seconds', () => {
    const { rig, copy } = makeCamera();
    const subject = makeSubject({ state: 'airborne', velocity: new Vector3(-10, 0, 0) });
    const world = new CollisionWorld();
    rig.look(24, 0);
    expect(rig.yaw).toBeCloseTo(-24 * copy.camera.mouseSensitivity, 12);
    const mouseYaw = rig.yaw;
    for (let frame = 0; frame < 36; frame++) {
      rig.update(1 / FPS, subject, world);
      expect(rig.yaw).toBeCloseTo(mouseYaw, 12);
      expect(rig.autoAlignActive).toBe(false);
    }
    advance(rig, subject, world, 0.4);
    expect(rig.yaw).toBeGreaterThan(mouseYaw);
    expect(rig.autoAlignActive).toBe(true);
  });

  it('keeps automatic yaw disabled in the manual preset while still selecting the air profile', () => {
    const { rig } = makeCamera((copy) => { copy.camera.preset = 'manual'; });
    const subject = makeSubject({ state: 'swinging', velocity: new Vector3(-25, 2, 0) });
    advance(rig, subject, new CollisionWorld());
    expect(rig.yaw).toBe(0);
    expect(rig.profile).toBe('AIR');
    expect(rig.autoAlignActive).toBe(false);
  });

  it('preserves a manual mouse pitch offset while the profile contributes its own pitch change', () => {
    const { rig, copy } = makeCamera((config) => { config.camera.preset = 'manual'; });
    const subject = makeSubject();
    const world = new CollisionWorld();
    advance(rig, subject, world);
    rig.look(0, -80);
    const manualGroundPitch = rig.pitch;
    advance(rig, subject, world);
    expect(rig.pitch).toBeCloseTo(manualGroundPitch, 6);
    subject.state = 'airborne';
    advance(rig, subject, world);
    const profileDelta = (copy.camera.profiles.GROUND.pitch - copy.camera.profiles.AIR.pitch) * DEG;
    expect(rig.pitch).toBeCloseTo(manualGroundPitch + profileDelta, 5);
    expect(rig.autoAlignActive).toBe(false);
  });

  it.each([
    { state: 'grounded' as const, profile: 'GROUND', low: 22, high: 30 },
    { state: 'airborne' as const, profile: 'AIR', low: 4, high: 8 },
    { state: 'wallClimb' as const, profile: 'WALL', low: 6, high: 10 },
  ])('projects a $profile body bounding box within $low–$high percent at the base FOV', ({ state, profile, low, high }) => {
    const { rig } = makeCamera((copy) => { copy.camera.fovAtSpeed = copy.camera.fov; });
    const subject = makeSubject({ state, wallNormal: new Vector3(1, 0, 0) });
    advance(rig, subject, new CollisionWorld());
    const percent = projectedBoxHeight(rig.camera, bodyBounds(subject));
    expect(rig.profile).toBe(profile);
    expect(percent).toBeGreaterThanOrEqual(low);
    expect(percent).toBeLessThanOrEqual(high);
  });

  it('widens FOV at speed without moving farther away to compensate for the smaller body', () => {
    const { rig, copy } = makeCamera();
    const subject = makeSubject({ state: 'airborne' });
    const world = new CollisionWorld();
    advance(rig, subject, world);
    const restDistance = rig.distance;
    const restHeight = projectedBoxHeight(rig.camera, bodyBounds(subject));
    subject.velocity.set(0, 0, -copy.movement.topSpeed / 3.6);
    advance(rig, subject, world);
    expect(rig.camera.fov).toBeGreaterThan(copy.camera.fov + 10);
    expect(rig.distance).toBeCloseTo(restDistance, 3);
    expect(projectedBoxHeight(rig.camera, bodyBounds(subject))).toBeLessThan(restHeight);
  });

  it('uses a shallower air view while rising and a steep downward view during a dive', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'airborne', velocity: new Vector3(0, 12, -10) });
    const world = new CollisionWorld();
    advance(rig, subject, world);
    expect(viewPitch(rig)).toBeGreaterThanOrEqual(-10);
    expect(viewPitch(rig)).toBeLessThanOrEqual(-6);
    subject.state = 'dive';
    subject.velocity.set(0, -30, -10);
    advance(rig, subject, world);
    expect(viewPitch(rig)).toBeGreaterThanOrEqual(-45);
    expect(viewPitch(rig)).toBeLessThanOrEqual(-35);
  });

  it('looks upwards while climbing a wall', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'wallClimb', wallNormal: new Vector3(1, 0, 0), velocity: new Vector3(0, 5, 0) });
    advance(rig, subject, new CollisionWorld());
    expect(viewPitch(rig)).toBeGreaterThanOrEqual(15);
    expect(viewPitch(rig)).toBeLessThanOrEqual(30);
  });

  it('keeps a shallow street view for a horizontal wall run with slight vertical drift', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'wallRun', wallNormal: new Vector3(0, 0, 1), velocity: new Vector3(22, -1, 0) });
    advance(rig, subject, new CollisionWorld());
    expect(rig.profile).toBe('WALL');
    expect(viewPitch(rig)).toBeGreaterThanOrEqual(-20);
    expect(viewPitch(rig)).toBeLessThanOrEqual(-10);
  });

  it('banks at most five degrees while swinging and restores a level horizon on the ground', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'swinging', velocity: new Vector3(0, 0, -25), ropeAnchor: new Vector3(30, 110, 0) });
    const world = new CollisionWorld();
    const bank = (): number => {
      const view = rig.camera.getWorldDirection(new Vector3());
      const levelUp = new Vector3(0, 1, 0).addScaledVector(view, -view.y).normalize();
      const actualUp = new Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion).normalize();
      return Math.acos(Math.max(-1, Math.min(1, levelUp.dot(actualUp)))) / DEG;
    };
    advance(rig, subject, world);
    expect(bank()).toBeGreaterThan(0.5);
    expect(bank()).toBeLessThanOrEqual(5 + 1e-4);
    subject.state = 'grounded';
    subject.velocity.set(0, 0, 0);
    subject.ropeAnchor = null;
    advance(rig, subject, world);
    expect(bank()).toBeLessThan(0.01);
  });

  it('uses combat framing only with a close enemy, and returns to ground outside 12 metres', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ combat: 1, combatTarget: new Vector3(3, 80, -4) });
    const world = new CollisionWorld();
    advance(rig, subject, world);
    expect(rig.profile).toBe('COMBAT');
    expect(viewPitch(rig)).toBeLessThanOrEqual(-18);
    expect(viewPitch(rig)).toBeGreaterThanOrEqual(-24);
    subject.combatTarget!.set(0, 80, -13);
    advance(rig, subject, world);
    expect(rig.profile).toBe('GROUND');
  });

  it.each([new Vector3(0, 80, 8), new Vector3(6, 80, 6)])('keeps a nearby attacker behind the hero inside the combat view ($x, $z)', (combatTarget) => {
    const { rig } = makeCamera();
    const subject = makeSubject({ combat: 1, combatTarget });
    advance(rig, subject, new CollisionWorld());
    const enemyChest = combatTarget.clone().add(new Vector3(0, 0.9, 0)).project(rig.camera);
    const heroChest = subject.position.clone().add(new Vector3(0, 1, 0)).project(rig.camera);
    expect(rig.profile).toBe('COMBAT');
    expect(enemyChest.z).toBeGreaterThan(-1);
    expect(enemyChest.z).toBeLessThan(1);
    expect(Math.abs(enemyChest.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(enemyChest.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(heroChest.x)).toBeLessThan(0.05);
  });

  it('shortens the arm for a thin obstacle between the pivot and camera while preserving pitch', () => {
    const { rig, copy } = makeCamera();
    const subject = makeSubject();
    const world = new CollisionWorld();
    advance(rig, subject, world);
    const openDistance = rig.distance;
    const initialPitch = viewPitch(rig);
    world.addBox(-2, 78, 2, 2, 88, 2.2, 0);
    advance(rig, subject, world, 2);
    expect(rig.distance).toBeLessThan(openDistance - 1);
    expect(rig.camera.position.z + copy.camera.collisionRadius).toBeLessThanOrEqual(2 + 1e-4);
    expect(viewPitch(rig)).toBeCloseTo(initialPitch, 1);
  });

  it('preserves the current framing during the first wall attachment grace period', () => {
    const { rig, copy } = makeCamera();
    const subject = makeSubject();
    const world = new CollisionWorld();
    advance(rig, subject, world);
    const initial = rig.camera.position.clone();
    subject.state = 'wallClimb';
    subject.wallNormal.set(1, 0, 0);
    advance(rig, subject, world, copy.camera.wallAttachDelay - 1 / FPS);
    expect(rig.camera.position.distanceTo(initial)).toBeLessThan(0.02);
  });

  it('settles outside the wall, shows an oblique view, and looks down the street during descent', () => {
    const { rig, copy } = makeCamera();
    const world = new CollisionWorld();
    const wall = world.addBox(-20, 0, -100, 0, 200, 100, CLIMBABLE);
    const subject = makeSubject({
      position: new Vector3(0.35, 80, 0),
      state: 'wallClimb',
      wallNormal: new Vector3(1, 0, 0),
      wallBox: wall,
      velocity: new Vector3(0, -5, 0),
    });
    advance(rig, subject, world);
    for (let frame = 0; frame < 120; frame++) {
      rig.update(1 / FPS, subject, world);
      const outward = rig.camera.position.clone().sub(rig.pivot).normalize();
      expect(outward.dot(subject.wallNormal)).toBeGreaterThanOrEqual(copy.camera.wallMinDot - 1e-6);
      expect(rig.camera.position.x).toBeGreaterThan(0);
      const view = rig.camera.getWorldDirection(new Vector3());
      const angle = Math.acos(view.dot(subject.wallNormal.clone().negate())) / DEG;
      expect(angle).toBeGreaterThanOrEqual(35);
      expect(angle).toBeLessThanOrEqual(60);
      expect(viewPitch(rig)).toBeLessThanOrEqual(-40);
    }
  });

  it('keeps the mouse orbit outside the supporting wall', () => {
    const { rig, copy } = makeCamera();
    const subject = makeSubject({ state: 'wallClimb', wallNormal: new Vector3(1, 0, 0) });
    const world = new CollisionWorld();
    advance(rig, subject, world);
    for (let frame = 0; frame < 90; frame++) {
      rig.look(30, 0);
      rig.update(1 / FPS, subject, world);
      const outward = rig.camera.position.clone().sub(rig.pivot).normalize();
      expect(outward.dot(subject.wallNormal)).toBeGreaterThanOrEqual(copy.camera.wallMinDot - 1e-6);
    }
  });

  it('chooses the open side of a stationary wall through obstacle probes', () => {
    for (const blockedSide of [-1, 1]) {
      const { rig } = makeCamera();
      const subject = makeSubject({ position: new Vector3(0.35, 80, 0), state: 'wallClimb', wallNormal: new Vector3(1, 0, 0) });
      const world = new CollisionWorld();
      // A neighbouring tower closes one diagonal; the other opens onto the street.
      const zLow = blockedSide > 0 ? 2 : -12;
      const zHigh = blockedSide > 0 ? 12 : -2;
      world.addBox(2, 0, zLow, 12, 160, zHigh, 0);
      advance(rig, subject, world);
      expect(Math.sign(rig.camera.position.z - rig.pivot.z)).toBe(-blockedSide);
    }
  });

  it('turns a perch view outward toward the city and lets the mouse take over immediately', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'perch', wallNormal: new Vector3(1, 0, 0) });
    const world = new CollisionWorld();
    advance(rig, subject, world);
    expect(rig.profile).toBe('PERCH');
    expect(rig.camera.getWorldDirection(new Vector3()).dot(subject.wallNormal)).toBeGreaterThan(0.85);
    const previousYaw = rig.yaw;
    rig.look(1, 0);
    expect(rig.yaw).not.toBe(previousYaw);
    advance(rig, subject, world, 0.4);
    expect(rig.autoAlignActive).toBe(false);
  });

  it('cancels a cinematic shot on the first mouse pixel', () => {
    const { rig } = makeCamera();
    const subject = makeSubject();
    const world = new CollisionWorld();
    advance(rig, subject, world);
    rig.playShot({ duration: 3, yaw: 1, pitch: 0.35, distance: 10, height: 1.5, side: 1, fov: 70, roll: 0.05, blendIn: 0.5, blendOut: 0.5 });
    expect(rig.shotActive).toBe(true);
    rig.look(1, 0);
    expect(rig.shotActive).toBe(false);
  });

  it('limits position changes during transitions at 30, 60 and 144 FPS', () => {
    for (const fps of [30, 60, 144]) {
      const { rig, copy } = makeCamera();
      const subject = makeSubject();
      const world = new CollisionWorld();
      advance(rig, subject, world, 4, fps);
      for (const state of ['airborne', 'wallClimb', 'perch', 'grounded'] as const) {
        subject.state = state;
        subject.wallNormal.set(1, 0, 0);
        for (let frame = 0; frame < fps * 2; frame++) {
          const previous = rig.camera.position.clone();
          rig.update(1 / fps, subject, world);
          expect(rig.camera.position.distanceTo(previous), `${fps} FPS, ${state}, transition frame ${frame}`).toBeLessThanOrEqual(copy.camera.maxPositionSpeed / fps + 1e-6);
        }
      }
    }
  });

  it('enters a wall view gradually even when the previous camera is opposite its normal', () => {
    for (const fps of [30, 60, 144]) {
      const { rig, copy } = makeCamera();
      const subject = makeSubject();
      const world = new CollisionWorld();
      rig.snapBehind(-Math.PI / 2);
      advance(rig, subject, world, 4, fps);
      subject.state = 'wallClimb';
      subject.wallNormal.set(1, 0, 0);
      for (let frame = 0; frame < fps * 3; frame++) {
        const previous = rig.camera.position.clone();
        rig.update(1 / fps, subject, world);
        expect(rig.camera.position.distanceTo(previous), `${fps} FPS, opposite-normal wall entry, frame ${frame}`).toBeLessThanOrEqual(copy.camera.maxPositionSpeed / fps + 1e-6);
      }
      const outward = rig.camera.position.clone().sub(rig.pivot).normalize();
      expect(outward.dot(subject.wallNormal)).toBeGreaterThanOrEqual(copy.camera.wallMinDot - 1e-6);
    }
  });

  it('keeps held ground input fixed while the camera turns, and captures mouse movement immediately', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ velocity: new Vector3(-10, 0, 0) });
    const world = new CollisionWorld();
    rig.setMovementKeys(1, true);
    const inputYaw = rig.inputYaw;
    for (let frame = 0; frame < 120; frame++) {
      rig.update(1 / FPS, subject, world);
      rig.setMovementKeys(1, true);
      expect(rig.inputYaw).toBe(inputYaw);
    }
    expect(Math.abs(rig.yaw)).toBeGreaterThan(0.1);
    rig.look(12, 0);
    expect(rig.inputYaw).toBeCloseTo(rig.yaw, 12);
    rig.setMovementKeys(0, true);
    expect(rig.inputYaw).toBeCloseTo(rig.yaw, 12);
  });

  it('keeps all camera values finite with zero speed and no usable wall normal', () => {
    const { rig } = makeCamera();
    const subject = makeSubject({ state: 'wallClimb' });
    const world = new CollisionWorld();
    for (const state of ['wallClimb', 'wallRun', 'perch', 'airborne', 'grounded'] as const) {
      subject.state = state;
      advance(rig, subject, world, 2);
      expect([
        rig.yaw, rig.pitch, rig.distance, rig.camera.fov,
        ...rig.camera.position.toArray(), ...rig.camera.quaternion.toArray(), ...rig.pivot.toArray(),
      ].every(Number.isFinite)).toBe(true);
    }
  });

  it('measures the posed hero mesh separately from the calibrated body box for every profile', () => {
    const samples = [
      { profile: 'GROUND', state: 'grounded' as const, velocity: new Vector3(0, 0, -10), normal: new Vector3(), combat: 0, low: 22, high: 30 },
      { profile: 'COMBAT', state: 'action' as const, velocity: new Vector3(), normal: new Vector3(), combat: 1, low: 22, high: 25 },
      { profile: 'AIR', state: 'airborne' as const, velocity: new Vector3(0, 0, -10), normal: new Vector3(), combat: 0, low: 4, high: 8 },
      { profile: 'WALL', state: 'wallClimb' as const, velocity: new Vector3(0, 5, 0), normal: new Vector3(1, 0, 0), combat: 0, low: 6, high: 10 },
      { profile: 'PERCH', state: 'perch' as const, velocity: new Vector3(), normal: new Vector3(0, 0, 1), combat: 0, low: 3, high: 8 },
    ];
    const measurements: Array<{ profile: string; bodyBox: number; meshMean: number; meshMin: number; meshMax: number }> = [];
    for (const sample of samples) {
      const { rig, copy } = makeCamera((config) => {
        config.camera.fovAtSpeed = config.camera.fov;
        config.hero.animateOnTwos = false;
      });
      const subject = makeSubject({ state: sample.state, velocity: sample.velocity, wallNormal: sample.normal, combat: sample.combat, combatTarget: sample.combat ? new Vector3(0, 80, -4) : null });
      const hero = new HeroFigure(copy);
      const frame: HeroFrame = {
        state: subject.state, stateTime: 0, position: subject.position,
        yaw: sample.profile === 'WALL' ? Math.PI / 2 : 0,
        velocity: subject.velocity, sprinting: false, landingKind: 'soft',
        ropeTarget: null, ropeSide: 1, wallNormal: subject.wallNormal,
        action: { kind: 'punch', step: 1, duration: 0.3 }, charge: 0,
      };
      const world = new CollisionWorld();
      const bounds = new Box3();
      const percents: number[] = [];
      for (let index = 0; index < FPS * 6; index++) {
        frame.stateTime = sample.profile === 'COMBAT' ? frame.action.duration / 2 : frame.stateTime + 1 / FPS;
        hero.update(1 / FPS, frame);
        rig.update(1 / FPS, subject, world);
        if (index >= FPS * 4) {
          hero.root.updateMatrixWorld(true);
          hero.figure.mesh.skeleton.update();
          bounds.setFromObject(hero.root, true);
          percents.push(projectedBoxHeight(rig.camera, bounds));
        }
      }
      expect(rig.profile).toBe(sample.profile);
      const round = (value: number): number => Math.round(value * 100) / 100;
      const measurement = {
        profile: sample.profile,
        bodyBox: round(projectedBoxHeight(rig.camera, bodyBounds(subject))),
        meshMean: round(percents.reduce((total, percent) => total + percent, 0) / percents.length),
        meshMin: round(Math.min(...percents)), meshMax: round(Math.max(...percents)),
      };
      measurements.push(measurement);
      expect(percents.every(Number.isFinite)).toBe(true);
    }
    for (const [index, sample] of samples.entries()) {
      const context = `${sample.profile} posed mesh percentages: ${JSON.stringify(measurements[index])}`;
      expect(measurements[index].meshMin, context).toBeGreaterThanOrEqual(sample.low);
      expect(measurements[index].meshMax, context).toBeLessThanOrEqual(sample.high);
    }
  });
});
