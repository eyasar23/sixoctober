import { Scene, Vector3, WebGLRenderer } from 'three';
import { Sound } from './audio/sound';
import { AutoQuality, QUALITY, type QualityLevel } from './config/quality';
import { tuning } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { BlobShadow, LandingDust } from './fx/heroFx';
import { PostFx } from './fx/postFx';
import { tKey } from './i18n';
import { ModeBand } from './modes/modeBand';
import { FollowCamera } from './player/followCamera';
import { createAnchorResult, createZipTarget, findAnchor, findZipTarget } from './player/grapple';
import { HeroFigure } from './player/heroFigure';
import { createSimInput, PlayerSim, type SimEvent } from './player/playerSim';
import { RopeVisual } from './player/ropeVisual';
import { createDebugPanel, type PanelStats } from './ui/debugPanel';
import { Hud } from './ui/hud';
import { createLights, createSky } from './world/atmosphere';
import { BRAND_COUNT, buildCollision, generateCity } from './world/cityGen';
import { CollisionWorld } from './world/collision';
import { createBuildings } from './world/render/buildings';
import { SceneLighting } from './world/render/lighting';
import { createProps } from './world/render/props';
import { createSkyline } from './world/render/skyline';
import { createStreets } from './world/render/streets';
import { createTraffic } from './world/render/traffic';
import './style.css';

// URL options: ?seed=123 rebuilds the city, ?quality=low|medium|high forces a preset,
// ?test exposes hooks for the headless smoke test.
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
if (Number.isFinite(seedParam) && seedParam > 0) tuning.city.seed = Math.floor(seedParam);
const qualityParam = params.get('quality');
if (qualityParam === 'low' || qualityParam === 'medium' || qualityParam === 'high') tuning.quality.preset = qualityParam;
const testMode = params.has('test');

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app element is missing');

// postprocessing renders into its own buffers, so the canvas needs no depth or antialiasing.
const renderer = new WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: false });
renderer.info.autoReset = false;
app.append(renderer.domElement);

// World ---------------------------------------------------------------------------------------
const scene = new Scene();
const lighting = new SceneLighting(tuning);
scene.fog = lighting.fog;
const city = generateCity(tuning.city);
const world = new CollisionWorld();
buildCollision(city, world);

const sky = createSky();
const lights = createLights(tuning);
const buildings = createBuildings(city.buildings, lighting, tuning);
const streets = createStreets(city, lighting, tuning);
const brandNames = Array.from({ length: BRAND_COUNT }, (_, i) => tKey(`brand.${i}`));
const props = createProps(city, lighting, tuning, brandNames);
const traffic = createTraffic(city, lighting, tuning);
scene.add(sky, createSkyline(city.seed), ...lights.lights, buildings.mesh, streets.group, props.group, traffic.mesh);

// Hero ----------------------------------------------------------------------------------------
const modeBand = new ModeBand('grapple');
const sim = new PlayerSim(world, tuning, modeBand.abilities, city.halfSize);
sim.spawn(city.spawn.x, city.spawn.y, city.spawn.z, city.spawn.yaw);
const hero = new HeroFigure(tuning);
const rope = new RopeVisual();
const shadow = new BlobShadow();
const dust = new LandingDust();
const applyMode = (): void => {
  hero.setBandColor(modeBand.mode.glow);
  rope.setColor(modeBand.mode.glow);
  sim.abilities = modeBand.abilities;
};
modeBand.onChange(applyMode);
applyMode();
scene.add(hero.root, rope.mesh, rope.spark, shadow.mesh, dust.group);

const cameraRig = new FollowCamera(tuning, window.innerWidth / window.innerHeight);
cameraRig.yaw = city.spawn.yaw;
const camera = cameraRig.camera;
const postFx = new PostFx(renderer, scene, camera, tuning);

// Interface -----------------------------------------------------------------------------------
const input = new Input(renderer.domElement);
const hud = new Hud(app);
const sound = new Sound(tuning);
const stats: PanelStats = { current: 'high', fpsValue: 0, drawCalls: 0, triangles: 0 };
createDebugPanel(tuning, stats, {
  respawn: () => sim.respawn(),
  rebuildCity: (seed) => {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.location.href = url.toString();
  },
});
input.onPointerLockChange((locked) => {
  if (!locked) return;
  hud.setPlaying(true);
  sound.start();
});
window.addEventListener('keydown', () => sound.start(), { once: true });

// Quality -------------------------------------------------------------------------------------
const autoQuality = new AutoQuality();
const totalCars = traffic.mesh.count;
let qualityLevel: QualityLevel = 'high';
const applyQuality = (level: QualityLevel): void => {
  qualityLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  postFx.applyQuality(q);
  postFx.setSize(window.innerWidth, window.innerHeight);
  traffic.mesh.count = Math.round(totalCars * q.traffic);
  streets.setLampPools(q.lampPools);
  stats.current = tuning.quality.preset === 'auto' ? `auto: ${level}` : level;
};
applyQuality(tuning.quality.preset === 'auto' ? autoQuality.level : tuning.quality.preset);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  postFx.setSize(window.innerWidth, window.innerHeight);
});

// Input → simulation ----------------------------------------------------------------------------
const simInput = createSimInput();
const held = (...codes: string[]): number => (codes.some((code) => input.isHeld(code)) ? 1 : 0);
const buildSimInput = (): void => {
  const forward = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
  const right = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
  const yaw = cameraRig.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let mx = fx * forward + Math.cos(yaw) * right;
  let mz = fz * forward - Math.sin(yaw) * right;
  const length = Math.hypot(mx, mz);
  if (length > 1) {
    mx /= length;
    mz /= length;
  }
  simInput.moveX = mx;
  simInput.moveZ = mz;
  simInput.forward = forward;
  simInput.right = right;
  simInput.camForwardX = fx;
  simInput.camForwardZ = fz;
  simInput.jumpPressed = input.consumePress('Space');
  simInput.jumpHeld = input.isHeld('Space');
  simInput.shiftHeld = input.shiftHeld;
  simInput.divePressed = input.consumePress('KeyC');
  simInput.respawnPressed = input.consumePress('KeyR');
  simInput.aimOrigin.copy(camera.position);
  camera.getWorldDirection(simInput.aimDir);
};

// Test telemetry (only with ?test) ---------------------------------------------------------------
const telemetry = {
  steps: 0,
  nanSteps: 0,
  outside: 0,
  maxSpeedKmh: 0,
  /** Per state: steps, summed and highest speed (km/h). */
  states: {} as Record<string, { steps: number; sumKmh: number; maxKmh: number }>,
  events: {} as Record<string, number>,
  /** CPU time: summed simulation step and whole-frame milliseconds. */
  simMs: 0,
  frameMs: 0,
  frames: 0,
};
const recordStep = (): void => {
  telemetry.steps++;
  const p = sim.position;
  if (!Number.isFinite(p.x + p.y + p.z + sim.velocity.length())) telemetry.nanSteps++;
  if (Math.abs(p.x) > city.halfSize || Math.abs(p.z) > city.halfSize || p.y < -0.01) telemetry.outside++;
  const kmh = sim.speed * 3.6;
  telemetry.maxSpeedKmh = Math.max(telemetry.maxSpeedKmh, kmh);
  const key = sim.state === 'grounded' && sim.sprinting ? 'sprint' : sim.state;
  const entry = (telemetry.states[key] ??= { steps: 0, sumKmh: 0, maxKmh: 0 });
  entry.steps++;
  entry.sumKmh += kmh;
  entry.maxKmh = Math.max(entry.maxKmh, kmh);
};

// Simulation events → effects, sound, HUD -----------------------------------------------------------
let hitStop = 0;
let comicIndex = 0;
const comicAt = new Vector3();
const handleEvent = (event: SimEvent): void => {
  if (testMode) telemetry.events[event.type] = (telemetry.events[event.type] ?? 0) + 1;
  switch (event.type) {
    case 'ropeAttach':
      rope.attach(sim.rope.anchor);
      sound.ropeShot();
      break;
    case 'ropeRelease':
      rope.release();
      sound.ropeRelease();
      if (event.boosted && event.speed > 30 && sim.velocity.y > 2) hero.flip();
      break;
    case 'zipStart':
      rope.attach(sim.zip.attach);
      sound.zip();
      break;
    case 'zipArrive':
      rope.release();
      break;
    case 'noAnchor':
      hud.showNoAnchor();
      sound.noAnchor();
      break;
    case 'land': {
      const weight = event.kind === 'hero' ? 1 : event.kind === 'roll' ? 0.45 : event.kind === 'crouch' ? 0.3 : Math.min(event.impact / 60, 0.15);
      cameraRig.addTrauma(event.kind === 'hero' ? 0.65 : weight * 0.5);
      cameraRig.kickDown(event.kind === 'hero' ? 6 : weight * 4);
      sound.land(weight);
      if ((event.kind === 'hero' || event.kind === 'roll') && tuning.fx.landingDust) dust.burst(sim.position, weight);
      if (event.kind === 'hero') {
        if (tuning.fx.hitStop > 0) hitStop = tuning.fx.hitStop;
        if (tuning.fx.comicImpact) hud.showComic(tKey(`comic.land.${comicIndex++ % 3}`), comicAt.copy(sim.position).setY(sim.position.y + 1.2), camera);
      }
      break;
    }
    case 'diveStart':
    case 'nearMiss':
      sound.whoosh();
      if (event.type === 'nearMiss') cameraRig.addTrauma(0.12);
      break;
    case 'respawn':
      rope.hide();
      hud.showRespawn();
      break;
    default:
      break;
  }
};

// Frame loop -------------------------------------------------------------------------------------
let simTime = 0;
let slowMo = false;
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
const mouse = { x: 0, y: 0 };
const renderPosition = new Vector3();
const hand = new Vector3();
const bob = new Vector3();
const lookDir = new Vector3();
const anchorPreview = createAnchorResult();
const zipPreview = createZipTarget();

const loop = new GameLoop(
  () => tuning.physics.stepRate,
  () => tuning.physics.maxStepsPerFrame,
  {
    step(dt) {
      const started = testMode ? performance.now() : 0;
      buildSimInput();
      sim.step(dt, simInput);
      simTime += dt;
      if (testMode) {
        telemetry.simMs += performance.now() - started;
        recordStep();
      }
    },
    render(alpha, frameDt) {
      const frameStarted = testMode ? performance.now() : 0;
      if (input.consumePress('KeyT')) slowMo = !slowMo;
      hitStop = Math.max(0, hitStop - frameDt);
      loop.timeScale = hitStop > 0 ? 0.04 : slowMo ? tuning.debug.slowMoScale : 1;
      const worldDt = frameDt * loop.timeScale;

      for (const event of sim.events) handleEvent(event);
      sim.events.length = 0;

      input.takeMouseDelta(mouse);
      cameraRig.look(mouse.x, mouse.y);
      renderPosition.lerpVectors(sim.previousPosition, sim.position, alpha);
      const swinging = sim.state === 'swinging';
      cameraRig.update(
        frameDt,
        { position: renderPosition, velocity: sim.velocity, state: sim.state, wallNormal: sim.wallNormal, ropeAnchor: swinging ? sim.rope.anchor : null },
        world,
      );
      sky.position.copy(camera.position);

      const ropeTarget = swinging ? sim.rope.anchor : sim.state === 'zip' ? sim.zip.attach : null;
      hero.update(worldDt, {
        state: sim.state,
        stateTime: sim.stateTime,
        position: renderPosition,
        yaw: sim.yaw,
        velocity: sim.velocity,
        sprinting: sim.sprinting,
        landingKind: sim.landingKind,
        ropeTarget,
        ropeSide: sim.rope.side,
        wallNormal: sim.wallNormal,
      });
      hero.root.updateMatrixWorld(true);
      hero.ropeHand(sim.state === 'zip' || sim.rope.side >= 0 ? 1 : -1, hand);
      rope.retractTime = tuning.rope.retractTime;
      rope.update(worldDt, hand, ropeTarget, swinging && !sim.rope.taut ? 1 : 0, camera);
      shadow.update(renderPosition, world.supportHeight(renderPosition.x, renderPosition.z, 0.3, 0.3, renderPosition.y + 0.05));
      dust.update(worldDt);

      lighting.update(simTime);
      lights.update();
      buildings.update();
      streets.update();
      props.update();
      traffic.update(worldDt);
      sound.update(sim.speed);

      // Where the next rope / zip would go.
      let anchorPoint: Vector3 | null = null;
      if (tuning.rope.showAnchorPreview && (sim.state === 'airborne' || sim.state === 'dive')) {
        if (findAnchor(world, sim.bobPoint(bob), sim.velocity, simInput.camForwardX, simInput.camForwardZ, sim.lastSide, tuning.rope, anchorPreview)) {
          anchorPoint = anchorPreview.point;
        }
      }
      let zipPoint: Vector3 | null = null;
      if (tuning.rope.showZipTarget && (sim.state === 'airborne' || sim.state === 'dive' || swinging)) {
        camera.getWorldDirection(lookDir);
        if (findZipTarget(world, camera.position, lookDir, sim.position, tuning.rope, sim.shape.halfWidth, zipPreview)) zipPoint = zipPreview.attach;
      }

      renderer.info.reset();
      postFx.render(frameDt, sim.speed, sim.state === 'dive');
      stats.drawCalls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;

      fpsFrames++;
      fpsTime += frameDt;
      if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        stats.fpsValue = fps;
        fpsFrames = 0;
        fpsTime = 0;
      }
      const preset = tuning.quality.preset;
      if (preset === 'auto') {
        if (autoQuality.update(frameDt) || qualityLevel !== autoQuality.level) applyQuality(autoQuality.level);
      } else if (preset !== qualityLevel) {
        applyQuality(preset);
      }

      hud.update(
        frameDt,
        {
          state: sim.state,
          sprinting: sim.sprinting,
          speed: sim.speed,
          fps,
          qualityLabel: stats.current,
          showFps: tuning.debug.showFps,
          slowMo: slowMo ? tuning.debug.slowMoScale : null,
          anchorPreview: anchorPoint,
          zipTarget: zipPoint,
          zipCharge: sim.zipCharge,
        },
        camera,
      );
      if (testMode) {
        telemetry.frameMs += performance.now() - frameStarted;
        telemetry.frames++;
      }
    },
  },
);
loop.start();

if (testMode) {
  // Hooks for the headless smoke test (tools/smoke): read state, script time and the camera.
  Object.assign(window, {
    __game: {
      sim,
      tuning,
      telemetry,
      stats,
      cameraRig,
      simTime: () => simTime,
      setLockstep: (steps: number) => {
        loop.lockstepSteps = steps;
      },
      play: () => hud.setPlaying(true),
    },
  });
}
