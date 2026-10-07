import { afterEach, describe, expect, it, vi } from 'vitest';
import { tuning } from '../config/tuning';
import { applySettings, defaultSettings, loadSettings, saveSettings } from './settings';

const STORAGE_KEY = 'sixoctober.settings.v1';

function mockStorage(saved?: unknown): Map<string, string> {
  const values = new Map<string, string>();
  if (saved !== undefined) values.set(STORAGE_KEY, JSON.stringify(saved));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('camera preset settings', () => {
  it('uses Reference for a fresh settings object', () => {
    mockStorage();
    expect(defaultSettings(tuning).cameraPreset).toBe('reference');
    expect(loadSettings(tuning).cameraPreset).toBe('reference');
  });

  it.each([
    [true, 'reference'],
    [false, 'manual'],
  ])('migrates legacy autoRecenter %s to %s', (autoRecenter, preset) => {
    mockStorage({ autoRecenter });
    expect(loadSettings(tuning).cameraPreset).toBe(preset);
  });

  it('gives a valid new preset priority over the legacy boolean', () => {
    mockStorage({ cameraPreset: 'manual', autoRecenter: true });
    expect(loadSettings(tuning).cameraPreset).toBe('manual');
    mockStorage({ cameraPreset: 'reference', autoRecenter: false });
    expect(loadSettings(tuning).cameraPreset).toBe('reference');
  });

  it('falls back for an invalid saved preset and corrupt storage', () => {
    const values = mockStorage({ cameraPreset: 'cinematic' });
    expect(loadSettings(tuning).cameraPreset).toBe('reference');
    values.set(STORAGE_KEY, '{bad json');
    expect(loadSettings(tuning).cameraPreset).toBe('reference');
  });

  it('applies and saves Manual without replacing the state framing profiles', () => {
    const values = mockStorage({ cameraPreset: 'manual' });
    const live = structuredClone(tuning);
    const profiles = live.camera.profiles;
    const settings = loadSettings(live);
    applySettings(settings, live, live.camera.mouseSensitivity);
    expect(live.camera.preset).toBe('manual');
    expect(live.camera.profiles).toBe(profiles);
    expect(live.camera.profiles).toEqual(tuning.camera.profiles);
    saveSettings(settings);
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toMatchObject({ cameraPreset: 'manual' });
    expect(JSON.parse(values.get(STORAGE_KEY)!)).not.toHaveProperty('autoRecenter');
  });
});
