import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { tuning } from './config/tuning';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { PostFx } from './fx/postFx';
import { FollowCamera } from './player/followCamera';
import { Player } from './player/player';
import { createDebugPanel } from './ui/debugPanel';
import { Overlay } from './ui/overlay';
import { createFog, createGround, createLights, createSky } from './world/atmosphere';
import { generateTestCity } from './world/testCity';
import { createTestCityMesh } from './world/testCityMesh';
import './style.css';

/** Where the Blender test figure stands: just to the right of the capsule's spawn point. */
const TEST_FIGURE_POSITION = new THREE.Vector3(2, 0, 0);

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app element is missing');

// postprocessing renders into its own buffers, so the canvas needs no depth or antialiasing.
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, tuning.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
app.append(renderer.domElement);

const scene = new THREE.Scene();
const fog = createFog();
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(tuning.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2000);

const sky = createSky();
scene.add(sky, createGround(renderer.capabilities.getMaxAnisotropy()), ...createLights());

const city = createTestCityMesh(generateTestCity(tuning.city.seed));
scene.add(city.object);

const player = new Player();
scene.add(player.object);
loadTestFigure(scene);

const input = new Input(renderer.domElement);
const followCamera = new FollowCamera(camera);
const postFx = new PostFx(renderer, scene, camera);
const overlay = new Overlay(app);
createDebugPanel();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  postFx.setSize(window.innerWidth, window.innerHeight);
});

startLoop((dt) => {
  followCamera.look(input);
  player.update(dt, input, followCamera.yaw, city.colliders);
  followCamera.follow(player.position);
  sky.position.copy(camera.position);
  fog.density = tuning.fx.fogDensity;
  city.update();
  postFx.render(dt);
  overlay.update(player.velocity.length(), input.pointerLocked);
  input.endFrame();
});

/** Low-poly figure made by tools/blender/test_figure.py. The scene still runs if it is missing. */
function loadTestFigure(target: THREE.Scene): void {
  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}assets/test/test_figure.glb`,
    (gltf) => {
      gltf.scene.position.copy(TEST_FIGURE_POSITION);
      target.add(gltf.scene);
    },
    undefined,
    (error) => console.warn('Test figure could not be loaded:', error),
  );
}
