import { BlendFunction, Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

const speedLinesShader = /* glsl */ `
  uniform float intensity;
  uniform float time;
  uniform float aspect;
  uniform vec3 lineColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (intensity <= 0.001) {
      outputColor = inputColor;
      return;
    }
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p);
    float angle = atan(p.y, p.x) / 6.2831853 + 0.5;
    float bands = 170.0;
    float id = floor(angle * bands);
    float f = fract(angle * bands);
    // Lines re-roll 12 times a second: the stepped comic look.
    float frame = floor(time * 12.0);
    float pick = hash(vec2(id, frame));
    float shape = hash(vec2(id + 41.0, frame));
    float on = step(pick, 0.1 + 0.5 * intensity);
    float width = 0.1 + 0.24 * shape;
    float wedge = 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.08, abs(f - 0.5));
    // Faster = lines reach further toward the centre.
    float start = mix(0.62, 0.33, intensity) + shape * 0.22;
    float radial = smoothstep(start, start + 0.14, r);
    float alpha = clamp(on * wedge * radial * intensity, 0.0, 1.0);
    outputColor = vec4(mix(inputColor.rgb, lineColor, alpha * 0.7), inputColor.a);
  }
`;

/** Comic speed lines streaming in from the screen edges (BRIEF.md §3.4). */
export class SpeedLinesEffect extends Effect {
  constructor() {
    super('SpeedLinesEffect', speedLinesShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['intensity', new Uniform(0)],
        ['time', new Uniform(0)],
        ['aspect', new Uniform(1)],
        ['lineColor', new Uniform(new Color('#FFF4E6'))],
      ]),
    });
  }

  set intensity(value: number) {
    const uniform = this.uniforms.get('intensity');
    if (uniform) uniform.value = value;
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime?: number): void {
    const uniform = this.uniforms.get('time');
    if (uniform) uniform.value += deltaTime ?? 0;
  }

  override setSize(width: number, height: number): void {
    const uniform = this.uniforms.get('aspect');
    if (uniform) uniform.value = width / Math.max(height, 1);
  }
}

const gradeShader = /* glsl */ `
  uniform float strength;
  uniform vec3 shadowTint;
  uniform vec3 highlightTint;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = c + shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * 0.06;
    graded = mix(graded, graded * highlightTint, smoothstep(0.3, 1.0, l) * 0.35);
    vec3 s = clamp(graded, 0.0, 1.0);
    graded = mix(graded, s * s * (3.0 - 2.0 * s), 0.22);
    outputColor = vec4(mix(c, graded, strength), inputColor.a);
  }
`;

/** Light colour grade: purple-lifted shadows, warm highlights, a soft contrast curve. */
export class ColorGradeEffect extends Effect {
  constructor(shadow: string, highlight: string) {
    super('ColorGradeEffect', gradeShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['strength', new Uniform(1)],
        ['shadowTint', new Uniform(new Color(shadow))],
        ['highlightTint', new Uniform(new Color(highlight))],
      ]),
    });
  }

  set strength(value: number) {
    const uniform = this.uniforms.get('strength');
    if (uniform) uniform.value = value;
  }
}
