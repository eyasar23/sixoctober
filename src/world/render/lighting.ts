import { Color, FogExp2, type Material, Uniform, UniformsLib, UniformsUtils, Vector3, Vector4 } from 'three';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';
import type { Box } from '../collision';

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
    // See-through tunnel between the camera and the hero (GLSL_XRAY).
    xrayCam: new Uniform(new Vector3()),
    xrayHero: new Uniform(new Vector4(0, -1000, 0, 1)),
    xrayStrength: new Uniform(0),
    /** Supporting wall stays opaque; w is 1 only while a support box is protected. */
    xraySupportMin: new Uniform(new Vector4()),
    xraySupportMax: new Uniform(new Vector3()),
    /** Crime x, z, tension 0..1, radius: neon near it flickers harder. */
    crimeZone: new Uniform(new Vector4(0, 0, 0, 1)),
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

  /**
   * Surfaces between the camera and the hero turn see-through (dithered) instead of the camera
   * jumping in front of them. `hero` is the chest point; `strength` 0 = off … 1 = fully open.
   */
  setXray(camera: Vector3, hero: Vector3, radius: number, strength: number, support: Box | null = null): void {
    this.uniforms.xrayCam.value.copy(camera);
    this.uniforms.xrayHero.value.set(hero.x, hero.y, hero.z, radius);
    this.uniforms.xrayStrength.value = strength;
    const skin = this.tuning.camera.collisionSkin;
    this.uniforms.xraySupportMin.value.set((support?.minX ?? 0) - skin, (support?.minY ?? 0) - skin, (support?.minZ ?? 0) - skin, support ? 1 : 0);
    this.uniforms.xraySupportMax.value.set((support?.maxX ?? 0) + skin, (support?.maxY ?? 0) + skin, (support?.maxZ ?? 0) + skin);
  }

  /** Adds the see-through tunnel to a built-in three.js material (roof props). */
  addXray(material: Material): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.xrayCam = this.uniforms.xrayCam;
      shader.uniforms.xrayHero = this.uniforms.xrayHero;
      shader.uniforms.xrayStrength = this.uniforms.xrayStrength;
      shader.uniforms.xraySupportMin = this.uniforms.xraySupportMin;
      shader.uniforms.xraySupportMax = this.uniforms.xraySupportMax;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vXrayWorld;\nvoid main() {')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 xrayWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            xrayWorld = instanceMatrix * xrayWorld;
          #endif
          vXrayWorld = (modelMatrix * xrayWorld).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying vec3 vXrayWorld;\n${GLSL_XRAY}\nvoid main() {\n  xray(vXrayWorld);`,
      );
    };
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

/**
 * See-through tunnel: fragments inside a cone from the camera to the hero (and at least a metre
 * in front of the hero) are dropped in an ordered-dither pattern, so a building in the way turns
 * half transparent around the hero instead of hiding them.
 */
export const GLSL_XRAY = /* glsl */ `
  uniform vec3 xrayCam;
  uniform vec4 xrayHero;
  uniform float xrayStrength;
  uniform vec4 xraySupportMin;
  uniform vec3 xraySupportMax;

  float bayer4(vec2 p) {
    ivec2 q = ivec2(mod(floor(p), 4.0));
    float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    return (m[q.x + q.y * 4] + 0.5) / 16.0;
  }

  void xray(vec3 worldPos) {
    if (xrayStrength <= 0.0) return;
    if (xraySupportMin.w > 0.0 && all(greaterThanEqual(worldPos, xraySupportMin.xyz)) && all(lessThanEqual(worldPos, xraySupportMax))) return;
    vec3 seg = xrayHero.xyz - xrayCam;
    float len2 = max(dot(seg, seg), 1e-4);
    float t = dot(worldPos - xrayCam, seg) / len2;
    if (t <= 0.0) return;
    float inFront = (1.0 - t) * sqrt(len2);
    if (inFront < 1.0) return;
    float d = length(worldPos - (xrayCam + seg * t));
    float r = xrayHero.w * mix(0.35, 1.0, clamp(t, 0.0, 1.0));
    float cut = (1.0 - smoothstep(r * 0.45, r, d)) * smoothstep(1.0, 2.5, inFront) * xrayStrength;
    if (cut > bayer4(gl_FragCoord.xy)) discard;
  }
`;
