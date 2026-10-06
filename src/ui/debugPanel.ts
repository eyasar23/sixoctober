import GUI from 'lil-gui';
import { tuning } from '../config/tuning';
import { t } from '../i18n';

/** How long the "Copied!" label stays on the button, ms. */
const COPIED_LABEL_MS = 1500;

/** F1 tuning panel (BRIEF.md §5.3): edits `tuning` live and copies it as JSON. */
export function createDebugPanel(): GUI {
  const gui = new GUI({ title: t('panel.title') });
  gui.hide();

  const player = gui.addFolder(t('panel.player'));
  player.add(tuning.player, 'runSpeed', 1, 40, 0.5).name(t('panel.runSpeed'));
  player.add(tuning.player, 'jumpStrength', 1, 30, 0.5).name(t('panel.jumpStrength'));
  player.add(tuning.player, 'gravity', 5, 60, 1).name(t('panel.gravity'));

  const camera = gui.addFolder(t('panel.camera'));
  camera.add(tuning.camera, 'distance', 2, 20, 0.1).name(t('panel.cameraDistance'));
  camera.add(tuning.camera, 'fov', 40, 110, 1).name(t('panel.fov'));
  camera.add(tuning.camera, 'mouseSensitivity', 0.0005, 0.01, 0.0001).name(t('panel.mouseSensitivity'));

  const effects = gui.addFolder(t('panel.effects'));
  effects.add(tuning.fx, 'bloomIntensity', 0, 5, 0.05).name(t('panel.bloomIntensity'));
  effects.add(tuning.fx, 'bloomThreshold', 0, 2, 0.01).name(t('panel.bloomThreshold'));
  effects.add(tuning.fx, 'windowGlow', 0.5, 4, 0.05).name(t('panel.windowGlow'));
  effects.add(tuning.fx, 'fogDensity', 0, 0.02, 0.0005).name(t('panel.fogDensity'));

  gui.add(tuning.debug, 'showFps').name(t('panel.showFps'));

  const actions = {
    copyValues: () => {
      const json = JSON.stringify(tuning, null, 2);
      const copied = navigator.clipboard
        ? navigator.clipboard.writeText(json)
        : Promise.reject(new Error('Clipboard unavailable'));
      copied.then(
        () => {
          copyButton.name(t('panel.copied'));
          setTimeout(() => copyButton.name(t('panel.copyValues')), COPIED_LABEL_MS);
        },
        () => window.prompt(t('panel.copyFallback'), json),
      );
    },
  };
  const copyButton = gui.add(actions, 'copyValues').name(t('panel.copyValues'));

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
