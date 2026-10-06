import * as THREE from 'three';
import { palette } from '../config/palette';
import { tuning } from '../config/tuning';

const SKY_RADIUS = 900;
const GROUND_SIZE = 2000;
/** One grid line every this many metres; makes speed readable on the flat ground. */
const GRID_CELL = 10;

/** Night gradient dome (BRIEF.md §4.1). Keep it centred on the camera every frame. */
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(palette.skyTop) },
      midColor: { value: new THREE.Color(palette.skyMid) },
      horizonColor: { value: new THREE.Color(palette.horizon) },
      glowColor: { value: new THREE.Color(palette.horizonGlow) },
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
        float h = normalize(vDirection).y;
        vec3 color = mix(horizonColor, midColor, smoothstep(0.02, 0.3, h));
        color = mix(color, topColor, smoothstep(0.25, 0.8, h));
        // Thin pale band just above the horizon.
        color = mix(color, glowColor, 0.45 * (1.0 - smoothstep(0.0, 0.06, abs(h - 0.02))));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** Fog colour matches the sky's horizon so distant buildings melt into it. */
export function createFog(): THREE.FogExp2 {
  return new THREE.FogExp2(palette.horizon, tuning.fx.fogDensity);
}

/** Flat lavender ground with a faint grid. `anisotropy` keeps the grid sharp at low angles. */
export function createGround(anisotropy: number): THREE.Mesh {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshBasicMaterial({ map: createGridTexture(anisotropy) }),
  );
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

/** One lavender tile with a line on two edges; repeated, it draws the grid. */
function createGridTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const line = 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = palette.groundLavender;
    context.fillRect(0, 0, size, size);
    context.fillStyle = palette.gridLine;
    context.fillRect(0, 0, size, line);
    context.fillRect(0, 0, line, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(GROUND_SIZE / GRID_CELL);
  texture.anisotropy = anisotropy;
  return texture;
}

export function createLights(): THREE.Light[] {
  const sky = new THREE.HemisphereLight(palette.horizon, palette.buildings[2], tuning.fx.skyLight);
  const moon = new THREE.DirectionalLight(palette.moonlight, tuning.fx.moonLight);
  moon.position.set(-60, 100, 40);
  return [sky, moon];
}
