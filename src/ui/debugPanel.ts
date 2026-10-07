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
    ['retractTime', [0.05, 0.6, 0.01]],
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
  group(rope, 'panel.rope.launch', r, [
    ['launchRange', [20, 150, 1]],
    ['launchSpeed', [60, 250, 1]],
    ['launchCooldown', [0, 2, 0.05]],
    ['perchHopTime', [0.05, 0.6, 0.01]],
    ['perchLeapForward', [0, 30, 0.5]],
    ['perchLeapHeight', [0, 8, 0.1]],
    ['showLedgeHighlight'],
  ]);

  const titan = gui.addFolder(tKey('panel.titan'));
  titan.close();
  const titanMove = tuning.titan.movement as unknown as Record<string, unknown>;
  for (const [key, range] of [
    ['runSpeed', [10, 80, 1]],
    ['sprintSpeed', [10, 100, 1]],
    ['runAccelTime', [0.05, 2, 0.01]],
    ['turnGrip', [1, 30, 0.5]],
    ['jumpHeight', [0.5, 6, 0.1]],
    ['gravity', [10, 60, 1]],
    ['climbSpeed', [2, 30, 1]],
    ['heroLandSpeed', [5, 60, 1]],
  ] as Array<[string, Range]>) {
    add(titan, titanMove, key, range);
  }
  const ti = tuning.titan as unknown as Record<string, unknown>;
  for (const [key, range] of [
    ['chargeTime', [0.2, 3, 0.05]],
    ['superJumpMin', [0, 10, 0.5]],
    ['superJumpMax', [5, 80, 1]],
    ['superJumpForward', [0, 30, 0.5]],
    ['poundHang', [0, 0.6, 0.01]],
    ['poundSpeed', [20, 120, 1]],
    ['shockRadius', [3, 40, 0.5]],
    ['shockForce', [0, 60, 1]],
    ['shockDamage', [0, 120, 1]],
    ['landShockImpact', [5, 80, 1]],
  ] as Array<[string, Range]>) {
    add(titan, ti, key, range);
  }

  const fight = group(gui, 'panel.combat', tuning.combat as unknown as Record<string, unknown>, [
    ['punchTime', [0.1, 1, 0.01]],
    ['kickTime', [0.1, 1, 0.01]],
    ['finisherExtra', [0, 0.5, 0.01]],
    ['hitAt', [0.1, 0.9, 0.01]],
    ['chainAt', [0.2, 1, 0.01]],
    ['comboWindow', [0, 1, 0.01]],
    ['punchDamage', [0, 60, 1]],
    ['kickDamage', [0, 60, 1]],
    ['finisherDamage', [0, 100, 1]],
    ['reach', [0.5, 5, 0.05]],
    ['lungeRange', [0, 15, 0.5]],
    ['knockback', [0, 20, 0.5]],
    ['finisherKnockback', [0, 30, 0.5]],
    ['finisherLift', [0, 20, 0.5]],
    ['heavyTimeScale', [1, 3, 0.05]],
    ['heavyDamageScale', [1, 4, 0.05]],
    ['heavyArea', [0, 8, 0.1]],
    ['hitStop', [0, 0.2, 0.005]],
    ['finisherHitStop', [0, 0.3, 0.005]],
    ['counterRange', [1, 10, 0.1]],
    ['counterDamage', [0, 120, 1]],
    ['pullRange', [5, 60, 1]],
    ['pullAngle', [2, 30, 0.5]],
    ['playerHealth', [10, 500, 5]],
    ['regenDelay', [0, 20, 0.5]],
    ['regenRate', [0, 60, 1]],
  ]);
  group(fight, 'panel.combat.enemies', tuning.combat as unknown as Record<string, unknown>, [
    ['enemyHealth', [5, 400, 5]],
    ['bruteHealth', [5, 600, 5]],
    ['enemyRunSpeed', [1, 12, 0.1]],
    ['aggroRange', [5, 80, 1]],
    ['engageRange', [1.5, 8, 0.1]],
    ['warnTime', [0.15, 2, 0.05]],
    ['bruteWarnTime', [0.15, 2, 0.05]],
    ['attackReach', [1, 5, 0.1]],
    ['enemyDamage', [0, 60, 1]],
    ['bruteDamage', [0, 80, 1]],
    ['attackCooldownMin', [0, 6, 0.1]],
    ['attackCooldownMax', [0, 8, 0.1]],
    ['maxAttackers', [1, 4, 1]],
  ]);

  group(gui, 'panel.crime', tuning.crime as unknown as Record<string, unknown>, [
    ['minDistance', [50, 600, 10]],
    ['maxDistance', [100, 800, 10]],
    ['engageDistance', [10, 120, 1]],
    ['nextCrimeDelay', [0, 30, 0.5]],
    ['pillar'],
    ['tension'],
    ['arrivalBeat'],
    ['finalBlowCinematic'],
    ['finalBlowSlowMo', [0.02, 1, 0.01]],
    ['finalBlowTime', [0.2, 3, 0.05]],
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
    ['minPitch', [-1.2, 0.3, 0.01]],
    ['restPitch', [-0.3, 1, 0.01]],
    ['groundClearance', [0, 4, 0.05]],
    ['autoAlignDelay', [0, 5, 0.1]],
    ['zoomNear', [0.3, 1, 0.01]],
    ['zoomFar', [1, 3, 0.05]],
    ['groundDistance', [0.4, 1.5, 0.01]],
    ['swingDistance', [0.6, 2.5, 0.01]],
    ['swingHeight', [0, 5, 0.1]],
    ['swingPitch', [-0.3, 0.6, 0.01]],
    ['airDistance', [0.6, 2, 0.01]],
    ['wallRunSide', [0, 5, 0.1]],
    ['combatDistance', [0.6, 2.5, 0.01]],
    ['framingDamping', [0.5, 10, 0.1]],
    ['xray', [0, 1, 0.05]],
    ['xrayRadius', [0.3, 4, 0.05]],
    ['perchCinematic'],
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
    ['modeSwitchShow'],
    ['modeSwitchSlowMo', [0.05, 1, 0.01]],
    ['modeSwitchTime', [0, 1.5, 0.01]],
    ['crimeTint', [0, 1, 0.05]],
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
  add(quality, tuning.ui as unknown as Record<string, unknown>, 'hud');
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
