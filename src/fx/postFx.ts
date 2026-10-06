import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import * as THREE from 'three';
import { tuning } from '../config/tuning';

/** Effect stack (BRIEF.md §4.2). Stage 0 has bloom only; the rest arrives with quality presets. */
export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom = new BloomEffect({ mipmapBlur: true });

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer, {
      // Half-float keeps colours above 1 so lit windows can bloom.
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(4, renderer.capabilities.maxSamples),
    });
    this.composer.addPass(new RenderPass(scene, camera));
    // Neutral tone mapping leaves palette colours almost untouched and only rolls off highlights.
    this.composer.addPass(
      new EffectPass(camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })),
    );
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    const fx = tuning.fx;
    this.bloom.intensity = fx.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = fx.bloomThreshold;
    this.bloom.luminanceMaterial.smoothing = fx.bloomSmoothing;
    this.composer.render(dt);
  }
}
