import {
  BackSide,
  Bone,
  type BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Uniform,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Most colour slots a figure may use (shader array size). */
const MAX_SLOTS = 16;

interface Part {
  geometry: BufferGeometry;
  bone: number;
  slot: number;
  outline: boolean;
}

/**
 * Builds a code-made character from primitives: each part is rigidly attached to a bone, and all
 * parts are merged into one skinned mesh (one draw call) plus one inverted-hull outline mesh
 * that shares the skeleton. Colours live in "slots" (uniform arrays), so a costume can change
 * colour, and glowing parts (wristband, armour lights, mask eyes) are just slots with glow.
 */
export class FigureBuilder {
  private readonly bones: Bone[] = [];
  private readonly boneByName = new Map<string, Bone>();
  private readonly parts: Part[] = [];
  private readonly slots: Array<{ color: Color; emissive: number; glow: Color }> = [];

  /** A joint at (x, y, z) relative to its parent (null = the figure's root). */
  bone(name: string, parent: string | null, x: number, y: number, z: number): Bone {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    if (parent) this.boneByName.get(parent)?.add(bone);
    this.bones.push(bone);
    this.boneByName.set(name, bone);
    return bone;
  }

  /** A colour slot: diffuse colour, share of it that glows by itself, and extra HDR glow. */
  slot(color: string, emissive = 0.16, glow?: Color): number {
    if (this.slots.length >= MAX_SLOTS) throw new Error('Too many colour slots');
    this.slots.push({ color: new Color(color), emissive, glow: glow ?? new Color(0, 0, 0) });
    return this.slots.length - 1;
  }

  /** A part in the bone's local space. */
  part(bone: string, geometry: BufferGeometry, slot: number, outline = true): void {
    const index = this.bones.findIndex((b) => b.name === bone);
    if (index < 0) throw new Error(`Unknown bone ${bone}`);
    this.parts.push({ geometry, bone: index, slot, outline });
  }

  build(outlineColor: string, outlineWidth: number): Figure {
    const root = new Group();
    const rootBones = this.bones.filter((b) => !b.parent);
    for (const b of rootBones) root.add(b);
    root.updateMatrixWorld(true);

    const bodyParts: BufferGeometry[] = [];
    const outlineParts: BufferGeometry[] = [];
    const matrix = new Matrix4();
    for (const part of this.parts) {
      matrix.copy(this.bones[part.bone]!.matrixWorld);
      bodyParts.push(prepare(part.geometry.clone(), matrix, part.bone, part.slot));
      if (part.outline) outlineParts.push(prepare(smoothNormals(part.geometry), matrix, part.bone, part.slot));
    }
    const skeleton = new Skeleton(this.bones);

    const colors = new Uniform(Array.from({ length: MAX_SLOTS }, (_, i) => this.slots[i]?.color.clone() ?? new Color()));
    const emissive = new Uniform(Array.from({ length: MAX_SLOTS }, (_, i) => this.slots[i]?.emissive ?? 0));
    const glows = new Uniform(Array.from({ length: MAX_SLOTS }, (_, i) => this.slots[i]?.glow.clone() ?? new Color()));
    const material = new MeshLambertMaterial();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.slotColor = colors;
      shader.uniforms.slotEmissive = emissive;
      shader.uniforms.slotGlow = glows;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aSlot;\nvarying float vSlot;\nvoid main() {\n  vSlot = aSlot;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 slotColor[${MAX_SLOTS}];\nuniform float slotEmissive[${MAX_SLOTS}];\nuniform vec3 slotGlow[${MAX_SLOTS}];\nvarying float vSlot;\nvoid main() {\n  int slotIndex = int(vSlot + 0.5);`,
        )
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( slotColor[slotIndex], opacity );')
        .replace(
          'vec3 totalEmissiveRadiance = emissive;',
          'vec3 totalEmissiveRadiance = slotColor[slotIndex] * slotEmissive[slotIndex] + slotGlow[slotIndex];',
        );
    };
    const width = new Uniform(outlineWidth);
    const outlineMaterial = new MeshBasicMaterial({ color: outlineColor, side: BackSide });
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.outlineWidth = width;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normal * outlineWidth;');
    };

    const mesh = new SkinnedMesh(mergeGeometries(bodyParts), material);
    const outline = new SkinnedMesh(mergeGeometries(outlineParts), outlineMaterial);
    for (const m of [mesh, outline]) {
      m.frustumCulled = false;
      m.bind(skeleton);
      root.add(m);
    }
    return new Figure(root, this.boneByName, mesh, outline, colors, glows, width);
  }
}

export class Figure {
  constructor(
    readonly root: Group,
    private readonly boneByName: Map<string, Bone>,
    readonly mesh: SkinnedMesh,
    readonly outline: SkinnedMesh,
    /** Per-slot colours: edit `.value[slot]` to recolour a costume. */
    readonly colors: Uniform<Color[]>,
    readonly glows: Uniform<Color[]>,
    private readonly outlineWidth: Uniform<number>,
  ) {}

  bone(name: string): Bone {
    const bone = this.boneByName.get(name);
    if (!bone) throw new Error(`Unknown bone ${name}`);
    return bone;
  }

  setOutline(visible: boolean, width: number): void {
    this.outline.visible = visible;
    this.outlineWidth.value = width;
  }
}

/** Bakes a part into the figure's bind pose and tags it with its bone and colour slot. */
function prepare(geometry: BufferGeometry, matrix: Matrix4, bone: number, slot: number): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  g.applyMatrix4(matrix);
  const count = g.getAttribute('position').count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const slots = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = bone;
    skinWeight[i * 4] = 1;
    slots[i] = slot;
  }
  g.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
  g.setAttribute('aSlot', new Float32BufferAttribute(slots, 1));
  return g;
}

/** Copy with welded vertices and averaged normals, so an inflated outline shell has no gaps. */
function smoothNormals(geometry: BufferGeometry): BufferGeometry {
  const copy = geometry.clone();
  copy.deleteAttribute('normal');
  copy.deleteAttribute('uv');
  const welded = mergeVertices(copy, 1e-4);
  welded.computeVertexNormals();
  return welded;
}
