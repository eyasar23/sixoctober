import type { Vector3 } from 'three';
import type { CrimeTuning } from '../config/tuning';
import type { CombatSystem } from '../combat/combatSystem';
import type { Enemy } from '../combat/enemy';
import type { CityData, Rect, Road } from '../world/cityGen';

export type CrimePhase = 'none' | 'active' | 'engaged' | 'stopped';

export interface CrimeSite {
  id: number;
  x: number;
  z: number;
  /** Direction the armoured truck points (along the road), radians: atan2(dirX, dirZ). */
  heading: number;
}

export type CrimeEvent =
  | { type: 'crimeStart'; site: CrimeSite }
  | { type: 'crimeEngaged'; site: CrimeSite }
  | { type: 'crimeStopped'; site: CrimeSite; count: number };

/** Gang positions around the truck: x along the road from the truck centre, z across it. */
const GANG_LAYOUT: Array<{ role: 'grunt' | 'brute'; along: number; across: number }> = [
  { role: 'grunt', along: -4.6, across: -0.9 },
  { role: 'grunt', along: -4.9, across: 1.1 },
  { role: 'grunt', along: 4.2, across: 2.6 },
  { role: 'brute', along: -1.5, across: 3.2 },
];

/**
 * The crime loop: a crime starts a few hundred metres from the hero (an armoured truck robbery
 * by four members of the Static), wakes up when the hero arrives, counts as stopped when the
 * whole gang is knocked out, and the next one starts somewhere else after a short breather.
 * Sites are spots along the middle of streets away from crossings and the city edge.
 */
export class CrimeDirector {
  phase: CrimePhase = 'none';
  site: CrimeSite | null = null;
  /** Crimes stopped so far. */
  stopped = 0;
  /** Metres from the hero to the current crime (Infinity without one). */
  distance = Infinity;
  readonly events: CrimeEvent[] = [];
  /** The gang of the current crime. */
  readonly gang: Enemy[] = [];
  /** The last stopped crime: its truck and knocked-out gang stay until the hero is away. */
  previous: { site: CrimeSite; gang: Enemy[]; time: number } | null = null;
  private readonly spots: Array<{ x: number; z: number; heading: number }> = [];
  private timer = 0;
  private nextId = 1;
  private seed: number;

  constructor(
    city: CityData,
    private readonly tuning: CrimeTuning,
    private readonly combat: CombatSystem,
  ) {
    this.seed = city.seed % 2147483647 || 1;
    this.collectSpots(city);
  }

  /** 0..1: how close the crime is (warm colours, neon flicker, alarm). */
  get tension(): number {
    if (!this.site || this.phase === 'stopped' || !this.tuning.tension) return 0;
    return 1 - Math.min(Math.max((this.distance - 35) / 320, 0), 1);
  }

  /** Starts a crime now (first one, tutorial end, debug). */
  begin(hero: Vector3): void {
    const spot = this.pickSpot(hero);
    if (!spot) return;
    this.cleanUpPrevious(true);
    if (this.site && this.gang.length > 0) this.previous = { site: this.site, gang: [...this.gang], time: 0 };
    this.gang.length = 0;
    const site: CrimeSite = { id: this.nextId++, x: spot.x, z: spot.z, heading: spot.heading };
    this.site = site;
    const fx = Math.sin(spot.heading);
    const fz = Math.cos(spot.heading);
    for (const g of GANG_LAYOUT) {
      const x = spot.x + fx * g.along + fz * g.across;
      const z = spot.z + fz * g.along - fx * g.across;
      this.gang.push(this.combat.spawn(g.role, x, 0, z));
    }
    this.phase = 'active';
    this.distance = Math.hypot(hero.x - spot.x, hero.z - spot.z);
    this.events.push({ type: 'crimeStart', site });
  }

  step(dt: number, hero: Vector3): void {
    if (this.previous) {
      this.previous.time += dt;
      const p = this.previous.site;
      if (this.previous.time > 40 || Math.hypot(hero.x - p.x, hero.z - p.z) > 90) this.cleanUpPrevious(true);
    }
    const site = this.site;
    if (!site) return;
    this.distance = Math.hypot(hero.x - site.x, hero.z - site.z);
    switch (this.phase) {
      case 'active':
        if (this.distance < this.tuning.engageDistance || this.gang.some((e) => e.alerted)) {
          for (const e of this.gang) e.alerted = true;
          this.phase = 'engaged';
          this.events.push({ type: 'crimeEngaged', site });
        }
        break;
      case 'engaged':
        if (this.gang.length > 0 && this.gang.every((e) => e.health <= 0)) {
          this.stopped++;
          this.phase = 'stopped';
          this.timer = 0;
          this.events.push({ type: 'crimeStopped', site, count: this.stopped });
        }
        break;
      case 'stopped':
        this.timer += dt;
        if (this.timer >= this.tuning.nextCrimeDelay) this.begin(hero);
        break;
      default:
        break;
    }
  }

  /** Removes the previous crime's gang from the fight (they are out cold anyway). */
  private cleanUpPrevious(force: boolean): void {
    if (!this.previous || !force) return;
    for (const enemy of this.previous.gang) this.combat.remove(enemy);
    this.previous = null;
  }

  private pickSpot(hero: Vector3): { x: number; z: number; heading: number } | null {
    const t = this.tuning;
    const fits = this.spots.filter((s) => {
      const d = Math.hypot(s.x - hero.x, s.z - hero.z);
      return d >= t.minDistance && d <= t.maxDistance;
    });
    const pool = fits.length > 0 ? fits : this.spots;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.random() * pool.length)] ?? null;
  }

  /** Every 24 m along each road's centre line, away from crossings, the spawn tower and the edge. */
  private collectSpots(city: CityData): void {
    const margin = 60;
    const crossings: Rect[] = [];
    for (const a of city.roads) {
      for (const b of city.roads) {
        if (a.axis === b.axis) continue;
        crossings.push({ minX: Math.max(a.minX, b.minX), minZ: Math.max(a.minZ, b.minZ), maxX: Math.min(a.maxX, b.maxX), maxZ: Math.min(a.maxZ, b.maxZ) });
      }
    }
    const nearCrossing = (x: number, z: number) => crossings.some((r) => x > r.minX - 16 && x < r.maxX + 16 && z > r.minZ - 16 && z < r.maxZ + 16);
    for (const road of city.roads) this.addRoadSpots(road, city.halfSize - margin, nearCrossing);
  }

  private addRoadSpots(road: Road, limit: number, nearCrossing: (x: number, z: number) => boolean): void {
    const alongZ = road.axis === 'z';
    const start = alongZ ? road.minZ : road.minX;
    const end = alongZ ? road.maxZ : road.maxX;
    for (let s = start + 12; s < end - 12; s += 24) {
      // Park on one lane, not across the centre line.
      const across = road.center + road.width * 0.18;
      const x = alongZ ? across : s;
      const z = alongZ ? s : across;
      if (Math.abs(x) > limit || Math.abs(z) > limit || nearCrossing(x, z)) continue;
      if (Math.abs(x) < 40 && z > 440) continue; // the spawn tower's block
      this.spots.push({ x, z, heading: alongZ ? 0 : Math.PI / 2 });
    }
  }

  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}
