import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { type Camera, HalfFloatType, MathUtils, type Scene, Vector2, type WebGLRenderer } from 'three';
import { palette } from '../config/palette';
import type { QualitySettings } from '../config/quality';
import type { Tuning } from '../config/tuning';
import { ColorGradeEffect, SpeedLinesEffect } from './effects';

/**
 * Effect stack (BRIEF.md §4.2): bloom → tone mapping → colour grade, then SMAA, then speed
 * effects (chromatic aberration, comic speed lines, vignette). Convolution effects sit in
 * separate passes, as postprocessing requires.
 */
export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom = new BloomEffect({ mipmapBlur: true, radius: 0.78 });
  private readonly grade = new ColorGradeEffect(palette.skyTop, '#FFE6C8');
  private readonly smaaPass: EffectPass;
  private readonly chromatic = new ChromaticAberrationEffect({ offset: new Vector2(), radialModulation: true, modulationOffset: 0.3 });
  private readonly speedLines = new SpeedLinesEffect();
  private readonly vignette = new VignetteEffect({ offset: 0.3, darkness: 0.3 });
  private chromaticEnabled = true;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    private readonly tuning: Tuning,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new EffectPass(camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), this.grade));
    this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    this.composer.addPass(this.smaaPass);
    this.composer.addPass(new EffectPass(camera, this.chromatic, this.speedLines, this.vignette));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  applyQuality(settings: QualitySettings): void {
    this.smaaPass.enabled = settings.smaa;
    this.chromaticEnabled = settings.chromaticAberration;
  }

  /** `speed` in m/s; `diving` adds extra speed lines. */
  render(dt: number, speed: number, diving: boolean): void {
    const fx = this.tuning.fx;
    const kmh = speed * 3.6;
    this.bloom.intensity = fx.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = fx.bloomThreshold;
    this.bloom.luminanceMaterial.smoothing = fx.bloomSmoothing;
    this.grade.strength = fx.grade;

    const lines = MathUtils.clamp((kmh - fx.speedLinesStart) / (fx.speedLinesFull - fx.speedLinesStart), 0, 1);
    this.speedLines.intensity = Math.min(1, (lines * lines + (diving ? fx.diveSpeedLines : 0)) * fx.speedLinesIntensity);
    const fast = MathUtils.clamp(kmh / 170, 0, 1);
    const aberration = this.chromaticEnabled ? fast * fast * fx.chromaticAberration : 0;
    this.chromatic.offset.set(aberration, aberration * 0.6);
    this.vignette.darkness = fx.vignette + fast * fx.vignetteAtSpeed;

    this.composer.render(dt);
  }
}
