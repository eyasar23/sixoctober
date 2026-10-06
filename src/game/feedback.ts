import { type Camera, Vector3 } from 'three';
import type { Sound } from '../audio/sound';
import type { CombatEvent, CombatSystem } from '../combat/combatSystem';
import type { Enemy } from '../combat/enemy';
import type { EnemyViews } from '../combat/enemyViews';
import type { Tuning } from '../config/tuning';
import type { CrimeEvent } from '../crime/crimeDirector';
import type { CrimeSceneView } from '../crime/crimeScene';
import type { FxPool } from '../fx/fxPool';
import type { LandingDust } from '../fx/heroFx';
import { t, tKey, tList } from '../i18n';
import type { ModeBand } from '../modes/modeBand';
import type { FollowCamera } from '../player/followCamera';
import type { HeroFigure } from '../player/heroFigure';
import type { PlayerSim, SimEvent } from '../player/playerSim';
import type { RopeVisual } from '../player/ropeVisual';
import type { ComicFx } from '../ui/comicFx';
import type { Hud } from '../ui/hud';
import type { Traffic } from '../world/render/traffic';

export interface FeedbackDeps {
  tuning: Tuning;
  sim: PlayerSim;
  modeBand: ModeBand;
  hero: HeroFigure;
  rope: RopeVisual;
  cameraRig: FollowCamera;
  camera: Camera;
  comic: ComicFx;
  hud: Hud;
  sound: Sound;
  fx: FxPool;
  dust: LandingDust;
  traffic: Traffic;
  crimeScene: CrimeSceneView;
  combat: CombatSystem;
  enemyViews: EnemyViews;
}

const HIT_COLOR = '#FFE7B0';
/** Seconds of the quiet beat after landing on a ledge. */
const QUIET_TIME = 2.4;

/**
 * Turns what the game did (movement, fight, crime events) into feedback on at least two
 * channels each (art direction rule 7): effects, sound, camera, comic words, freeze frames and
 * slow-motion beats, including the signature moments (finishing blow, perch shot).
 */
export class Feedback {
  private hitStop = 0;
  /** A short slow-motion beat (counter, knockout): scale and seconds left (real time). */
  private beatScale = 1;
  private beatTime = 0;
  private finalTime = -1;
  private pendingStopped = -1;
  private quietTime = 99;
  private landIndex = 0;
  private readonly words: Record<string, string[]>;
  private readonly at = new Vector3();
  private readonly chest = new Vector3();

  constructor(private readonly d: FeedbackDeps) {
    this.words = {
      punch: tList('comic.punch'),
      kick: tList('comic.kick'),
      finisher: tList('comic.finisher'),
      heavy: tList('comic.heavy'),
      counter: tList('comic.counter'),
      pull: tList('comic.pull'),
      hurt: tList('comic.hurt'),
      ko: tList('comic.ko'),
      bark: tList('gang.bark'),
      fallBark: tList('gang.fallBark'),
    };
  }

  /** The finishing-blow frame is up. */
  get cinematic(): boolean {
    return this.finalTime >= 0;
  }

  /** Simulation speed this frame, given the base (1, or the T slow motion). */
  timeScale(base: number): number {
    let scale = base;
    if (this.beatTime > 0) scale = Math.min(scale, this.beatScale);
    if (this.finalTime >= 0 && this.finalTime < this.d.tuning.crime.finalBlowTime) scale = Math.min(scale, this.d.tuning.crime.finalBlowSlowMo);
    if (this.hitStop > 0) scale = 0.04;
    return scale;
  }

  /** `dt`: real seconds. */
  update(dt: number): void {
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.beatTime = Math.max(0, this.beatTime - dt);
    if (this.finalTime >= 0) {
      this.finalTime += dt;
      if (this.finalTime >= this.d.tuning.crime.finalBlowTime) {
        this.finalTime = -1;
        this.d.comic.setLetterbox(false);
        if (this.pendingStopped >= 0) {
          this.showStopped(this.pendingStopped);
          this.pendingStopped = -1;
        }
      }
    }
    this.quietTime += dt;
    const q = this.quietTime;
    this.d.sound.setQuiet(q < QUIET_TIME ? Math.min(q / 0.2, 1) * Math.min((QUIET_TIME - q) / 0.6, 1) : 0);
  }

  sim(event: SimEvent): void {
    const { tuning, sim, rope, sound, hud, cameraRig, comic, fx, dust, hero, camera, modeBand } = this.d;
    switch (event.type) {
      case 'ropeAttach':
        rope.attach(sim.rope.anchor);
        sound.ropeShot();
        break;
      case 'ropeRelease':
        rope.release();
        sound.ropeRelease();
        if (event.boosted && event.speed > 30 && sim.velocity.y > 2) hero.flip();
        break;
      case 'zipStart':
        rope.attach(sim.zip.attach);
        sound.zip();
        break;
      case 'zipArrive':
        rope.release();
        break;
      case 'noAnchor':
      case 'noLedge':
        hud.showNoAnchor(event.type === 'noLedge');
        sound.noAnchor();
        break;
      case 'land': {
        const weight = event.kind === 'hero' ? 1 : event.kind === 'roll' ? 0.45 : event.kind === 'crouch' ? 0.3 : Math.min(event.impact / 60, 0.15);
        cameraRig.addTrauma(event.kind === 'hero' ? 0.65 : weight * 0.5);
        cameraRig.kickDown(event.kind === 'hero' ? 6 : weight * 4);
        sound.land(weight);
        if ((event.kind === 'hero' || event.kind === 'roll') && tuning.fx.landingDust) dust.burst(sim.position, weight);
        if (event.kind === 'hero') {
          if (tuning.fx.hitStop > 0) this.hitStop = Math.max(this.hitStop, tuning.fx.hitStop);
          if (tuning.fx.comicImpact && sim.state !== 'pound') {
            this.at.copy(sim.position).setY(sim.position.y + 1.2);
            comic.wordAt(tKey(`comic.land.${this.landIndex++ % 3}`), this.at, camera, { strength: 0.75, color: '#FFC23D' });
          }
        }
        break;
      }
      case 'chargeStart':
        sound.chargeStart();
        break;
      case 'superJump':
        fx.spawn('shockwave', sim.position, modeBand.mode.glow, 3 + event.charge * 4, 0.45, 1.4);
        if (tuning.fx.landingDust) dust.burst(sim.position, 0.4 + event.charge * 0.6);
        sound.superJump(event.charge);
        cameraRig.addTrauma(0.1 + 0.25 * event.charge);
        cameraRig.punchFov(4 + 6 * event.charge);
        break;
      case 'poundStart':
        sound.whoosh();
        cameraRig.punchFov(6);
        break;
      case 'shockwave': {
        const size = Math.min(event.radius / tuning.titan.shockRadius, 1);
        this.at.set(event.x, event.y, event.z);
        fx.spawn('shockwave', this.at, modeBand.mode.glow, event.radius, 0.7, 2.2);
        this.d.traffic.shock(event.x, event.z, event.radius * 1.2);
        this.d.crimeScene.shock(event.x, event.z, event.radius * 1.2);
        this.at.y += 1.2;
        fx.spawn('impact', this.at, HIT_COLOR, 2.5 + 3 * size, 0.3, 2);
        if (tuning.fx.landingDust) dust.burst(sim.position, 1);
        sound.shockwave(size);
        cameraRig.addTrauma(0.35 + 0.45 * size);
        if (event.pound) {
          if (tuning.fx.hitStop > 0) this.hitStop = Math.max(this.hitStop, tuning.fx.hitStop * 1.4);
          if (tuning.fx.comicImpact) comic.wordAt(tKey('comic.pound'), this.at, camera, { strength: 1, color: '#FFC23D' });
        }
        break;
      }
      case 'ledgeLaunch':
        sound.zip();
        break;
      case 'perch':
        sound.land(0.15);
        if (tuning.fx.landingDust) dust.burst(sim.position, 0.2);
        this.quietTime = 0;
        if (tuning.camera.perchCinematic) this.perchShot();
        break;
      case 'perchLeap':
        sound.whoosh();
        cameraRig.endShot();
        break;
      case 'diveStart':
      case 'nearMiss':
        sound.whoosh();
        if (event.type === 'nearMiss') cameraRig.addTrauma(0.12);
        break;
      case 'respawn':
        rope.hide();
        hud.showRespawn();
        break;
      default:
        break;
    }
  }

  combat(event: CombatEvent): void {
    const { tuning, sound, cameraRig, comic, fx, camera, rope, enemyViews, hud } = this.d;
    const c = tuning.combat;
    switch (event.type) {
      case 'strike':
        sound.swish();
        break;
      case 'whiff':
        break;
      case 'hit': {
        const s = event.strength;
        fx.spawn('impact', event.at, event.heavy ? '#FFC23D' : HIT_COLOR, 0.7 + s * 1.3, 0.2 + s * 0.08, 1.8);
        sound.hit(s, event.heavy);
        const stop = event.step === 3 || event.ko ? c.finisherHitStop : c.hitStop;
        if (tuning.fx.hitStop > 0) this.hitStop = Math.max(this.hitStop, stop * (0.7 + s * 0.6));
        cameraRig.addTrauma(0.06 + 0.24 * s);
        cameraRig.punchFov(-1.5 - 3 * s);
        if (event.final && tuning.crime.finalBlowCinematic) {
          this.finalBlow(event.enemy);
          break;
        }
        if (tuning.fx.comicImpact) {
          const list = event.kind === 'counter' ? this.words.counter : event.heavy ? this.words.heavy : event.step === 3 ? this.words.finisher : event.kind === 'kick' ? this.words.kick : this.words.punch;
          const color = event.kind === 'counter' ? '#5FE3FF' : undefined;
          comic.wordAt(pick(event.ko ? this.words.ko : list), event.at, camera, color ? { strength: event.ko ? 0.95 : s, color } : { strength: event.ko ? 0.95 : s });
        }
        if (event.ko) sound.ko();
        break;
      }
      case 'warn':
        sound.alert();
        break;
      case 'counter':
        this.beat(0.3, 0.22);
        enemyViews.chest(event.enemy, this.chest);
        fx.spawn('flare', this.chest, '#FFFFFF', 2.2, 0.3, 2);
        sound.counter();
        cameraRig.punchFov(-6);
        break;
      case 'counterMiss':
        break;
      case 'pull':
        enemyViews.chest(event.enemy, this.chest);
        rope.attach(this.chest);
        sound.ropeShot();
        if (tuning.fx.comicImpact) comic.wordAt(pick(this.words.pull), this.chest, camera, { strength: 0.55, color: '#5FE3FF' });
        break;
      case 'playerHurt':
        sound.hurt();
        cameraRig.addTrauma(0.38);
        comic.flash('#FF4A2E', 0.22);
        hud.showHurt();
        if (tuning.fx.comicImpact) {
          this.at.copy(this.d.sim.position).setY(this.d.sim.position.y + 1.7);
          comic.wordAt(pick(this.words.hurt), this.at, camera, { strength: 0.35, color: '#FF5A3C' });
        }
        break;
      case 'playerDown':
        this.beat(0.35, 0.6);
        sound.ko();
        comic.showBanner(t('combat.downTitle'), t('combat.downSub'), c.respawnDelay - 0.4, 'alert');
        break;
      case 'playerBack':
        break;
      case 'enemyDown':
        if (tuning.fx.landingDust) this.d.dust.burst(event.enemy.position, 0.3);
        sound.land(0.35);
        if (Math.random() < 0.3) this.bark(event.enemy, this.words.fallBark);
        break;
      case 'enemyKO':
        break;
    }
  }

  crime(event: CrimeEvent): void {
    const { comic, sound, traffic, sim } = this.d;
    switch (event.type) {
      case 'crimeStart': {
        const distance = Math.round(Math.hypot(sim.position.x - event.site.x, sim.position.z - event.site.z));
        comic.showBanner(t('crime.alertTitle'), t('crime.alertSub', { distance }), 3.2, 'alert');
        sound.alert();
        traffic.setClearZone(event.site.x, event.site.z, 26);
        break;
      }
      case 'crimeEngaged': {
        const boss = this.d.combat.enemies.find((e) => e.role === 'brute' && e.health > 0);
        if (boss) this.bark(boss, this.words.bark);
        break;
      }
      case 'crimeStopped':
        if (this.finalTime >= 0) this.pendingStopped = event.count;
        else this.showStopped(event.count);
        break;
    }
  }

  private showStopped(count: number): void {
    this.d.comic.showBanner(t('crime.stoppedTitle'), t('crime.stoppedSub', { count }), 3, 'win');
    this.d.sound.sting();
  }

  /** Signature moment: the last enemy goes down in slow motion inside a comic panel. */
  private finalBlow(enemy: Enemy): void {
    const { tuning, comic, cameraRig, camera, sim, enemyViews, fx, sound } = this.d;
    const time = tuning.crime.finalBlowTime;
    this.finalTime = 0;
    comic.setLetterbox(true, t('crime.finalCaption'));
    enemyViews.chest(enemy, this.chest);
    fx.spawn('flare', this.chest, '#FFFFFF', 3, 0.4, 2.2);
    comic.wordAt(t('comic.final'), this.chest, camera, { strength: 1, color: '#FF5A3C' });
    sound.ko();
    // Side-on view of the hero and the falling enemy, slightly low and tilted.
    const dx = enemy.position.x - sim.position.x;
    const dz = enemy.position.z - sim.position.z;
    const d = Math.max(Math.hypot(dx, dz), 1e-3);
    const sideX = dz / d;
    const sideZ = -dx / d;
    cameraRig.playShot({ duration: time * 0.85, yaw: Math.atan2(sideX, sideZ), pitch: 0.07, distance: 5.8, height: 1.1, side: -Math.min(d, 3) * 0.45, fov: 52, roll: 0.12, blendIn: 0.18, blendOut: 0.5 });
  }

  private perchShot(): void {
    const { sim, cameraRig } = this.d;
    // The crouched hero in profile on one side of the frame, the street below running off toward
    // the city centre: look along the edge (the way that faces the centre), a bit outward.
    const n = sim.ledge.normal;
    let alongX = n.z;
    let alongZ = -n.x;
    if (alongX * -sim.position.x + alongZ * -sim.position.z < 0) {
      alongX = -alongX;
      alongZ = -alongZ;
    }
    const lookX = alongX * 0.85 + n.x * 0.5;
    const lookZ = alongZ * 0.85 + n.z * 0.5;
    const side = alongX * n.z - alongZ * n.x > 0 ? 0.9 : -0.9;
    cameraRig.playShot({ duration: 1.7, yaw: Math.atan2(-lookX, -lookZ), pitch: 0.16, distance: 3.6, height: 0.9, side, fov: 62, roll: side > 0 ? -0.1 : 0.1, blendIn: 0.6, blendOut: 0.8 });
  }

  private beat(scale: number, seconds: number): void {
    this.beatScale = scale;
    this.beatTime = Math.max(this.beatTime, seconds);
  }

  private bark(enemy: Enemy, lines: string[]): void {
    if (lines.length === 0) return;
    this.d.enemyViews.chest(enemy, this.chest);
    this.chest.y += 0.9;
    this.d.comic.bubbleAt(pick(lines), this.chest, this.d.camera);
  }
}

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? '';
}
