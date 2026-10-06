import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';
import type { CityData } from '../cityGen';
import { BILLBOARD_ATLAS, createBrandAtlas, SIGN_ATLAS } from './brandAtlas';
import type { SceneLighting } from './lighting';

const instancedVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute vec4 aParams;
  varying vec2 vUv;
  varying vec3 vNormalLocal;
  varying vec3 vColor;
  varying vec4 vParams;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vNormalLocal = normal;
    vColor = aColor;
    vParams = aParams;
    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** Vertical neon blade signs: brand name glowing on the two flat faces. */
const signFragment = /* glsl */ `
  uniform sampler2D atlas;
  uniform vec2 atlasGrid;
  uniform float glow;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormalLocal;
  varying vec3 vColor;
  varying vec4 vParams; // brand, flicker seed, -, -
  #include <fog_pars_fragment>
  void main() {
    vec3 color;
    // Old neon flickers now and then.
    float flicker = step(0.04, fract(sin(floor(time * 9.0) + vParams.y * 31.7) * 43758.5));
    if (abs(vNormalLocal.z) > 0.5) {
      float col = mod(vParams.x, atlasGrid.x);
      float row = floor(vParams.x / atlasGrid.x);
      vec2 uv = vec2((col + vUv.x) / atlasGrid.x, (row + vUv.y) / atlasGrid.y);
      float text = texture2D(atlas, uv).r;
      float border = 1.0 - step(0.06, vUv.x) * step(vUv.x, 0.94) * step(0.03, vUv.y) * step(vUv.y, 0.97);
      color = mix(vec3(0.03, 0.015, 0.05), vColor * glow * flicker, clamp(text + border, 0.0, 1.0));
    } else {
      color = vColor * glow * 0.5 * flicker;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

/** Giant ad screens: five animated patterns under a fictional brand name. */
const billboardFragment = /* glsl */ `
  uniform sampler2D atlas;
  uniform vec2 atlasGrid;
  uniform float glow;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormalLocal;
  varying vec3 vColor;  // colour A
  varying vec4 vParams; // pattern, brand, seed, colour B index
  uniform vec3 neon[5];
  #include <fog_pars_fragment>

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec3 a = vColor;
    vec3 b = neon[int(vParams.w) % 5];
    float t = time + vParams.z;
    float pattern = vParams.x;
    vec3 col;
    if (pattern < 0.5) {
      float s = step(0.5, fract((uv.x * 1.8 + uv.y) * 4.0 - t * 0.5));
      col = mix(a, b, s) * 0.85;
    } else if (pattern < 1.5) {
      float d = length((uv - 0.5) * vec2(2.0, 1.0));
      col = mix(a * 0.35, b, 0.5 + 0.5 * sin(d * 20.0 - t * 4.0));
    } else if (pattern < 2.5) {
      float bar = floor(uv.x * 14.0);
      float h = 0.3 + 0.6 * abs(sin(t * (1.3 + hash(bar) * 2.2) + bar));
      col = (uv.y < h && fract(uv.x * 14.0) > 0.16) ? mix(a, b, uv.y) : a * 0.12;
    } else if (pattern < 3.5) {
      float w = sin(uv.x * 9.0 + t * 1.3) * 0.12 + sin(uv.x * 3.0 - t * 0.7) * 0.15;
      col = mix(a, b, smoothstep(-0.04, 0.04, uv.y - 0.55 - w));
    } else {
      // Comic halftone dots, breathing.
      vec2 g = uv * vec2(36.0, 18.0);
      float r = length(fract(g) - 0.5);
      float size = 0.22 + 0.2 * sin(t * 2.0 + (floor(g.x) + floor(g.y)) * 0.35);
      col = mix(a * 0.2, b, step(r, size));
    }
    // Brand name in the lower part of the screen.
    vec2 local = vec2(uv.x, (uv.y - 0.08) / 0.4);
    if (local.y > 0.0 && local.y < 1.0) {
      float cellCol = mod(vParams.y, atlasGrid.x);
      float cellRow = floor(vParams.y / atlasGrid.x);
      float text = texture2D(atlas, vec2((cellCol + local.x) / atlasGrid.x, (cellRow + local.y) / atlasGrid.y)).r;
      col = mix(col * 0.55, vec3(1.0), text);
    }
    float frame = step(0.025, uv.x) * step(uv.x, 0.975) * step(0.045, uv.y) * step(uv.y, 0.955);
    col = mix(vec3(0.02, 0.01, 0.03), col * glow, frame);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

/** Antenna tip lights: blink with a per-instance phase. */
const blinkVertex = /* glsl */ `
  attribute float aPhase;
  varying float vPhase;
  #include <fog_pars_vertex>
  void main() {
    vPhase = aPhase;
    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const blinkFragment = /* glsl */ `
  uniform vec3 lightColor;
  uniform float time;
  varying float vPhase;
  #include <fog_pars_fragment>
  void main() {
    float on = step(0.55, fract(time * 0.6 + vPhase));
    gl_FragColor = vec4(lightColor * (0.15 + on * 3.5), 1.0);
    #include <fog_fragment>
  }
`;

/** Roof props, neon blade signs and animated billboards. */
export function createProps(
  city: CityData,
  lighting: SceneLighting,
  tuning: Tuning,
  brandNames: string[],
): { group: Group; update(): void } {
  const group = new Group();
  const matrix = new Matrix4();
  const scale = new Vector3();

  // Water tanks: legs, barrel and a little cone roof, built at unit size.
  const legs = [-0.3, 0.3].flatMap((x) => [-0.3, 0.3].map((z) => new BoxGeometry(0.07, 0.36, 0.07).translate(x, 0.18, z)));
  const tankGeometry = mergeGeometries([
    ...legs,
    new CylinderGeometry(0.5, 0.5, 0.52, 10).translate(0, 0.62, 0),
    new ConeGeometry(0.56, 0.14, 10).translate(0, 0.95, 0),
  ]);
  const acGeometry = mergeGeometries([new BoxGeometry(1, 0.9, 1).translate(0, 0.45, 0), new BoxGeometry(0.8, 0.1, 0.8).translate(0, 0.95, 0)]);
  const antennaGeometry = new CylinderGeometry(0.3, 0.5, 1, 5).translate(0, 0.5, 0);

  const tanks = city.roofProps.filter((p) => p.kind === 'tank');
  const acs = city.roofProps.filter((p) => p.kind === 'ac');
  const antennas = city.roofProps.filter((p) => p.kind === 'antenna');
  const addProps = (geometry: typeof tankGeometry, color: string, list: typeof tanks, widthScale = 1): void => {
    if (list.length === 0) return;
    const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({ color }), list.length);
    list.forEach((p, i) => {
      matrix.makeScale(p.sx * widthScale, p.sy, p.sz * widthScale).setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  addProps(tankGeometry, '#5A3A4A', tanks);
  addProps(acGeometry, '#6A5F7C', acs);
  addProps(antennaGeometry, '#2E2238', antennas, 0.5);

  if (antennas.length > 0) {
    const lights = new InstancedMesh(
      new SphereGeometry(0.35, 8, 6),
      new ShaderMaterial({
        vertexShader: blinkVertex,
        fragmentShader: blinkFragment,
        fog: true,
        uniforms: lighting.materialUniforms({ lightColor: new Uniform(new Color(palette.antennaLight)) }),
      }),
      antennas.length,
    );
    const phases = new Float32Array(antennas.length);
    antennas.forEach((p, i) => {
      matrix.makeTranslation(p.x, p.y + p.sy, p.z);
      lights.setMatrixAt(i, matrix);
      phases[i] = (i * 0.618) % 1;
    });
    lights.geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));
    lights.frustumCulled = false;
    group.add(lights);
  }

  // Neon blade signs.
  const signAtlas = createBrandAtlas(brandNames, SIGN_ATLAS, true);
  const signMaterial = new ShaderMaterial({
    vertexShader: instancedVertex,
    fragmentShader: signFragment,
    fog: true,
    uniforms: lighting.materialUniforms({
      atlas: new Uniform(signAtlas),
      atlasGrid: new Uniform([SIGN_ATLAS.columns, SIGN_ATLAS.rows]),
      glow: new Uniform(2.2),
    }),
  });
  const signs = new InstancedMesh(new BoxGeometry(1.5, 1, 0.25), signMaterial, Math.max(city.signs.length, 1));
  const signColors = new Float32Array(Math.max(city.signs.length, 1) * 3);
  const signParams = new Float32Array(Math.max(city.signs.length, 1) * 4);
  const color = new Color();
  city.signs.forEach((s, i) => {
    matrix.makeRotationY(s.rotation).scale(scale.set(1, s.height, 1)).setPosition(s.x, s.y, s.z);
    signs.setMatrixAt(i, matrix);
    color.set(palette.neon[s.color] ?? palette.neon[0]).toArray(signColors, i * 3);
    signParams.set([s.brand, i * 0.37, 0, 0], i * 4);
  });
  signs.count = city.signs.length;
  signs.geometry.setAttribute('aColor', new InstancedBufferAttribute(signColors, 3));
  signs.geometry.setAttribute('aParams', new InstancedBufferAttribute(signParams, 4));
  signs.frustumCulled = false;
  group.add(signs);

  // Billboards.
  const billboardAtlas = createBrandAtlas(brandNames, BILLBOARD_ATLAS, false);
  const billboardMaterial = new ShaderMaterial({
    vertexShader: instancedVertex,
    fragmentShader: billboardFragment,
    fog: true,
    uniforms: lighting.materialUniforms({
      atlas: new Uniform(billboardAtlas),
      atlasGrid: new Uniform([BILLBOARD_ATLAS.columns, BILLBOARD_ATLAS.rows]),
      glow: new Uniform(1.7),
      neon: new Uniform(palette.neon.map((c) => new Color(c))),
    }),
  });
  const count = Math.max(city.billboards.length, 1);
  const billboards = new InstancedMesh(new PlaneGeometry(1, 1), billboardMaterial, count);
  const boardColors = new Float32Array(count * 3);
  const boardParams = new Float32Array(count * 4);
  city.billboards.forEach((b, i) => {
    matrix.makeRotationY(b.rotation).scale(scale.set(b.width, b.height, 1)).setPosition(b.x, b.y, b.z);
    billboards.setMatrixAt(i, matrix);
    color.set(palette.neon[b.colorA] ?? palette.neon[0]).toArray(boardColors, i * 3);
    boardParams.set([b.pattern, b.brand, i * 3.7, b.colorB === b.colorA ? (b.colorB + 2) % palette.neon.length : b.colorB], i * 4);
  });
  billboards.count = city.billboards.length;
  billboards.geometry.setAttribute('aColor', new InstancedBufferAttribute(boardColors, 3));
  billboards.geometry.setAttribute('aParams', new InstancedBufferAttribute(boardParams, 4));
  billboards.frustumCulled = false;
  group.add(billboards);

  return {
    group,
    update() {
      billboards.visible = tuning.city.billboards;
    },
  };
}
