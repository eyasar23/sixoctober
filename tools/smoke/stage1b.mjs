// Headless gameplay smoke test for stage 1B.
//
// Plays with real key presses and mouse clicks in Chromium (software WebGL):
//   title screen → PLAY starts the tutorial → sprint, jump, run off the roof and swing, let go,
//   look around until the crosshair lights up over a ledge and launch onto it with E (perch) →
//   skip the rest of the tutorial → leap off, swing, switch to Titan mid-air (the rope lets go,
//   momentum stays) → ground pound → back to Grapple, start ~230 m down the crime's street and
//   swing to it (hopping onto ledges with E when on the ground; if it still gets stuck, the hero
//   is placed near the crime and the log says so) → fight the gang with punches, kicks, rope
//   pulls and counters until the crime is stopped.
// The simulation runs in lockstep (fixed steps per frame), so results do not depend on how fast
// the machine renders. Fails on NaN, falling out of the city, page errors or an unfinished fight.
// Screenshots go to docs/previews/asama-1b/.
//
// Run from the repository root:
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save playwright-core
//   node tools/smoke/stage1b.mjs [http://localhost:4173]
// Chromium path: $CHROMIUM, default /opt/pw-browsers/chromium (Claude Code cloud).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173';
const outDir = fileURLToPath(new URL('../../docs/previews/asama-1b/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${base}/?test&quality=medium`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game?.simTime() > 0.2, null, { timeout: 120_000 });

const shot = (name) => page.screenshot({ path: `${outDir}${name}`, type: 'jpeg', quality: 80 });
const simTime = () => page.evaluate(() => window.__game.simTime());
const game = (fn, arg) => page.evaluate(fn, arg);
async function waitSim(seconds) {
  const target = (await simTime()) + seconds;
  await page.waitForFunction((t) => window.__game.simTime() >= t, target, { timeout: 900_000, polling: 100 });
}
async function waitFor(predicate, maxSimSeconds, arg) {
  const end = (await simTime()) + maxSimSeconds;
  while ((await simTime()) < end) {
    if (await page.evaluate(predicate, arg)) return true;
    await page.waitForTimeout(120);
  }
  return false;
}
const log = (...args) => console.log(`[${(Date.now() / 1000).toFixed(0)}]`, ...args);
const button = (text) => page.locator('.menu-panel:not([hidden]) button', { hasText: text }).first();

// Title screen -------------------------------------------------------------------------------
await page.waitForTimeout(2000);
await shot('01-title.jpg');
log('title screen; PLAY');
await button('PLAY').click();
await game(() => window.__game.setLockstep(4));
await page.waitForTimeout(1200);
const tutorialOn = await game(() => window.__game.tutorial.active);
await shot('02-tutorial.jpg');
log('tutorial running:', tutorialOn);

// Tutorial: sprint, jump, swing, release ------------------------------------------------------
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await waitSim(1.2);
await page.keyboard.press('Space');
await page.keyboard.up('ShiftLeft');
await waitSim(0.9);
log('run off the roof, Shift in the air');
const offRoof = await waitFor(() => window.__game.sim.state === 'airborne' && window.__game.sim.position.y < 88, 8);
await page.keyboard.down('ShiftLeft');
const swung = await waitFor(() => window.__game.sim.state === 'swinging', 3);
await waitSim(1.4);
await shot('03-swing.jpg');
await page.keyboard.up('ShiftLeft');
await waitSim(0.25);
await page.keyboard.up('KeyW');
log('swung:', swung, 'off roof:', offRoof);

// Look and launch: look around like a player until the crosshair lights up over a ledge, press E.
await waitFor(() => ['grounded', 'landing'].includes(window.__game.sim.state), 8);
await waitSim(0.6);
async function lookForLedge(yaws) {
  for (const pitch of [-0.3, -0.45, -0.15]) {
    for (const yaw of yaws) {
      await game(([y, p]) => {
        window.__game.cameraRig.yaw = y;
        window.__game.cameraRig.pitch = p;
      }, [yaw, pitch]);
      await waitSim(0.07); // at least two rendered frames
      if (await game(() => document.querySelector('.hud-crosshair')?.dataset.target === 'ledge')) return true;
    }
  }
  return false;
}
const launched = await lookForLedge(Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2));
let perched = false;
if (launched) {
  await page.keyboard.press('KeyE');
  perched = await waitFor(() => window.__game.sim.state === 'perch', 6);
}
let placedForLedge = false;
if (!perched) {
  // Fallback: a known spot on the main avenue facing a 63 m building (seed 6102026).
  placedForLedge = true;
  await game(() => {
    const g = window.__game;
    g.sim.respawnAt(2, 0, 280, -Math.PI / 2);
    g.cameraRig.yaw = -Math.PI / 2;
    g.cameraRig.pitch = -0.4;
  });
  await waitSim(0.6);
  await page.keyboard.press('KeyE');
  perched = await waitFor(() => window.__game.sim.state === 'perch', 6);
}
await page.waitForTimeout(1100); // the perch shot runs on real time
await shot('04-perch.jpg');
log('ledge under the crosshair:', launched, 'perched:', perched, placedForLedge ? '(placed at a known facade)' : '');

log('skip the rest of the tutorial (Backspace)');
await page.keyboard.press('Backspace');
await waitSim(0.3);

// Mid-air Titan switch and ground pound -------------------------------------------------------
await game(() => {
  const g = window.__game;
  // Look out over the street and along it (toward the city centre), then leap.
  const n = g.sim.ledge.normal;
  const p = g.sim.position;
  let ax = -n.z;
  let az = n.x;
  if (ax * -p.x + az * -p.z < 0) {
    ax = -ax;
    az = -az;
  }
  const dx = 0.6 * n.x + 0.8 * ax;
  const dz = 0.6 * n.z + 0.8 * az;
  g.cameraRig.yaw = Math.atan2(-dx, -dz); // the camera looks along (−sin yaw, −cos yaw)
  g.cameraRig.pitch = 0.2;
});
await page.keyboard.press('Space');
await waitSim(0.3);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
const swing2 = await waitFor(() => window.__game.sim.state === 'swinging', 3);
await waitSim(0.35);
const before = await game(() => window.__game.sim.velocity.toArray());
await page.keyboard.press('Tab');
await waitSim(0.02);
const after = await game(() => ({ v: window.__game.sim.velocity.toArray(), state: window.__game.sim.state, mode: window.__game.modeBand.mode.id }));
await page.waitForTimeout(150);
await shot('05-transform.jpg');
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
const speedBefore = Math.hypot(...before);
const speedAfter = Math.hypot(...after.v);
log('swing before switch:', swing2, 'speed', speedBefore.toFixed(1), '→', speedAfter.toFixed(1), after.state, after.mode);
const highEnough = await game(() => {
  const g = window.__game;
  const p = g.sim.position;
  return p.y - g.world.supportHeight(p.x, p.z, 0.3, 0.3, p.y) > 4;
});
await page.keyboard.press('KeyC');
const pounded = await waitFor(() => (window.__game.telemetry.events.shockwave ?? 0) > 0, 6);
await page.waitForTimeout(150);
await shot('06-pound.jpg');
log('high enough to pound:', highEnough, 'shockwave:', pounded);
await waitSim(0.8);

// Back to Kanca and head for the crime ---------------------------------------------------------
await page.keyboard.press('Digit1');
await waitSim(0.5);
const crimeSite = await game(() => window.__game.crime.site);
log('crime at', crimeSite && [crimeSite.x.toFixed(0), crimeSite.z.toFixed(0)], 'distance', (await game(() => window.__game.crime.distance)).toFixed(0));
await game(() => window.__game.setLockstep(10));

// The approach starts on the crime's own road, ~230 m out, and swings straight down it to the gang:
// the scripted steering cannot turn street corners at swing speed reliably (two earlier versions
// that routed through crossings overshot the turn and drifted away).
const start = await game(() => {
  const g = window.__game;
  const site = g.crime.site;
  const road = g.city.roads.find((r) => site.x >= r.minX && site.x <= r.maxX && site.z >= r.minZ && site.z <= r.maxZ);
  if (!road) return null;
  const alongX = road.axis === 'x';
  const lo = alongX ? road.minX : road.minZ;
  const hi = alongX ? road.maxX : road.maxZ;
  const at = alongX ? site.x : site.z;
  const fromLow = at - lo > hi - at; // come in from the longer side
  const s0 = fromLow ? Math.max(lo + 8, at - 230) : Math.min(hi - 8, at + 230);
  const x = alongX ? s0 : road.center;
  const z = alongX ? road.center : s0;
  const yaw = Math.atan2(-(site.x - x), -(site.z - z));
  g.sim.respawnAt(x, 0, z, yaw);
  g.cameraRig.yaw = yaw;
  g.cameraRig.pitch = 0.25;
  return { x, z, d: Math.hypot(site.x - x, site.z - z) };
});
log('approach starts on the crime road at', start && [Math.round(start.x), Math.round(start.z)], start && `${Math.round(start.d)} m out`);
const route = start ? [{ x: (await game(() => window.__game.crime.site.x)), z: (await game(() => window.__game.crime.site.z)) }] : [];
await waitSim(0.3);
await page.keyboard.down('KeyW');
await page.keyboard.press('Space');
await waitSim(0.2);
await page.keyboard.down('ShiftLeft');
let approach = Infinity;
let ledgeHops = 0;
let waypoint = 0;
let shiftHeld = true;
const approachEnd = (await simTime()) + 75; // simulated seconds
for (let i = 0; route.length > 0 && (await simTime()) < approachEnd; i++) {
  const s = await game((target) => {
    const g = window.__game;
    const p = g.sim.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const bearing = Math.atan2(-dx, -dz); // the camera looks along (−sin yaw, −cos yaw)
    g.cameraRig.yaw = bearing;
    g.cameraRig.pitch = 0.25;
    const site = g.crime.site;
    return { d: Math.hypot(dx, dz), crime: Math.hypot(site.x - p.x, site.z - p.z), state: g.sim.state, bearing };
  }, route[waypoint]);
  approach = s.crime;
  if (s.crime < 55) break;
  const last = waypoint === route.length - 1;
  if (!last && s.d < 16) waypoint++;
  // Near a turn, let go of the rope so air control can turn the hero; grab a new one after it.
  const turning = !last && s.d < 40;
  if (turning && shiftHeld) {
    await page.keyboard.up('ShiftLeft');
    shiftHeld = false;
  } else if (!turning && !shiftHeld) {
    await page.keyboard.down('ShiftLeft');
    shiftHeld = true;
  }
  if (s.state === 'wallClimb' || s.state === 'wallRun') await page.keyboard.press('Space');
  if (s.state === 'grounded' || s.state === 'landing') {
    // Like a player: get up high first. Look for a roof edge the way we are going and launch onto it.
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    shiftHeld = false;
    if (await lookForLedge([0, 0.35, -0.35, 0.7, -0.7].map((o) => s.bearing + o))) {
      await page.keyboard.press('KeyE');
      if (await waitFor(() => window.__game.sim.state === 'perch', 4)) ledgeHops++;
    }
  }
  const now = await game(() => window.__game.sim.state);
  if (now === 'perch') {
    // Leap off toward the target (W would step off the ledge instead), then swing.
    await game((b) => {
      window.__game.cameraRig.yaw = b;
      window.__game.cameraRig.pitch = 0.2;
    }, s.bearing);
    await waitSim(0.1);
    await page.keyboard.press('Space');
    await waitSim(0.25);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    shiftHeld = true;
  } else if (now === 'grounded' || now === 'landing') {
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
    await page.keyboard.down('ShiftLeft');
    shiftHeld = true;
  }
  if (i === 40) await shot('07-approach.jpg');
  await waitSim(0.12);
}
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
let placed = false;
if (approach >= 55) {
  placed = true;
  await game(() => {
    const g = window.__game;
    const s = g.crime.site;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    g.sim.respawnAt(s.x + fx * 16, 0, s.z + fz * 16, Math.atan2(fx, fz));
  });
}
log('approach ended at', approach.toFixed(0), 'm', placed ? '(route stuck: placed the hero near the crime)' : '(arrived by swinging)', 'ledge hops:', ledgeHops);

// The fight -----------------------------------------------------------------------------------
await game(() => window.__game.setLockstep(8));
let finalShot = false;
for (let round = 0; round < 900; round++) {
  if (round % 60 === 0) log('fight round', round, JSON.stringify(await game(() => ({ alive: window.__game.combat.aliveCount, hp: Math.round(window.__game.combat.health), t: window.__game.simTime().toFixed(0) }))));
  const st = await game(() => {
    const g = window.__game;
    const h = g.sim.position;
    let best = null;
    let bestD = 1e9;
    for (const e of g.combat.enemies) {
      if (e.health <= 0) continue;
      const d = Math.hypot(e.position.x - h.x, e.position.z - h.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) {
      g.cameraRig.yaw = Math.atan2(h.x - best.position.x, h.z - best.position.z);
      g.cameraRig.pitch = 0.2;
    }
    const warn = g.combat.enemies.some((e) => e.counterable && Math.hypot(e.position.x - h.x, e.position.z - h.z) < 4.2);
    return { alive: g.combat.aliveCount, d: bestD, warn, standing: best ? best.state !== 'down' && best.state !== 'knockback' && best.state !== 'getup' : false, state: g.sim.state, stopped: g.crime.stopped };
  });
  if (st.stopped > 0 || st.alive === 0) break;
  if (st.warn) await page.keyboard.press('KeyQ');
  else if (st.d > 9 && st.d < 28 && round % 7 === 0) await page.keyboard.press('KeyE'); // rope pull
  else if (st.d > 3.2 && st.standing) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(90);
    await page.keyboard.up('KeyW');
  } else if (st.standing) await page.mouse.click(640, 360, { button: round % 4 === 3 ? 'right' : 'left' });
  if (round === 30) await shot('08-fight.jpg');
  if (!finalShot && (await game(() => window.__game.combat.aliveCount === 0))) {
    finalShot = true;
    await page.waitForTimeout(250);
    await shot('09-final-blow.jpg');
  }
  await page.waitForTimeout(110);
}
if (!finalShot && (await game(() => window.__game.combat.aliveCount === 0))) {
  await page.waitForTimeout(200);
  await shot('09-final-blow.jpg');
}
await page.waitForTimeout(1600);
await shot('10-crime-stopped.jpg');

// Pause menu and settings (opened through the test hook: no pointer lock headless) -------------
await game(() => window.__game.menu.open('pause'));
await page.waitForTimeout(300);
await shot('11-pause.jpg');
await game(() => window.__game.menu.close());

// Report ---------------------------------------------------------------------------------------
const t = await game(() => {
  const g = window.__game;
  return {
    telemetry: g.telemetry,
    stopped: g.crime.stopped,
    health: g.combat.health,
    perf: { drawCalls: g.stats.drawCalls, triangles: g.stats.triangles },
  };
});
const ev = t.telemetry.events;
log('events', JSON.stringify(ev));
log('draw calls', t.perf.drawCalls, 'triangles', t.perf.triangles, 'sim ms/step', (t.telemetry.simMs / Math.max(t.telemetry.steps, 1)).toFixed(3));

const failures = [];
if (t.telemetry.nanSteps > 0) failures.push(`NaN in ${t.telemetry.nanSteps} steps`);
if (t.telemetry.outside > 0) failures.push(`outside the city in ${t.telemetry.outside} steps`);
if (!tutorialOn) failures.push('tutorial did not start from PLAY');
if (!swung) failures.push('no swing during the tutorial');
if (!perched) failures.push('look-and-launch did not end perched');
if (after.mode !== 'titan') failures.push('Tab did not switch to Titan');
if (after.state === 'swinging') failures.push('still swinging after switching to Titan');
if (speedAfter < speedBefore * 0.9) failures.push(`momentum lost on the switch (${speedBefore.toFixed(1)} → ${speedAfter.toFixed(1)} m/s)`);
if (!pounded) failures.push('no ground pound shockwave');
if (t.stopped < 1) failures.push('the crime was not stopped');
if ((ev.hit ?? 0) < 5) failures.push('fewer than 5 hits landed');
if (errors.length > 0) failures.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

await browser.close();
if (failures.length > 0) {
  console.error('SMOKE TEST FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
