import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, Uniform } from 'three';
import { palette } from '../../config/palette';
import type { Tuning } from '../../config/tuning';
import { type Building, parapets } from '../cityGen';
import { GLSL_COMMON, type SceneLighting } from './lighting';

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute vec4 aParams;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocal;
  // Per-instance values must not be interpolated: tiny rounding differences would flicker the windows.
  flat varying vec3 vSize;
  flat varying vec3 vColor;
  flat varying vec4 vParams;
  #include <fog_pars_vertex>
  void main() {
    vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vNormal = normal; // boxes are axis-aligned and never rotated
    vLocal = position * size;
    vSize = size;
    vColor = aColor;
    vParams = aParams;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  ${GLSL_COMMON}
  uniform float windowGlow;
  uniform float blinkShare;
  uniform vec3 windowColors[8];
  uniform vec3 shopColors[5];
  uniform vec3 glassColor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocal;
  flat varying vec3 vSize;
  flat varying vec3 vColor;
  flat varying vec4 vParams; // seed, lit share, window style, shops
  #include <fog_pars_fragment>

  void main() {
    vec3 n = normalize(vNormal);
    // Upper floors catch more of the glowing sky; the street level sits in shadow.
    float heightLight = mix(0.5, 1.2, smoothstep(0.0, 170.0, vWorldPos.y));
    vec3 color = vColor * heightLight * ambientLight(n);
    vec3 emissive = vec3(0.0);

    if (abs(n.y) < 0.5) {
      bool xFace = abs(n.x) > 0.5;
      float faceWidth = xFace ? vSize.z : vSize.x;
      float u = (xFace ? vLocal.z : vLocal.x) + faceWidth * 0.5;
      int faceSeed = int(vParams.x * 64.0) + (xFace ? (n.x > 0.0 ? 1 : 2) : (n.z > 0.0 ? 3 : 4)) * 7919;
      float style = vParams.z;
      float colWidth = style < 0.5 ? 3.2 : (style < 1.5 ? 2.4 : 4.4);
      float floorHeight = style < 0.5 ? 3.6 : (style < 1.5 ? 3.3 : 4.0);
      float cols = max(floor((faceWidth - 1.2) / colWidth), 1.0);
      float margin = (faceWidth - cols * colWidth) * 0.5;
      vec2 cellPos = vec2((u - margin) / colWidth, vWorldPos.y / floorHeight);
      vec2 cell = floor(cellPos);
      vec2 f = fract(cellPos);
      float tierTop = vWorldPos.y - vLocal.y + vSize.y;
      float inside = step(0.0, cellPos.x) * step(cellPos.x, cols) * step(4.8, vWorldPos.y) * step(vWorldPos.y, tierTop - 1.4);

      // Anti-aliased window rectangle; far away the grid fades into its average (no shimmering).
      vec2 fw = fwidth(cellPos);
      float wx = smoothstep(0.16 - fw.x, 0.16 + fw.x, f.x) * (1.0 - smoothstep(0.84 - fw.x, 0.84 + fw.x, f.x));
      float wy = smoothstep(0.24 - fw.y, 0.24 + fw.y, f.y) * (1.0 - smoothstep(0.86 - fw.y, 0.86 + fw.y, f.y));
      float far = smoothstep(0.3, 0.75, max(fw.x, fw.y));
      float mask = wx * wy * inside * (1.0 - far);

      ivec2 icell = ivec2(cell);
      float r1 = hashInt(ivec3(icell, faceSeed));
      float r2 = hashInt(ivec3(icell.yx, faceSeed + 101));
      float lit = step(r1, vParams.y);
      // A few windows blink (screens, signs).
      float blinker = step(r2, blinkShare);
      float blinkOn = step(0.5, fract(time * (0.15 + r1 * 0.7) + r2 * 9.0));
      lit = mix(lit, blinkOn, blinker);
      // Colour temperature varies per window, a little brightness variety too.
      vec3 tint = windowColors[int(r2 * 8.0) % 8] * (0.7 + 0.6 * hashInt(ivec3(icell, faceSeed + 211)));

      vec3 glass = mix(color * 0.5, glassColor, 0.35);
      color = mix(color, glass, mask);
      emissive += tint * windowGlow * lit * mask;
      emissive += windowColors[0] * windowGlow * vParams.y * 0.36 * far * inside;

      // Ground floor shop band.
      if (vParams.w > 0.5 && vWorldPos.y < 4.4) {
        float segment = floor(u / 7.0);
        float rs = hashInt(ivec3(int(segment), faceSeed, 7));
        float frame = smoothstep(0.04, 0.09, fract(u / 7.0)) * (1.0 - smoothstep(0.91, 0.96, fract(u / 7.0)));
        float band = smoothstep(0.7, 1.0, vWorldPos.y) * (1.0 - smoothstep(3.4, 3.7, vWorldPos.y));
        vec3 shop = shopColors[int(rs * 5.0) % 5];
        emissive += shop * step(0.22, rs) * band * frame * 1.5;
        // A thin bright line under the sign board.
        emissive += shop * step(0.22, rs) * (smoothstep(3.75, 3.85, vWorldPos.y) - smoothstep(3.9, 4.0, vWorldPos.y)) * 2.0;
      }
    } else if (n.y > 0.5) {
      // Roof membrane: seams every 3 m, lighter toward the parapet.
      vec2 seams = abs(fract(vWorldPos.xz / 3.0) - 0.5);
      float seam = smoothstep(0.46, 0.5, max(seams.x, seams.y));
      vec2 edge = vSize.xz * 0.5 - abs(vLocal.xz);
      float rim = 1.0 - smoothstep(0.2, 2.5, min(edge.x, edge.y));
      color *= (0.82 + rim * 0.35) * (1.0 - seam * 0.14) * (0.94 + 0.12 * hash12(floor(vWorldPos.xz / 3.0)));
    }

    gl_FragColor = vec4(color + emissive, 1.0);
    #include <fog_fragment>
  }
`;

/** All building boxes (and tiers) as one instanced mesh: one draw call for the whole skyline. */
export function createBuildings(buildings: Building[], lighting: SceneLighting, tuning: Tuning): { mesh: InstancedMesh; update(): void } {
  const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Buildings first, then the low parapet walls around every roof (same shader, no windows on them).
  const boxes: Array<{ x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; b: Building }> = [];
  for (const b of buildings) {
    boxes.push({ x0: b.x - b.width / 2, y0: b.baseY, z0: b.z - b.depth / 2, x1: b.x + b.width / 2, y1: b.topY, z1: b.z + b.depth / 2, b });
  }
  for (const b of buildings) {
    for (const [x0, y0, z0, x1, y1, z1] of parapets(b)) boxes.push({ x0, y0, z0, x1, y1, z1, b });
  }
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    fog: true,
    uniforms: lighting.materialUniforms({
      windowGlow: new Uniform(tuning.fx.windowGlow),
      blinkShare: new Uniform(tuning.city.windowBlink),
      windowColors: new Uniform(palette.windows.map((c) => new Color(c))),
      shopColors: new Uniform(palette.shops.map((c) => new Color(c))),
      glassColor: new Uniform(new Color(palette.skyMid).multiplyScalar(0.35)),
    }),
  });
  const mesh = new InstancedMesh(geometry, material, boxes.length);
  const colors = new Float32Array(boxes.length * 3);
  const params = new Float32Array(boxes.length * 4);
  const matrix = new Matrix4();
  const color = new Color();
  boxes.forEach(({ x0, y0, z0, x1, y1, z1, b }, i) => {
    matrix.makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, y0, (z0 + z1) / 2);
    mesh.setMatrixAt(i, matrix);
    color.set(palette.buildings[b.colorIndex] ?? palette.buildings[0]).toArray(colors, i * 3);
    params.set([b.seed, b.litShare, b.style, b.shops && y0 === 0 ? 1 : 0], i * 4);
  });
  geometry.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('aParams', new InstancedBufferAttribute(params, 4));
  // One mesh spans the whole city: culling it as a unit would never skip anything.
  mesh.frustumCulled = false;
  return {
    mesh,
    update() {
      material.uniforms.windowGlow!.value = tuning.fx.windowGlow;
      material.uniforms.blinkShare!.value = tuning.city.windowBlink;
    },
  };
}
