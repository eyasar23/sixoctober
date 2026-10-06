import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Uniform,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';
import { type CityData, SLAB_HEIGHT } from '../cityGen';
import { GLSL_COMMON, type SceneLighting } from './lighting';

const groundVertex = /* glsl */ `
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** Roads, lane lines and crosswalks drawn procedurally on one big ground plane. */
const groundFragment = /* glsl */ `
  ${GLSL_COMMON}
  uniform float halfSize;
  uniform float avenueSpacing;
  uniform float avenueHalf;
  uniform float streetSpacing;
  uniform float streetHalf;
  uniform float boulevardZ;
  uniform float boulevardHalf;
  uniform float centralEnd;
  uniform vec3 asphalt;
  uniform vec3 lineColor;
  uniform vec3 outsideColor;
  uniform vec3 sheenColor;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>

  float line(float x, float center, float halfWidth, float aa) {
    return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(x - center));
  }

  void main() {
    vec2 p = vWorldPos.xz;
    float aa = max(fwidth(p.x), fwidth(p.y)) * 0.75;
    float ax = p.x - avenueSpacing * floor(p.x / avenueSpacing + 0.5);
    float streetCenter = streetSpacing * floor((p.y - streetSpacing * 0.5) / streetSpacing + 0.5) + streetSpacing * 0.5;
    float sz = p.y - streetCenter;
    float sHalf = abs(streetCenter - boulevardZ) < 1.0 ? boulevardHalf : streetHalf;
    bool inCity = abs(p.x) < halfSize && abs(p.y) < halfSize;
    bool centralGap = abs(p.x) < avenueHalf && p.y > centralEnd;
    bool onAvenue = abs(ax) < avenueHalf && !centralGap;
    bool onStreet = abs(sz) < sHalf;
    bool crossing = onAvenue && onStreet;

    vec3 color = inCity ? asphalt : outsideColor;
    color *= 0.88 + 0.24 * hash12(floor(p * 1.7));
    float marks = 0.0;
    if (inCity && onAvenue && !crossing) {
      marks += line(abs(ax), 0.3, 0.1, aa);
      marks += line(abs(ax), avenueHalf - 0.7, 0.12, aa);
      marks += line(abs(ax), 6.75, 0.1, aa) * step(0.5, fract(p.y / 9.0));
      float d = abs(sz) - sHalf;
      if (d > 0.8 && d < 4.8 && abs(ax) < avenueHalf - 0.8) marks += step(0.45, fract(ax / 1.3));
    }
    if (inCity && onStreet && !crossing) {
      float dash = step(0.5, fract(p.x / 8.0));
      if (sHalf > streetHalf + 0.5) {
        marks += line(abs(sz), 0.3, 0.1, aa);
        marks += line(abs(sz), 6.75, 0.1, aa) * dash;
      } else {
        marks += line(sz, 0.0, 0.1, aa) * dash;
      }
      marks += line(abs(sz), sHalf - 0.6, 0.1, aa);
      float d = abs(ax) - avenueHalf;
      if (d > 0.8 && d < 4.8 && abs(sz) < sHalf - 0.8) marks += step(0.45, fract(sz / 1.3));
    }
    marks = clamp(marks, 0.0, 1.0);

    vec3 lit = color * ambientLight(vec3(0.0, 1.0, 0.0));
    lit = mix(lit, lineColor * 0.55, marks * 0.9);
    // Glossy sheen toward the horizon: reads like damp asphalt.
    vec3 view = normalize(cameraPosition - vWorldPos);
    lit += sheenColor * pow(1.0 - clamp(view.y, 0.0, 1.0), 5.0) * 0.35;
    gl_FragColor = vec4(lit, 1.0);
    #include <fog_fragment>
  }
`;

const slabVertex = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vNormal;
  #include <fog_pars_vertex>
  void main() {
    vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vLocal = position * size;
    vSize = size;
    vNormal = normal;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const slabFragment = /* glsl */ `
  ${GLSL_COMMON}
  uniform vec3 sidewalk;
  varying vec3 vWorldPos;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vNormal;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vNormal);
    vec2 tile = abs(fract(vWorldPos.xz / 2.0) - 0.5);
    float grout = smoothstep(0.47, 0.5, max(tile.x, tile.y));
    vec2 edge = vSize.xz * 0.5 - abs(vLocal.xz);
    float kerb = 1.0 - smoothstep(0.25, 0.45, min(edge.x, edge.y));
    vec3 color = sidewalk * (0.92 - grout * 0.18) * (1.0 + kerb * 0.45);
    if (n.y < 0.5) color *= 0.75;
    gl_FragColor = vec4(color * ambientLight(n), 1.0);
    #include <fog_fragment>
  }
`;

const poolVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const poolFragment = /* glsl */ `
  uniform vec3 poolColor;
  uniform float strength;
  uniform float fogDensity;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float glow = pow(max(1.0 - d, 0.0), 2.2);
    float fogFade = exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor = vec4(poolColor * glow * strength * fogFade, 1.0);
  }
`;

const LAMP_HEIGHT = 7.6;
const ARM_LENGTH = 2.6;

/** Ground with roads, sidewalk slabs, street lamps and their warm light pools. */
export function createStreets(
  city: CityData,
  lighting: SceneLighting,
  tuning: Tuning,
): { group: Group; update(): void; setLampPools(visible: boolean): void } {
  const o = tuning.city;
  const group = new Group();

  const groundSize = (city.halfSize + 1600) * 2;
  const central = city.roads.find((r) => r.axis === 'z' && r.center === 0);
  const groundMaterial = new ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
    fog: true,
    uniforms: lighting.materialUniforms({
      halfSize: new Uniform(city.halfSize),
      avenueSpacing: new Uniform(o.avenueSpacing),
      avenueHalf: new Uniform(o.avenueRoad / 2),
      streetSpacing: new Uniform(o.streetSpacing),
      streetHalf: new Uniform(o.streetRoad / 2),
      boulevardZ: new Uniform(-o.streetSpacing / 2),
      boulevardHalf: new Uniform(o.boulevardRoad / 2),
      centralEnd: new Uniform(central?.maxZ ?? city.halfSize),
      asphalt: new Uniform(new Color(palette.asphalt)),
      lineColor: new Uniform(new Color(palette.laneLine)),
      outsideColor: new Uniform(new Color(palette.groundLavender).multiplyScalar(0.55)),
      sheenColor: new Uniform(new Color(palette.horizon)),
    }),
  });
  const ground = new Mesh(new PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2), groundMaterial);
  ground.frustumCulled = false;
  group.add(ground);

  // Sidewalk slabs.
  const slabs = new InstancedMesh(
    new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new ShaderMaterial({
      vertexShader: slabVertex,
      fragmentShader: slabFragment,
      fog: true,
      uniforms: lighting.materialUniforms({ sidewalk: new Uniform(new Color(palette.sidewalk)) }),
    }),
    city.blocks.length,
  );
  const matrix = new Matrix4();
  city.blocks.forEach((b, i) => {
    matrix.makeScale(b.maxX - b.minX, SLAB_HEIGHT, b.maxZ - b.minZ).setPosition((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    slabs.setMatrixAt(i, matrix);
  });
  slabs.frustumCulled = false;
  group.add(slabs);

  // Street lamps: poles with arms, glowing heads and warm pools of light on the ground.
  const pole = new CylinderGeometry(0.09, 0.14, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0);
  const arm = new BoxGeometry(0.12, 0.12, ARM_LENGTH).translate(0, LAMP_HEIGHT - 0.1, -ARM_LENGTH / 2 + 0.1);
  const poles = new InstancedMesh(mergeGeometries([pole, arm]), new MeshLambertMaterial({ color: palette.roof }), city.lamps.length);
  const heads = new InstancedMesh(
    new BoxGeometry(0.5, 0.18, 0.9).translate(0, LAMP_HEIGHT - 0.25, -ARM_LENGTH + 0.2),
    new MeshBasicMaterial({ color: new Color(palette.lamp).multiplyScalar(3.2) }),
    city.lamps.length,
  );
  const poolMaterial = new ShaderMaterial({
    vertexShader: poolVertex,
    fragmentShader: poolFragment,
    uniforms: {
      poolColor: new Uniform(new Color(palette.lamp).lerp(new Color(palette.warmGround), 0.5)),
      strength: new Uniform(tuning.fx.lampPools),
      fogDensity: new Uniform(tuning.fx.fogDensity),
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pools = new InstancedMesh(
    new PlaneGeometry(15, 15).rotateX(-Math.PI / 2).translate(0, SLAB_HEIGHT + 0.03, -ARM_LENGTH + 0.2),
    poolMaterial,
    city.lamps.length,
  );
  city.lamps.forEach((lamp, i) => {
    matrix.makeRotationY(lamp.rotation).setPosition(lamp.x, 0, lamp.z);
    poles.setMatrixAt(i, matrix);
    heads.setMatrixAt(i, matrix);
    pools.setMatrixAt(i, matrix);
  });
  for (const mesh of [poles, heads, pools]) {
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return {
    group,
    update() {
      poolMaterial.uniforms.strength!.value = tuning.fx.lampPools;
      poolMaterial.uniforms.fogDensity!.value = tuning.fx.fogDensity;
    },
    setLampPools(visible: boolean) {
      pools.visible = visible;
    },
  };
}
