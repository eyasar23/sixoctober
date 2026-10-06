/**
 * Every movement, camera and effect constant lives here (BRIEF.md §5.3).
 * The F1 panel edits this object live; "Copy values" exports it as JSON.
 * Units: metres, seconds and radians unless noted otherwise.
 */
export const tuning = {
  player: {
    /** Target running speed on the ground, m/s. 12 m/s ≈ 43 km/h (reference run: 38–60 km/h). */
    runSpeed: 12,
    /** How quickly the player reaches the target speed; higher feels snappier. 1/s. */
    acceleration: 10,
    /** Share of the ground acceleration available while airborne, 0..1. */
    airControl: 0.35,
    /** Upward speed given by a jump, m/s. */
    jumpStrength: 9,
    /** Downward acceleration, m/s². Stronger than real gravity (9.8) for a snappier arc. */
    gravity: 24,
    /** Capsule radius, m. */
    radius: 0.4,
    /** Capsule total height, m. */
    height: 1.8,
  },
  camera: {
    /** Distance from the camera to the point it looks at, m. */
    distance: 6,
    /** Height of the look-at point above the player's feet, m. */
    targetHeight: 1.6,
    /** Vertical field of view, degrees. */
    fov: 70,
    /** Mouse look speed, radians per pixel of mouse movement. */
    mouseSensitivity: 0.0025,
    /** Pitch limits, radians. Positive = camera above the player looking down. */
    minPitch: -0.35,
    maxPitch: 1.3,
    /** The camera never goes below this height, m. */
    minHeight: 0.3,
  },
  fx: {
    bloomIntensity: 1.2,
    /** Brightness above which pixels start to glow. */
    bloomThreshold: 0.6,
    bloomSmoothing: 0.3,
    /** Brightness multiplier of lit windows; values above 1 feed the bloom. */
    windowGlow: 1.8,
    /** Exponential fog density; higher = thicker purple haze. */
    fogDensity: 0.006,
    /** Soft light from the sky dome. Read at start-up. */
    skyLight: 2.5,
    /** Directional moonlight that shades building faces. Read at start-up. */
    moonLight: 1.2,
  },
  render: {
    /** Upper limit for devicePixelRatio; lower is faster on high-DPI screens. */
    maxPixelRatio: 1.5,
  },
  /** Test city layout. Read once at start-up; changing these needs a reload. */
  city: {
    seed: 6102026,
    /** Lots per side of the square grid. */
    gridSize: 6,
    /** Distance between lot centres, m. */
    lotSpacing: 40,
    /** Lots closer than this to the origin stay empty (spawn plaza), m. */
    clearRadius: 35,
    /** Random offset of a building inside its lot, m. */
    lotJitter: 4,
    minFootprint: 12,
    maxFootprint: 24,
    minHeight: 18,
    maxHeight: 110,
    /** Vertical distance between window rows, m. */
    floorHeight: 3.6,
    /** Horizontal distance between window columns, m. */
    windowSpacing: 3.2,
    /** Share of lit windows per building is picked from this range. */
    minLitShare: 0.15,
    maxLitShare: 0.5,
  },
  debug: {
    showFps: true,
  },
};

export type Tuning = typeof tuning;
export type CityTuning = Tuning['city'];
