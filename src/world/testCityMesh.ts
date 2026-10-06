import * as THREE from 'three';
import { palette } from '../config/palette';
import { tuning } from '../config/tuning';
import type { TestCity } from './testCity';

/** Building footprint for simple push-out collisions. */
export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

const WINDOW_WIDTH = 1.4;
const WINDOW_HEIGHT = 1.8;
const UP = new THREE.Vector3(0, 1, 0);

/** Turns city data into two instanced meshes: one draw call for buildings, one for windows. */
export function createTestCityMesh(city: TestCity) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  // Unit box with its base at y = 0, scaled per building.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(boxGeometry, new THREE.MeshLambertMaterial(), city.buildings.length);
  const colliders: BoxCollider[] = [];
  city.buildings.forEach((b, i) => {
    matrix.compose(position.set(b.x, 0, b.z), rotation.identity(), scale.set(b.width, b.height, b.depth));
    buildings.setMatrixAt(i, matrix);
    buildings.setColorAt(i, color.set(palette.buildings[b.colorIndex]));
    colliders.push({
      minX: b.x - b.width / 2,
      maxX: b.x + b.width / 2,
      minZ: b.z - b.depth / 2,
      maxZ: b.z + b.depth / 2,
      height: b.height,
    });
  });
  buildings.computeBoundingSphere();

  // Unlit, so windows glow whatever the lighting; colours above 1 feed the bloom.
  const windowMaterial = new THREE.MeshBasicMaterial();
  const windows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(WINDOW_WIDTH, WINDOW_HEIGHT),
    windowMaterial,
    city.windows.length,
  );
  city.windows.forEach((w, i) => {
    rotation.setFromAxisAngle(UP, w.rotationY);
    matrix.compose(position.set(w.x, w.y, w.z), rotation, scale.set(1, 1, 1));
    windows.setMatrixAt(i, matrix);
    windows.setColorAt(i, color.set(palette.windows[w.colorIndex]));
  });
  windows.computeBoundingSphere();

  const object = new THREE.Group();
  object.add(buildings, windows);

  return {
    object,
    colliders,
    /** Applies live tuning values. */
    update(): void {
      windowMaterial.color.setScalar(tuning.fx.windowGlow);
    },
  };
}
