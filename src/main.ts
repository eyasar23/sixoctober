import { Scene, Vector3, WebGLRenderer } from 'three';
import { Sound } from './audio/sound';
import { type CombatInput, CombatSystem } from './combat/combatSystem';
import { EnemyViews } from './combat/enemyViews';
import { AutoQuality, QUALITY, type QualityLevel } from './config/quality';
import { tuning } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { CrimeDirector } from './crime/crimeDirector';
import { CrimeSceneView } from './crime/crimeScene';
import { FxPool } from './fx/fxPool';
import { BlobShadow, LandingDust } from './fx/heroFx';
import { LedgeHighlight } from './fx/ledgeHighlight';
import { PostFx } from './fx/postFx';
import { Feedback } from './game/feedback';
import { applySettings, frameRateCap, loadSettings, markTutorialDone, saveSettings, tutorialDone } from './game/settings';
import { Tutorial } from './game/tutorial';
import { t, tKey } from './i18n';
import { MODE_LIST } from './modes';
import { ModeBand } from './modes/modeBand';
import { FollowCamera } from './player/followCamera';
import { createAnchorResult, createLedgeTarget, createZipTarget, findAnchor, findLedge, findZipTarget } from './player/grapple';
import { HeroFigure } from './player/heroFigure';
import { createSimInput, PlayerSim } from './player/playerSim';
import { RopeVisual } from './player/ropeVisual';
import { ComicFx } from './ui/comicFx';
import { createDebugPanel, type PanelStats } from './ui/debugPanel';
import { Hud, type HudCrime } from './ui/hud';
import { buildControlsCard, Menu } from './ui/menu';
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
const modeBand = new ModeBand(MODE_LIST);
const sim = new PlayerSim(world, tuning, modeBand.mode, city.halfSize);
sim.spawn(city.spawn.x, city.spawn.y, city.spawn.z, city.spawn.yaw);
const perchOnTower = (): void => {
  const p = city.perch;
  sim.perchAt(p.x, p.y, p.z, p.nx, p.nz);
};
perchOnTower();
/** Tutorial start: the back of the spawn tower's roof, facing the avenue (room to sprint and jump off). */
const toTutorialStart = (): void => {
  sim.respawnAt(city.spawn.x, city.spawn.y, city.spawn.z + 32, city.spawn.yaw);
};
const hero = new HeroFigure(tuning);
const rope = new RopeVisual();
const shadow = new BlobShadow();
const dust = new LandingDust();
const fxPool = new FxPool();
const ledgeGlow = new LedgeHighlight();
hero.setCostume(modeBand.mode, false);
rope.setColor(modeBand.mode.glow);
scene.add(hero.root, rope.mesh, rope.spark, shadow.mesh, dust.group, fxPool.mesh, ledgeGlow.group);

// Fight and crime -------------------------------------------------------------------------------
const combat = new CombatSystem(tuning, sim, world);
const enemyViews = new EnemyViews(tuning, world);
const crime = new CrimeDirector(city, tuning.crime, combat);
const crimeScene = new CrimeSceneView();
scene.add(enemyViews.group, crimeScene.group);

const cameraRig = new FollowCamera(tuning, window.innerWidth / window.innerHeight);
cameraRig.yaw = city.spawn.yaw;
const camera = cameraRig.camera;
const postFx = new PostFx(renderer, scene, camera, tuning);

// Interface -----------------------------------------------------------------------------------
const input = new Input(renderer.domElement);
input.allowUnlocked = testMode;
const hud = new Hud(app, city);
const comic = new ComicFx(app);
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
const feedback = new Feedback({ tuning, sim, modeBand, hero, rope, cameraRig, camera, comic, hud, sound, fx: fxPool, dust, traffic, crimeScene, combat, enemyViews });

// Settings (saved in this browser) ----------------------------------------------------------------
const baseSensitivity = tuning.camera.mouseSensitivity;
const settings = loadSettings(tuning);
const applyAllSettings = (): void => {
  applySettings(settings, tuning, baseSensitivity);
  loop.maxFps = frameRateCap(settings.frameRate);
};

// Game flow: title screen → play (tutorial the first time) → Esc pauses → resume ----------------
type GameState = 'title' | 'playing' | 'paused';
let gameState: GameState = 'title';
const tutorial = new Tutorial(app, sim, {
  spawnDummy: () => {
    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    const x = sim.position.x + fx * 4.5;
    const z = sim.position.z + fz * 4.5;
    const dummy = combat.spawn('grunt', x, world.supportHeight(x, z, 0.3, 0.3, sim.position.y + 1), z);
    dummy.passive = true;
    dummy.alerted = true;
    return dummy;
  },
  removeDummy: (dummy) => combat.remove(dummy),
  stepDone: () => sound.ding(),
  finished: (completed) => {
    markTutorialDone();
    menu.setTutorialActive(false);
    if (completed) comic.showBanner(t('tutorial.doneTitle'), t('tutorial.doneSub'), 3.5, 'win');
    if (crime.phase === 'none') crime.begin(sim.position);
  },
});
const menu = new Menu(app, settings, {
  play: () => {
    requestLock();
    const first = !tutorialDone();
    if (first) toTutorialStart();
    enterPlaying(first);
  },
  tutorial: () => {
    requestLock();
    toTutorialStart();
    cameraRig.snapBehind(sim.yaw);
    enterPlaying(true);
  },
  resume: () => {
    requestLock();
    enterPlaying(false);
  },
  skipTutorial: () => {
    tutorial.skip();
    requestLock();
    enterPlaying(false);
  },
  toTitle: () => {
    gameState = 'title';
    menu.open('title');
    cameraRig.playShot(titleShot);
  },
  settingsChanged: () => {
    applyAllSettings();
    saveSettings(settings);
  },
});
const controlCard = document.createElement('div');
controlCard.className = 'control-card-overlay';
controlCard.append(buildControlsCard());
controlCard.hidden = true;
app.append(controlCard);

const requestLock = (): void => {
  sound.start();
  if (testMode) return;
  renderer.domElement.requestPointerLock().catch(() => {
    // Refused (e.g. right after Esc): clicking the game tries again.
  });
};
/** Into the game; `withTutorial` starts the tutorial (first visit or from the menu). */
const enterPlaying = (withTutorial: boolean): void => {
  const fromTitle = gameState === 'title';
  gameState = 'playing';
  menu.close();
  input.clearPresses();
  if (fromTitle) {
    cameraRig.skipIntro();
    cameraRig.yaw = sim.yaw;
    cameraRig.pitch = 0.3;
    cameraRig.zoomLevel = 1;
    cameraRig.endShot();
  }
  if (withTutorial && !tutorial.active) {
    menu.setTutorialActive(true);
    tutorial.start();
  } else if (!tutorial.active && crime.phase === 'none') {
    crime.begin(sim.position);
  }
};
input.onPointerLockChange((locked) => {
  if (locked && gameState === 'paused') enterPlaying(false);
  if (!locked && gameState === 'playing' && !testMode) {
    gameState = 'paused';
    controlCard.hidden = true;
    menu.open('pause');
  }
});
// A click on the game while paused (outside the menu) resumes.
renderer.domElement.addEventListener('click', () => {
  if (gameState === 'playing' && !testMode && !document.pointerLockElement) requestLock();
});
window.addEventListener('keydown', () => sound.start(), { once: true });

// Mode switch: costume, burst, comic panel and a beat of slow motion (signature moment).
let transformTime = -1;
const heroChest = new Vector3();
/** Title screen framing: the perched hero on the right third, the avenue beyond, slowly turning. */
const titleShot = { duration: 1e9, yaw: 0.35, pitch: 0.16, distance: 8.5, height: 1.4, side: -2.6, fov: 56, roll: -0.04, blendIn: 0.01, blendOut: 1.2 };
modeBand.onChange((mode) => {
  hero.setCostume(mode, true);
  hero.pulse(mode.glow);
  rope.setColor(mode.glow);
  sim.setMode(mode);
  const show = tuning.fx.modeSwitchShow;
  heroChest.set(sim.position.x, sim.position.y + 1.1, sim.position.z);
  fxPool.spawn('burst', heroChest, mode.glow, show ? 3.4 : 2.2, 0.55, 2.2);
  if (sim.onGround) fxPool.spawn('shockwave', sim.position, mode.glow, 5, 0.5, 1.6);
  sound.transform(mode.costume.armor);
  cameraRig.punchFov(show ? -9 : -3);
  cameraRig.addTrauma(0.12);
  if (show) {
    comic.transform(tKey(mode.nameKey), mode.glow);
    transformTime = 0;
  }
  tutorial.onModeChange();
});

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
const combatInput: CombatInput = {
  punch: false,
  kick: false,
  counter: false,
  rope: false,
  aimOrigin: simInput.aimOrigin,
  aimDir: simInput.aimDir,
  camForwardX: 0,
  camForwardZ: -1,
};
const held = (...codes: string[]): number => (codes.some((code) => input.isHeld(code)) ? 1 : 0);
const buildInput = (): void => {
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
  combatInput.punch = input.consumePress('Mouse0');
  combatInput.kick = input.consumePress('Mouse2');
  combatInput.counter = input.consumePress('KeyQ');
  combatInput.rope = input.consumePress('KeyE');
  combatInput.camForwardX = fx;
  combatInput.camForwardZ = fz;
};

/** No player input (title screen, pause): the hero stands or stays perched. */
const idleInput = (): void => {
  simInput.moveX = 0;
  simInput.moveZ = 0;
  simInput.forward = 0;
  simInput.right = 0;
  simInput.jumpPressed = false;
  simInput.jumpHeld = false;
  simInput.shiftHeld = false;
  simInput.divePressed = false;
  simInput.respawnPressed = false;
  combatInput.punch = false;
  combatInput.kick = false;
  combatInput.counter = false;
  combatInput.rope = false;
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
const count = (type: string): void => {
  if (testMode) telemetry.events[type] = (telemetry.events[type] ?? 0) + 1;
};
const recordStep = (): void => {
  telemetry.steps++;
  const p = sim.position;
  if (!Number.isFinite(p.x + p.y + p.z + sim.velocity.length())) telemetry.nanSteps++;
  if (Math.abs(p.x) > city.halfSize || Math.abs(p.z) > city.halfSize || p.y < -0.01) telemetry.outside++;
  for (const e of combat.enemies) if (!Number.isFinite(e.position.x + e.position.y + e.position.z)) telemetry.nanSteps++;
  const kmh = sim.speed * 3.6;
  telemetry.maxSpeedKmh = Math.max(telemetry.maxSpeedKmh, kmh);
  const key = sim.state === 'grounded' && sim.sprinting ? 'sprint' : sim.state;
  const entry = (telemetry.states[key] ??= { steps: 0, sumKmh: 0, maxKmh: 0 });
  entry.steps++;
  entry.sumKmh += kmh;
  entry.maxKmh = Math.max(entry.maxKmh, kmh);
};

// Frame loop -------------------------------------------------------------------------------------
let simTime = 0;
let fxTime = 0;
let slowMo = false;
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
const mouse = { x: 0, y: 0 };
const renderPosition = new Vector3();
const hand = new Vector3();
const bob = new Vector3();
const lookDir = new Vector3();
const ropePoint = new Vector3();
const anchorPreview = createAnchorResult();
const zipPreview = createZipTarget();
const ledgePreview = createLedgeTarget();
const ledgeEdge = { a: ledgePreview.edgeA, b: ledgePreview.edgeB, perch: ledgePreview.perch };
const hudCrime: HudCrime = { distance: 0, bearing: 0, engaged: false, left: 0 };
const mapEnemies: Array<{ x: number; z: number }> = [];

const loop = new GameLoop(
  () => tuning.physics.stepRate,
  () => tuning.physics.maxStepsPerFrame,
  {
    step(dt) {
      const started = testMode ? performance.now() : 0;
      if (gameState === 'playing') buildInput();
      else idleInput();
      combat.step(dt, combatInput);
      simInput.launchPressed = combatInput.rope;
      sim.step(dt, simInput);
      // Shockwaves hit the gang right away (effects follow in the render pass).
      for (const event of sim.events) {
        if (event.type === 'shockwave') combat.shockwave(event.x, event.y, event.z, event.radius, event.force, event.damage);
      }
      crime.step(dt, sim.position);
      simTime += dt;
      if (testMode) {
        telemetry.simMs += performance.now() - started;
        recordStep();
      }
    },
    render(alpha, frameDt) {
      const frameStarted = testMode ? performance.now() : 0;
      if (gameState === 'playing') {
        if (input.consumePress('KeyT')) slowMo = !slowMo;
        if (input.consumePress('Tab')) modeBand.next();
        for (let slot = 0; slot < 4; slot++) if (input.consumePress(`Digit${slot + 1}`)) modeBand.select(slot);
        const wheel = input.takeWheelStep();
        if (wheel !== 0) cameraRig.zoomStep(wheel);
        if (input.consumePress('KeyH')) controlCard.hidden = !controlCard.hidden;
        if (input.consumePress('Enter')) tutorial.skipStep();
        if (input.consumePress('Backspace') && tutorial.active) tutorial.skip();
      } else {
        // Title: the camera drifts slowly around the hero perched over the avenue.
        if (gameState === 'title') titleShot.yaw += frameDt * 0.05;
      }

      // Events → feedback.
      for (const event of sim.events) {
        count(event.type);
        feedback.sim(event);
        tutorial.onSim(event);
      }
      sim.events.length = 0;
      for (const event of combat.events) {
        count(event.type);
        feedback.combat(event);
        tutorial.onCombat(event);
      }
      combat.events.length = 0;
      for (const event of crime.events) {
        count(event.type);
        feedback.crime(event);
      }
      crime.events.length = 0;

      // Time: T slow motion, the mode switch beat, hit stops and the finishing blow.
      let base = slowMo ? tuning.debug.slowMoScale : 1;
      if (transformTime >= 0) {
        transformTime += frameDt;
        if (transformTime < tuning.fx.modeSwitchTime) base = Math.min(base, tuning.fx.modeSwitchSlowMo);
        else transformTime = -1;
      }
      feedback.update(frameDt);
      tutorial.update(gameState === 'playing' ? frameDt : 0);
      loop.timeScale = gameState === 'paused' ? 0 : feedback.timeScale(base);
      const worldDt = frameDt * loop.timeScale;

      input.takeMouseDelta(mouse);
      if (gameState === 'playing') cameraRig.look(mouse.x, mouse.y);
      renderPosition.lerpVectors(sim.previousPosition, sim.position, alpha);
      const swinging = sim.state === 'swinging';
      cameraRig.update(
        frameDt,
        {
          position: renderPosition,
          velocity: sim.velocity,
          state: sim.state,
          wallNormal: sim.wallNormal,
          ropeAnchor: swinging ? sim.rope.anchor : null,
          combat: combat.intensity,
        },
        world,
      );
      sky.position.copy(camera.position);
      heroChest.set(renderPosition.x, renderPosition.y + 1.1, renderPosition.z);
      lighting.setXray(camera.position, heroChest, tuning.camera.xrayRadius, tuning.camera.xray);

      // Hero, rope and effects.
      let ropeTarget: Vector3 | null = swinging ? sim.rope.anchor : sim.state === 'zip' ? sim.zip.attach : null;
      const pulled = combat.pulling;
      if (pulled) {
        enemyViews.chest(pulled, ropePoint);
        ropeTarget = ropePoint;
      }
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
        action: sim.action,
        charge: sim.charge,
      });
      hero.root.updateMatrixWorld(true);
      hero.ropeHand(sim.state === 'zip' || pulled || sim.rope.side >= 0 ? 1 : -1, hand);
      rope.retractTime = tuning.rope.retractTime;
      rope.update(worldDt, hand, ropeTarget, swinging && !sim.rope.taut ? 1 : 0, camera);
      shadow.update(renderPosition, world.supportHeight(renderPosition.x, renderPosition.z, 0.3, 0.3, renderPosition.y + 0.05));
      dust.update(worldDt);
      fxTime += worldDt;
      fxPool.update(fxTime);
      comic.update(frameDt);
      enemyViews.update(worldDt, combat.enemies);
      crimeScene.update(worldDt, crime, tuning.crime.pillar);

      lighting.update(simTime);
      lights.update();
      buildings.update();
      streets.update();
      props.update();
      traffic.update(worldDt);
      sound.setAlarm(crime.phase === 'stopped' ? 0 : crime.tension);
      sound.update(sim.speed, frameDt);
      postFx.setTension(crime.tension);
      if (crime.site) lighting.uniforms.crimeZone.value.set(crime.site.x, crime.site.z, crime.tension, 170);

      // What the crosshair would grab: a rope anchor / zip point in the air, a ledge (E), an enemy (E pull).
      camera.getWorldDirection(lookDir);
      let anchorPoint: Vector3 | null = null;
      if (tuning.rope.showAnchorPreview && sim.abilities.swing && (sim.state === 'airborne' || sim.state === 'dive')) {
        if (findAnchor(world, sim.bobPoint(bob), sim.velocity, simInput.camForwardX, simInput.camForwardZ, sim.lastSide, tuning.rope, anchorPreview)) {
          anchorPoint = anchorPreview.point;
        }
      }
      let zipPoint: Vector3 | null = null;
      if (tuning.rope.showZipTarget && sim.abilities.zip && (sim.state === 'airborne' || sim.state === 'dive' || swinging)) {
        if (findZipTarget(world, camera.position, lookDir, sim.position, tuning.rope, sim.shape.halfWidth, zipPreview)) zipPoint = zipPreview.attach;
      }
      let crosshair: 'none' | 'ledge' | 'enemy' = 'none';
      let ledgeShown = false;
      if (sim.abilities.ledgeLaunch && gameState === 'playing') {
        if (combat.enemyUnderAim(camera.position, lookDir)) crosshair = 'enemy';
        else if (findLedge(world, camera.position, lookDir, sim.position, tuning.rope, sim.shape.halfWidth, sim.shape.halfHeight, ledgePreview)) {
          crosshair = 'ledge';
          ledgeShown = tuning.rope.showLedgeHighlight;
        }
      }
      ledgeGlow.update(frameDt, ledgeShown ? ledgeEdge : null, modeBand.mode.glow);

      renderer.info.reset();
      postFx.render(frameDt, sim.speed, sim.state === 'dive' || sim.state === 'pound');
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

      // HUD.
      const site = crime.site;
      const crimeOn = site !== null && crime.phase !== 'stopped';
      if (site && crimeOn) {
        hudCrime.distance = crime.distance;
        const dx = site.x - renderPosition.x;
        const dz = site.z - renderPosition.z;
        // Bearing: angle from the camera's forward to the crime, + = to the right.
        const c = Math.cos(cameraRig.yaw);
        const s = Math.sin(cameraRig.yaw);
        hudCrime.bearing = Math.atan2(dx * c - dz * s, -(dx * s + dz * c));
        hudCrime.engaged = crime.phase === 'engaged';
        hudCrime.left = combat.aliveCount;
      }
      mapEnemies.length = 0;
      for (const e of combat.enemies) if (e.health > 0) mapEnemies.push({ x: e.position.x, z: e.position.z });
      hud.setVisible(tuning.ui.hud && gameState !== 'title' && !feedback.cinematic);
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
          health: combat.health / tuning.combat.playerHealth,
          modeName: tKey(modeBand.mode.nameKey),
          modeColor: modeBand.mode.glow,
          stopped: crime.stopped,
          crime: crimeOn ? hudCrime : null,
          map: {
            heroX: renderPosition.x,
            heroZ: renderPosition.z,
            heroYaw: sim.yaw,
            cameraYaw: cameraRig.yaw,
            crime: crimeOn ? site : null,
            enemies: mapEnemies,
            modeColor: modeBand.mode.glow,
          },
          crosshair,
          combo: combat.comboCount,
          enemies: combat.enemies,
          anchorPreview: anchorPoint,
          zipTarget: zipPoint,
          zipCharge: sim.zipCharge,
          charge: sim.state === 'charge' ? sim.charge : 0,
          fighting: combat.intensity > 0.3,
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
applyAllSettings();
menu.open('title');
cameraRig.skipIntro();
cameraRig.playShot(titleShot);
loop.start();

if (testMode) {
  // Hooks for the headless smoke test (tools/smoke): read state, script time and the camera.
  Object.assign(window, {
    __game: {
      sim,
      tuning,
      modeBand,
      hero,
      city,
      world,
      combat,
      crime,
      telemetry,
      stats,
      cameraRig,
      simTime: () => simTime,
      setLockstep: (steps: number) => {
        loop.lockstepSteps = steps;
      },
      play: () => enterPlaying(false),
      tutorial,
      menu,
      gameState: () => gameState,
    },
  });
}
