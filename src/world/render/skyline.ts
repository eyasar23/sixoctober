import { CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, RepeatWrapping, ShaderMaterial, Uniform } from 'three';
import { palette } from '../../config/palette';
import { createRng } from '../../core/random';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 repeat;
  uniform vec3 layerColor;
  uniform vec3 hazeColor;
  uniform vec3 windowColor;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv * repeat);
    if (t.r < 0.5) discard;
    // The base of each layer sinks into the haze; lit windows dot the silhouettes.
    vec3 color = mix(hazeColor, layerColor, smoothstep(0.0, 0.55, vUv.y));
    color += windowColor * t.g;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const LAYERS = [
  { radius: 1250, height: 330, color: '#4A2B5E', haze: 0.35, repeat: 3 },
  { radius: 1750, height: 420, color: '#6E4F8F', haze: 0.55, repeat: 4 },
  { radius: 2350, height: 520, color: '#895079', haze: 0.75, repeat: 5 },
];

/**
 * Three rings of distant skyline beyond the playable city, each a little lighter (layered
 * depth). Not fogged: they carry their own haze colour.
 */
export function createSkyline(seed: number): Group {
  const group = new Group();
  LAYERS.forEach((layer, index) => {
    const texture = new CanvasTexture(drawSilhouettes(seed + index * 101));
    texture.wrapS = RepeatWrapping;
    const horizon = new Color(palette.horizon);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      uniforms: {
        map: new Uniform(texture),
        repeat: new Uniform([layer.repeat, 1]),
        layerColor: new Uniform(new Color(layer.color).lerp(horizon, layer.haze)),
        hazeColor: new Uniform(horizon),
        windowColor: new Uniform(new Color(palette.windows[0]).multiplyScalar(0.55 - index * 0.15)),
      },
    });
    const mesh = new Mesh(new CylinderGeometry(layer.radius, layer.radius, layer.height, 96, 1, true).translate(0, layer.height / 2 - 20, 0), material);
    mesh.renderOrder = -1 + index * 0.01;
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return group;
}

/** Red channel: building silhouettes from the bottom up. Green: sparse lit windows. */
function drawSilhouettes(seed: number): HTMLCanvasElement {
  const width = 2048;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rng = createRng(seed);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  let x = 0;
  while (x < width) {
    const w = rng.range(14, 60);
    const h = height * rng.range(0.12, 0.75) * (rng.chance(0.08) ? 1.3 : 1);
    ctx.fillStyle = '#f00';
    ctx.fillRect(x, height - h, w, h);
    if (rng.chance(0.15)) ctx.fillRect(x + w * 0.45, height - h - rng.range(8, 30), Math.max(2, w * 0.08), rng.range(8, 30));
    ctx.fillStyle = '#ff0';
    for (let i = 0; i < w * h * 0.004; i++) {
      ctx.fillRect(x + rng.range(2, w - 3), height - rng.range(3, h - 3), 2, 2);
    }
    x += w + (rng.chance(0.3) ? rng.range(2, 12) : 0);
  }
  return canvas;
}
