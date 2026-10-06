import { palette } from '../config/palette';
import { tuning, type CityTuning } from '../config/tuning';
import { createRng, type Rng } from '../core/random';

/** A box building. The footprint is centred on (x, z) and the base sits on the ground. */
export interface BuildingSpec {
  x: number;
  z: number;
  /** Size along X, m. */
  width: number;
  /** Size along Z, m. */
  depth: number;
  height: number;
  /** Index into palette.buildings. */
  colorIndex: number;
}

/** A lit window, centred on (x, y, z). */
export interface WindowSpec {
  x: number;
  y: number;
  z: number;
  /** Rotation around Y that turns the window out of its facade, radians. */
  rotationY: number;
  /** Index into palette.windows. */
  colorIndex: number;
}

export interface TestCity {
  buildings: BuildingSpec[];
  windows: WindowSpec[];
}

/** Lifts windows off the wall so they do not flicker against it, m. */
const WINDOW_OFFSET = 0.05;

/**
 * Pure data, no three.js: the same seed and options always give the same city.
 * Buildings sit on a square grid of lots around an empty plaza at the origin.
 */
export function generateTestCity(seed: number, options: CityTuning = tuning.city): TestCity {
  const rng = createRng(seed);
  const buildings: BuildingSpec[] = [];
  const windows: WindowSpec[] = [];
  const half = (options.gridSize - 1) / 2;

  for (let row = 0; row < options.gridSize; row++) {
    for (let col = 0; col < options.gridSize; col++) {
      const lotX = (col - half) * options.lotSpacing;
      const lotZ = (row - half) * options.lotSpacing;
      if (Math.hypot(lotX, lotZ) < options.clearRadius) continue;

      const building: BuildingSpec = {
        x: lotX + rng.range(-options.lotJitter, options.lotJitter),
        z: lotZ + rng.range(-options.lotJitter, options.lotJitter),
        width: rng.range(options.minFootprint, options.maxFootprint),
        depth: rng.range(options.minFootprint, options.maxFootprint),
        // Squaring skews towards shorter buildings with a few tall towers.
        height: options.minHeight + (options.maxHeight - options.minHeight) * rng.next() ** 2,
        colorIndex: rng.index(palette.buildings.length),
      };
      buildings.push(building);
      addWindows(building, rng.range(options.minLitShare, options.maxLitShare), options, rng, windows);
    }
  }

  return { buildings, windows };
}

function addWindows(
  b: BuildingSpec,
  litShare: number,
  options: CityTuning,
  rng: Rng,
  out: WindowSpec[],
): void {
  const facades = [
    { dx: 0, dz: b.depth / 2 + WINDOW_OFFSET, alongX: true, width: b.width, rotationY: 0 },
    { dx: 0, dz: -b.depth / 2 - WINDOW_OFFSET, alongX: true, width: b.width, rotationY: Math.PI },
    { dx: b.width / 2 + WINDOW_OFFSET, dz: 0, alongX: false, width: b.depth, rotationY: Math.PI / 2 },
    { dx: -b.width / 2 - WINDOW_OFFSET, dz: 0, alongX: false, width: b.depth, rotationY: -Math.PI / 2 },
  ];
  const rows = Math.floor((b.height - options.floorHeight) / options.floorHeight);

  for (const facade of facades) {
    const columns = Math.floor(facade.width / options.windowSpacing);
    const first = (-(columns - 1) * options.windowSpacing) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (!rng.chance(litShare)) continue;
        const offset = first + c * options.windowSpacing;
        out.push({
          x: b.x + facade.dx + (facade.alongX ? offset : 0),
          y: options.floorHeight * (r + 1),
          z: b.z + facade.dz + (facade.alongX ? 0 : offset),
          rotationY: facade.rotationY,
          colorIndex: rng.index(palette.windows.length),
        });
      }
    }
  }
}
