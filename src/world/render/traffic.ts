import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, ShaderMaterial, Uniform } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';
import { createRng } from '../../core/random';
import type { CityData } from '../cityGen';
import { GLSL_COMMON, type SceneLighting } from './lighting';

const vertexShader = /* glsl */ `
  attribute vec4 aLane;   // start x, start z, direction x, direction z
  attribute vec4 aMotion; // lane length, speed (m/s), offset (m), type (0 sedan, 1 taxi, 2 van)
  attribute vec3 aColor;
  uniform float speedScale;
  uniform float trafficTime;
  varying vec3 vLocal;
  varying vec3 vNormalWorld;
  varying vec3 vColor;
  varying float vType;
  #include <fog_pars_vertex>
  void main() {
    float type = aMotion.w;
    vec3 local = position;
    if (type > 1.5) local *= vec3(1.06, 1.35, 1.25);
    float s = mod(aMotion.z + trafficTime * aMotion.y * speedScale, aMotion.x);
    // Shrink in and out at the ends of a lane instead of popping.
    local *= smoothstep(0.0, 20.0, s) * smoothstep(0.0, 20.0, aMotion.x - s);
    vec2 dir = aLane.zw;
    float yaw = atan(-dir.x, -dir.y);
    float c = cos(yaw);
    float sn = sin(yaw);
    vec3 rotated = vec3(local.x * c + local.z * sn, local.y, -local.x * sn + local.z * c);
    vec3 world = vec3(aLane.x + dir.x * s, 0.0, aLane.y + dir.y * s) + rotated;
    vLocal = position;
    vNormalWorld = vec3(normal.x * c + normal.z * sn, normal.y, -normal.x * sn + normal.z * c);
    vColor = aColor;
    vType = type;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  ${GLSL_COMMON}
  uniform vec3 headColor;
  uniform vec3 tailColor;
  uniform vec3 taxiColor;
  uniform vec3 glassColor;
  varying vec3 vLocal;
  varying vec3 vNormalWorld;
  varying vec3 vColor;
  varying float vType;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vNormalWorld);
    bool cabin = vLocal.y > 1.0;
    vec3 base = cabin ? glassColor : vColor;
    vec3 color = base * ambientLight(n) * 1.4;
    vec3 emissive = vec3(0.0);
    float band = step(0.5, vLocal.y) * step(vLocal.y, 0.85) * step(0.45, abs(vLocal.x));
    if (vLocal.z < -2.1) emissive += headColor * band * 2.6;
    if (vLocal.z > 2.1) emissive += tailColor * band * 2.4;
    if (vType > 0.5 && vType < 1.5 && vLocal.y > 1.5) emissive += taxiColor * 1.4;
    gl_FragColor = vec4(color + emissive, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * Cars flowing along the lanes, animated entirely on the GPU (no per-frame CPU work).
 * No collisions or AI: they are there for life and light.
 */
export function createTraffic(city: CityData, lighting: SceneLighting, tuning: Tuning): { mesh: InstancedMesh; update(dt: number): void } {
  const geometry = mergeGeometries([
    new BoxGeometry(1.8, 0.75, 4.3).translate(0, 0.62, 0),
    new BoxGeometry(1.55, 0.55, 2.1).translate(0, 1.27, 0.25),
  ]);
  const rng = createRng(city.seed + 99);
  const cars: Array<{ lane: number[]; motion: number[]; color: Color }> = [];
  for (const lane of city.lanes) {
    const dx = lane.x1 - lane.x0;
    const dz = lane.z1 - lane.z0;
    const length = Math.hypot(dx, dz);
    for (let k = 0; k < lane.cars; k++) {
      const type = rng.chance(0.15) ? 1 : rng.chance(0.1) ? 2 : 0;
      const color = new Color(type === 1 ? palette.taxi : (palette.cars[rng.index(palette.cars.length)] ?? palette.cars[0]));
      cars.push({
        lane: [lane.x0, lane.z0, dx / length, dz / length],
        motion: [length, (lane.speed / 3.6) * rng.range(0.9, 1.1), ((k + rng.range(0, 0.6)) * length) / lane.cars, type],
        color,
      });
    }
  }
  const count = Math.max(cars.length, 1);
  const lanes = new Float32Array(count * 4);
  const motion = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  cars.forEach((car, i) => {
    lanes.set(car.lane, i * 4);
    motion.set(car.motion, i * 4);
    car.color.toArray(colors, i * 3);
  });
  geometry.setAttribute('aLane', new InstancedBufferAttribute(lanes, 4));
  geometry.setAttribute('aMotion', new InstancedBufferAttribute(motion, 4));
  geometry.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));

  const trafficTime = new Uniform(0);
  const speedScale = new Uniform(tuning.city.trafficSpeed);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    fog: true,
    uniforms: lighting.materialUniforms({
      trafficTime,
      speedScale,
      headColor: new Uniform(new Color(palette.headLight)),
      tailColor: new Uniform(new Color(palette.tailLight)),
      taxiColor: new Uniform(new Color(palette.taxi)),
      glassColor: new Uniform(new Color(palette.skyTop).multiplyScalar(0.6)),
    }),
  });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.count = cars.length;
  mesh.frustumCulled = false;
  return {
    mesh,
    /** `dt`: simulated seconds, so slow motion slows the traffic too. */
    update(dt: number) {
      trafficTime.value += dt;
      speedScale.value = tuning.city.trafficSpeed;
      mesh.visible = tuning.city.traffic;
    },
  };
}
