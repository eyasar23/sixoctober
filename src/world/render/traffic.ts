import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, ShaderMaterial, Uniform, Vector3, Vector4 } from 'three';
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
  // x, z, radius: cars here shrink away (room for a crime scene).
  uniform vec3 clearZone;
  // x, z, time, radius of the last Titan shockwave.
  uniform vec4 shock;
  varying vec3 vLocal;
  varying vec3 vNormalWorld;
  varying vec3 vColor;
  varying float vType;
  #include <fog_pars_vertex>

  vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    float type = aMotion.w;
    vec3 local = position;
    if (type > 1.5) local *= vec3(1.06, 1.35, 1.25);
    vec2 dir = aLane.zw;
    float s = mod(aMotion.z + trafficTime * aMotion.y * speedScale, aMotion.x);
    // Shrink in and out at the ends of a lane instead of popping.
    local *= smoothstep(0.0, 20.0, s) * smoothstep(0.0, 20.0, aMotion.x - s);

    // Titan shockwave: cars that were close fly off and tumble, vanish, and drive back in later.
    float since = trafficTime - shock.z;
    float tumble = 0.0;
    vec3 thrown = vec3(0.0);
    vec3 axis = vec3(1.0, 0.0, 0.0);
    if (shock.w > 0.0 && since > 0.0 && since < 9.0) {
      float sHit = mod(aMotion.z + shock.z * aMotion.y * speedScale, aMotion.x);
      vec2 atHit = aLane.xy + dir * sHit;
      float k = 1.0 - smoothstep(shock.w * 0.5, shock.w, distance(atHit, shock.xy));
      if (k > 0.0) {
        if (since < 1.6) {
          vec2 away = normalize(atHit - shock.xy + vec2(1e-3, 0.0));
          float flight = clamp(since / 1.3, 0.0, 1.0);
          s = sHit;
          thrown = vec3(away.x, 0.0, away.y) * flight * 10.0 * k + vec3(0.0, sin(flight * 3.14159) * 7.0 * k, 0.0);
          axis = vec3(-away.y, 0.0, away.x);
          tumble = flight * 6.0 * k;
          local *= since < 1.3 ? 1.0 : 1.0 - (since - 1.3) / 0.3;
        } else {
          local *= clamp(since - 8.0, 0.0, 1.0);
        }
      }
    }
    vec2 carXZ = aLane.xy + dir * s;
    if (clearZone.z > 0.0) local *= smoothstep(clearZone.z * 0.65, clearZone.z, distance(carXZ, clearZone.xy));

    float yaw = atan(-dir.x, -dir.y);
    float c = cos(yaw);
    float sn = sin(yaw);
    vec3 rotated = vec3(local.x * c + local.z * sn, local.y, -local.x * sn + local.z * c);
    vec3 normalWorld = vec3(normal.x * c + normal.z * sn, normal.y, -normal.x * sn + normal.z * c);
    if (tumble > 0.0) {
      rotated.y -= 0.8;
      rotated = rotateAxis(rotated, axis, tumble);
      rotated.y += 0.8;
      normalWorld = rotateAxis(normalWorld, axis, tumble);
    }
    vec3 world = vec3(carXZ.x, 0.0, carXZ.y) + rotated + thrown;
    vLocal = position;
    vNormalWorld = normalWorld;
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
export interface Traffic {
  mesh: InstancedMesh;
  /** `dt`: simulated seconds, so slow motion slows the traffic too. */
  update(dt: number): void;
  /** Cars within `radius` of (x, z) shrink away (0 = off). */
  setClearZone(x: number, z: number, radius: number): void;
  /** A shockwave at (x, z): nearby cars are thrown. */
  shock(x: number, z: number, radius: number): void;
}

export function createTraffic(city: CityData, lighting: SceneLighting, tuning: Tuning): Traffic {
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
  const clearZone = new Uniform(new Vector3(0, 0, 0));
  const shock = new Uniform(new Vector4(0, 0, -100, 0));
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    fog: true,
    uniforms: lighting.materialUniforms({
      trafficTime,
      speedScale,
      clearZone,
      shock,
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
    update(dt: number) {
      trafficTime.value += dt;
      speedScale.value = tuning.city.trafficSpeed;
      mesh.visible = tuning.city.traffic;
    },
    setClearZone(x: number, z: number, radius: number) {
      clearZone.value.set(x, z, radius);
    },
    shock(x: number, z: number, radius: number) {
      shock.value.set(x, z, trafficTime.value, radius);
    },
  };
}
