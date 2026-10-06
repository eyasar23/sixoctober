import { BackSide, Color, DirectionalLight, HemisphereLight, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { palette } from '../config/palette';
import type { Tuning } from '../config/tuning';

const SKY_RADIUS = 900;

/** Night gradient dome (BRIEF.md §4.1). Keep it centred on the camera every frame. */
export function createSky(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      topColor: { value: new Color(palette.skyTop) },
      midColor: { value: new Color(palette.skyMid) },
      horizonColor: { value: new Color(palette.horizon) },
      glowColor: { value: new Color(palette.horizonGlow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float h = d.y;
        vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.32, h));
        color = mix(color, topColor, smoothstep(0.25, 0.85, h));
        // City glow: a pale band just above the horizon.
        color = mix(color, glowColor, 0.5 * (1.0 - smoothstep(0.0, 0.08, abs(h - 0.015))));
        // Soft banded clouds catching the city light.
        float bands = sin(d.x * 3.0 + d.z * 2.0 + h * 40.0) * sin(d.z * 5.0 - h * 25.0);
        color += midColor * 0.08 * smoothstep(0.3, 1.0, bands) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.35, 0.7, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new Mesh(new SphereGeometry(SKY_RADIUS, 48, 24), material);
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  return sky;
}

/** Lights for the standard three.js materials (props, hero); city shaders light themselves. */
export function createLights(tuning: Tuning): { lights: [HemisphereLight, DirectionalLight]; update(): void } {
  const sky = new HemisphereLight(palette.horizon, palette.warmGround, 1);
  const moon = new DirectionalLight(palette.moonlight, 1);
  moon.position.set(-45, 75, 35);
  const update = (): void => {
    sky.intensity = tuning.fx.skyLight * 1.4;
    moon.intensity = tuning.fx.moonLight * 1.2;
  };
  update();
  return { lights: [sky, moon], update };
}
