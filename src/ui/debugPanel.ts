import GUI from 'lil-gui';
import type { Tuning } from '../config/tuning';
import { t, tKey } from '../i18n';

/** How long the "Copied!" label stays on the button, ms. */
const COPIED_LABEL_MS = 1500;

export interface PanelStats {
  current: string;
  fpsValue: number;
  drawCalls: number;
  triangles: number;
}

export interface PanelActions {
  respawn(): void;
  rebuildCity(seed: number): void;
}

type Range = [min: number, max: number, step?: number];

/**
 * F1 tuning panel (BRIEF.md §5.3), grouped as asked in the stage 1A brief: Movement / Rope /
 * Camera / Effects / City / Quality. Values are edited live; "Copy values" copies them as JSON.
 */
export function createDebugPanel(tuning: Tuning, stats: PanelStats, actions: PanelActions): GUI {
  const gui = new GUI({ title: t('panel.title'), width: 320 });
  gui.hide();

  const add = (folder: GUI, target: Record<string, unknown>, key: string, range?: Range): void => {
    const controller = range ? folder.add(target, key, range[0], range[1], range[2]) : folder.add(target, key);
    controller.name(tKey(`panel.${key}`));
  };
  const group = (parent: GUI, key: string, target: Record<string, unknown>, entries: Array<[string, Range?]>, open = false): GUI => {
    const folder = parent.addFolder(tKey(key));
    for (const [prop, range] of entries) add(folder, target, prop, range);
    if (!open) folder.close();
    return folder;
  };

  const m = tuning.movement as unknown as Record<string, unknown>;
  const movement = group(gui, 'panel.movement', m, [
    ['runSpeed', [20, 80, 1]],
    ['sprintSpeed', [40, 110, 1]],
    ['runAccelTime', [0.05, 1, 0.01]],
    ['brakeTime', [0.05, 1, 0.01]],
    ['turnGrip', [1, 30, 0.5]],
    ['jumpHeight', [1, 8, 0.1]],
    ['gravity', [10, 60, 1]],
    ['coyoteTime', [0, 0.3, 0.01]],
    ['jumpBuffer', [0, 0.3, 0.01]],
    ['airControl', [0, 40, 1]],
    ['topSpeed', [100, 250, 1]],
  ], true);
  group(movement, 'panel.movement.wall', m, [
    ['wallRunSpeed', [40, 120, 1]],
    ['wallRunMaxTime', [0.3, 4, 0.1]],
    ['wallRunMinSpeed', [10, 80, 1]],
    ['wallRunMaxAngle', [10, 80, 1]],
    ['climbSpeed', [8, 40, 1]],
    ['climbSprintSpeed', [10, 50, 1]],
    ['wallJumpOut', [4, 25, 0.5]],
    ['wallJumpUp', [2, 20, 0.5]],
  ]);
  group(movement, 'panel.movement.dive', m, [
    ['diveGravityMult', [1, 4, 0.1]],
    ['diveMaxFallSpeed', [100, 220, 1]],
    ['heroLandSpeed', [10, 60, 1]],
    ['rollMinSpeed', [10, 80, 1]],
    ['nearMissBoost', [0, 40, 1]],
  ]);

  const r = tuning.rope as unknown as Record<string, unknown>;
  const rope = group(gui, 'panel.rope', r, [
    ['swingPlaneAssist', [0, 1, 0.05]],
    ['lateralDamping', [0, 8, 0.1]],
    ['swingGravityMult', [0.5, 3, 0.05]],
    ['pumpAccel', [0, 30, 0.5]],
    ['swingAssist', [0, 25, 0.5]],
    ['releaseForwardBoost', [0, 50, 1]],
    ['releaseUpBoost', [0, 15, 0.5]],
    ['ropeJumpUp', [0, 20, 0.5]],
    ['autoChain'],
    ['autoReleaseAngle', [20, 90, 1]],
    ['reattachDelay', [0, 0.5, 0.01]],
    ['reattachMaxRise', [-5, 15, 0.5]],
    ['reelSpeed', [0, 40, 1]],
    ['swingClearance', [0, 15, 0.5]],
    ['showAnchorPreview'],
  ]);
  group(rope, 'panel.rope.anchors', r, [
    ['maxRange', [30, 120, 1]],
    ['idealDistance', [15, 60, 1]],
    ['idealHeight', [5, 40, 1]],
    ['minHeightAbove', [0, 15, 0.5]],
    ['forwardMinDot', [-0.5, 0.9, 0.05]],
    ['aimWeight', [0, 1, 0.05]],
    ['sideAlternation', [0, 1, 0.05]],
  ]);
  group(rope, 'panel.rope.zip', r, [
    ['zipSpeed', [60, 250, 1]],
    ['zipRange', [20, 150, 1]],
    ['zipCooldown', [0, 3, 0.05]],
    ['showZipTarget'],
  ]);

  group(gui, 'panel.camera', tuning.camera as unknown as Record<string, unknown>, [
    ['distance', [2, 15, 0.1]],
    ['distanceAtSpeed', [2, 20, 0.1]],
    ['height', [0.5, 3, 0.05]],
    ['fov', [40, 100, 1]],
    ['fovAtSpeed', [50, 120, 1]],
    ['mouseSensitivity', [0.0005, 0.006, 0.0001]],
    ['invertY'],
    ['swingRoll', [0, 20, 0.5]],
    ['wallRunRoll', [0, 25, 0.5]],
    ['lookAhead', [0, 1, 0.05]],
    ['autoAlign'],
    ['autoAlignRate', [0, 5, 0.1]],
    ['followDamping', [2, 40, 1]],
    ['shake'],
    ['shakeIntensity', [0, 2, 0.05]],
  ]);

  const effects = group(gui, 'panel.effects', tuning.fx as unknown as Record<string, unknown>, [
    ['bloomIntensity', [0, 4, 0.05]],
    ['bloomThreshold', [0, 2, 0.01]],
    ['speedLinesStart', [40, 200, 1]],
    ['speedLinesIntensity', [0, 2, 0.05]],
    ['chromaticAberration', [0, 0.01, 0.0001]],
    ['vignette', [0, 1, 0.01]],
    ['grade', [0, 1, 0.05]],
    ['windowGlow', [0.3, 4, 0.05]],
    ['fogDensity', [0, 0.008, 0.0001]],
    ['lampPools', [0, 2, 0.05]],
    ['landingDust'],
    ['hitStop', [0, 0.2, 0.01]],
    ['comicImpact'],
  ]);
  group(effects, 'panel.effects.hero', tuning.hero as unknown as Record<string, unknown>, [
    ['animateOnTwos'],
    ['outline'],
    ['outlineWidth', [0, 0.06, 0.001]],
    ['releaseFlip'],
  ]);
  group(effects, 'panel.effects.audio', tuning.audio as unknown as Record<string, unknown>, [['enabled'], ['volume', [0, 1, 0.01]]]);

  const city = group(gui, 'panel.city', tuning.city as unknown as Record<string, unknown>, [
    ['traffic'],
    ['trafficSpeed', [0, 3, 0.05]],
    ['billboards'],
    ['windowBlink', [0, 0.1, 0.001]],
  ]);
  const seed = { seed: tuning.city.seed };
  add(city, seed, 'seed');
  city.add({ rebuild: () => actions.rebuildCity(Math.round(seed.seed)) }, 'rebuild').name(t('panel.rebuildCity'));

  const quality = gui.addFolder(t('panel.quality'));
  quality.add(tuning.quality, 'preset', ['auto', 'low', 'medium', 'high']).name(t('panel.preset'));
  for (const key of ['current', 'fpsValue', 'drawCalls', 'triangles'] as const) {
    quality.add(stats, key).name(tKey(`panel.${key}`)).listen().disable();
  }
  add(quality, tuning.debug as unknown as Record<string, unknown>, 'showFps');
  add(quality, tuning.debug as unknown as Record<string, unknown>, 'slowMoScale', [0.05, 1, 0.05]);

  gui.add({ respawn: () => actions.respawn() }, 'respawn').name(t('panel.respawn'));
  const copy = {
    copyValues: () => {
      const json = JSON.stringify(tuning, null, 2);
      const copied = navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject(new Error('Clipboard unavailable'));
      copied.then(
        () => {
          copyButton.name(t('panel.copied'));
          setTimeout(() => copyButton.name(t('panel.copyValues')), COPIED_LABEL_MS);
        },
        () => window.prompt(t('panel.copyFallback'), json),
      );
    },
  };
  const copyButton = gui.add(copy, 'copyValues').name(t('panel.copyValues'));

  let visible = false;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F1') return;
    event.preventDefault(); // keep the browser's help page closed
    visible = !visible;
    gui.show(visible);
    // Free the mouse so the panel can be used.
    if (visible && document.pointerLockElement) document.exitPointerLock();
  });

  return gui;
}
