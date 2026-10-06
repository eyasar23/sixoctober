import { Group } from 'three';
import type { Tuning } from '../config/tuning';
import { BlobShadow } from '../fx/heroFx';
import type { CollisionWorld } from '../world/collision';
import type { Enemy } from './enemy';
import { EnemyFigure } from './enemyFigure';

/** Keeps one figure and shadow per enemy in the fight, created and removed as the gang changes. */
export class EnemyViews {
  readonly group = new Group();
  private readonly views = new Map<Enemy, { figure: EnemyFigure; shadow: BlobShadow }>();

  constructor(
    private readonly tuning: Tuning,
    private readonly world: CollisionWorld,
  ) {}

  /** `dt`: simulated seconds. */
  update(dt: number, enemies: readonly Enemy[]): void {
    for (const enemy of enemies) {
      if (this.views.has(enemy)) continue;
      const figure = new EnemyFigure(enemy, this.tuning);
      const shadow = new BlobShadow();
      this.group.add(figure.root, shadow.mesh);
      this.views.set(enemy, { figure, shadow });
    }
    for (const [enemy, view] of this.views) {
      if (enemies.includes(enemy)) continue;
      this.group.remove(view.figure.root, view.shadow.mesh);
      view.figure.dispose();
      this.views.delete(enemy);
    }
    for (const [enemy, view] of this.views) {
      view.figure.update(dt);
      const p = enemy.position;
      view.shadow.update(p, this.world.supportHeight(p.x, p.z, 0.3, 0.3, p.y + 0.05));
    }
  }

  /** World position of an enemy's chest (rope pulls, markers). */
  chest(enemy: Enemy, out: { x: number; y: number; z: number }): void {
    const scale = enemy.role === 'brute' ? 1.18 : 1;
    out.x = enemy.position.x;
    out.y = enemy.position.y + 1.3 * scale;
    out.z = enemy.position.z;
  }
}
