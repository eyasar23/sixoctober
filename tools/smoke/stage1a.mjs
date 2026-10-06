// Headless gameplay smoke test for stage 1A.
//
// Plays a scripted route with real key presses in Chromium (software WebGL): sprint off the
// spawn roof holding Shift, chain swings down the main avenue, let go, dive, land, then run
// into a building and climb it. The simulation runs in lockstep (fixed steps per frame), so the
// result does not depend on how fast the machine renders. Checks the telemetry and saves small
// screenshots to docs/previews/asama-1a/.
//
// Run from the repository root:
//   npm run build && npx vite preview --port 4173 &
//   npm i --no-save playwright-core
//   node tools/smoke/stage1a.mjs [http://localhost:4173]
// Chromium path: $CHROMIUM, default /opt/pw-browsers/chromium (Claude Code cloud).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173';
const outDir = fileURLToPath(new URL('../../docs/previews/asama-1a/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${base}/?test&quality=high`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game?.simTime() > 0.2, null, { timeout: 120_000 });

const shot = (name) => page.screenshot({ path: `${outDir}${name}`, type: 'jpeg', quality: 82 });
const simTime = () => page.evaluate(() => window.__game.simTime());
const state = () => page.evaluate(() => window.__game.sim.state);
async function waitSim(seconds) {
  const target = (await simTime()) + seconds;
  await page.waitForFunction((t) => window.__game.simTime() >= t, target, { timeout: 900_000, polling: 100 });
}
async function waitFor(predicate, maxSimSeconds) {
  const end = (await simTime()) + maxSimSeconds;
  while ((await simTime()) < end) {
    if (await page.evaluate(predicate)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const log = (...args) => console.log(`[${(Date.now() / 1000).toFixed(0)}]`, ...args);

await shot('01-start.jpg');
await page.evaluate(() => {
  window.__game.play();
  window.__game.setLockstep(4); // 4 steps of 1/120 s per frame
});
await page.waitForTimeout(3500); // the opening camera pull-in runs on real time
await shot('02-roof.jpg');

log('sprint off the roof holding Shift');
await page.keyboard.down('KeyW');
await page.keyboard.down('ShiftLeft');
await waitSim(1.4);
await shot('03-first-swing.jpg');
log('state', await state());
await waitFor(() => window.__game.sim.state === 'swinging' && window.__game.sim.speed * 3.6 > 140, 8);
await shot('04-swing-fast.jpg');
await waitSim(5);
await shot('05-swing-chain.jpg');

log('let go, then dive');
await page.keyboard.up('ShiftLeft');
await waitSim(0.3);
await page.keyboard.press('KeyC');
await waitSim(0.9);
await shot('06-dive.jpg');
await waitFor(() => ['landing', 'grounded'].includes(window.__game.sim.state), 8);
await waitSim(0.12);
await shot('07-landing.jpg');
log('landed as', await page.evaluate(() => window.__game.sim.landingKind));

log('run east into a building and climb');
await page.evaluate(() => {
  window.__game.cameraRig.yaw = -Math.PI / 2;
});
await waitFor(() => window.__game.sim.state === 'wallClimb', 6);
await waitSim(1.5);
await shot('08-climb.jpg');
await page.keyboard.up('KeyW');

await page.keyboard.press('F1');
await waitSim(0.2);
await shot('09-panel.jpg');

const telemetry = await page.evaluate(() => window.__game.telemetry);
const stats = await page.evaluate(() => ({ ...window.__game.stats }));
await browser.close();
console.log(
  `draw calls ${stats.drawCalls}, triangles ${stats.triangles}, ` +
    `sim step ${(telemetry.simMs / telemetry.steps).toFixed(3)} ms, CPU per frame ${(telemetry.frameMs / telemetry.frames).toFixed(2)} ms (software WebGL)`,
);

const summary = Object.fromEntries(
  Object.entries(telemetry.states).map(([name, s]) => [name, { seconds: +(s.steps / 120).toFixed(2), avgKmh: Math.round(s.sumKmh / s.steps), maxKmh: Math.round(s.maxKmh) }]),
);
console.log(JSON.stringify({ steps: telemetry.steps, maxSpeedKmh: Math.round(telemetry.maxSpeedKmh), events: telemetry.events, states: summary }, null, 2));

const problems = [];
if (telemetry.nanSteps > 0) problems.push(`NaN in ${telemetry.nanSteps} steps`);
if (telemetry.outside > 0) problems.push(`outside the city in ${telemetry.outside} steps`);
if (telemetry.maxSpeedKmh > 176) problems.push(`top speed ${telemetry.maxSpeedKmh.toFixed(0)} km/h`);
if ((telemetry.events.ropeAttach ?? 0) < 3) problems.push('fewer than 3 ropes');
if ((telemetry.events.respawn ?? 0) > 0) problems.push('respawned');
for (const needed of ['swinging', 'dive', 'wallClimb']) if (!telemetry.states[needed]) problems.push(`never reached ${needed}`);
const swing = summary.swinging;
if (swing && (swing.avgKmh < 90 || swing.avgKmh > 165)) problems.push(`swing average ${swing.avgKmh} km/h`);
const climb = summary.wallClimb;
if (climb && climb.maxKmh > 27) problems.push(`climb max ${climb.maxKmh} km/h`);
if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);

if (problems.length) {
  console.error('SMOKE TEST FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
