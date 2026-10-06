import { Color, FogExp2, Uniform, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';

/**
 * Light and fog values shared by every custom shader in the city, kept as uniform objects so a
 * change (F1 panel) reaches all materials at once.
 */
export class SceneLighting {
  readonly fog: FogExp2;
  readonly uniforms = {
    skyLight: new Uniform(new Color()),
    groundLight: new Uniform(new Color()),
    moonColor: new Uniform(new Color()),
    moonDir: new Uniform(new Vector3(-0.45, 0.75, 0.35).normalize()),
    time: new Uniform(0),
  };

  constructor(private readonly tuning: Tuning) {
    this.fog = new FogExp2(palette.horizon, tuning.fx.fogDensity);
    this.update(0);
  }

  update(time: number): void {
    const fx = this.tuning.fx;
    this.uniforms.time.value = time;
    this.uniforms.skyLight.value.set(palette.horizon).multiplyScalar(fx.skyLight * 0.55);
    this.uniforms.groundLight.value.set(palette.warmGround).multiplyScalar(fx.skyLight * 0.22);
    this.uniforms.moonColor.value.set(palette.moonlight).multiplyScalar(fx.moonLight * 0.6);
    this.fog.density = fx.fogDensity;
  }

  /** Uniforms for a ShaderMaterial: fog (filled in by three.js) plus the shared lights. */
  materialUniforms<T extends Record<string, Uniform>>(extra: T): T & Record<string, Uniform> {
    return { ...UniformsUtils.clone(UniformsLib.fog), ...this.uniforms, ...extra };
  }
}

/** GLSL helpers shared by the city shaders. */
export const GLSL_COMMON = /* glsl */ `
  uniform vec3 skyLight;
  uniform vec3 groundLight;
  uniform vec3 moonColor;
  uniform vec3 moonDir;
  uniform float time;

  // Exact integer hash (PCG3D), 0..1: stable on every GPU, unlike float hashes of large values.
  float hashInt(ivec3 p) {
    uvec3 v = uvec3(p) * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return float(v.x & 0x00ffffffu) / 16777216.0;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 ambientLight(vec3 n) {
    return mix(groundLight, skyLight, n.y * 0.5 + 0.5) + moonColor * max(dot(n, moonDir), 0.0);
  }
`;
