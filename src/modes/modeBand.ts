import type { MovementTuning, Tuning } from '../config/tuning';

/**
 * ModeBand: the hero's hexagonal wristband (BRIEF.md §1). It holds the active mode; the mode
 * decides which moves are on, how the hero moves and fights and how the costume looks.
 *
 * Modes are plugins: each one is a ModeDefinition in its own file (grapple.ts, titan.ts),
 * listed once in modes/index.ts. A third or fourth mode is a new file plus one line there;
 * Tab cycles through the list and the number keys pick a slot.
 */

export type ModeId = string;

/** Moves a mode allows. The movement simulation checks these, never the mode's name. */
export interface MovementAbilities {
  sprint: boolean;
  /** Shift in the air: rope swing. */
  swing: boolean;
  /** Space in the air: zip to the crosshair. */
  zip: boolean;
  /** C in the air: dive. */
  dive: boolean;
  wallRun: boolean;
  wallClimb: boolean;
  /** E: rope launch onto the ledge under the crosshair (and the rope pull on enemies). */
  ledgeLaunch: boolean;
  /** Space held then released on the ground: charged super jump. */
  chargedJump: boolean;
  /** C in the air: ground pound with a shockwave. */
  groundPound: boolean;
}

export interface Costume {
  /** Armour plates over the hoodie. */
  armor: boolean;
  /** 0 light … 1 heavy: wider, lower stance, heavier stride. */
  weight: number;
  hoodie: string;
  jeans: string;
}

export interface ModeDefinition {
  id: ModeId;
  /** i18n key of the mode name (HUD, transformation panel). */
  nameKey: string;
  abilities: MovementAbilities;
  /** Band glow: the most saturated colour on screen while the mode is on. Accent: its dark partner. */
  glow: string;
  accent: string;
  costume: Costume;
  /** Movement values this mode replaces; read from tuning each step so F1 edits apply live. */
  movement?: (tuning: Tuning) => Partial<MovementTuning>;
  /** Strike profile: light (fast combos, rope pull) or heavy (slow, hits an area). */
  strikes: 'light' | 'heavy';
}

export class ModeBand {
  private index = 0;
  private readonly listeners: Array<(mode: ModeDefinition, previous: ModeDefinition) => void> = [];

  constructor(private readonly modes: readonly ModeDefinition[]) {
    if (modes.length === 0) throw new Error('ModeBand needs at least one mode');
  }

  get mode(): ModeDefinition {
    return this.modes[this.index]!;
  }

  get abilities(): MovementAbilities {
    return this.mode.abilities;
  }

  get count(): number {
    return this.modes.length;
  }

  /** Tab: the next mode in the list. */
  next(): void {
    this.select((this.index + 1) % this.modes.length);
  }

  /** Number keys: slot 0 = key 1. Unknown slots are ignored. */
  select(slot: number): void {
    if (slot < 0 || slot >= this.modes.length || slot === this.index) return;
    const previous = this.mode;
    this.index = slot;
    for (const listener of this.listeners) listener(this.mode, previous);
  }

  setMode(id: ModeId): void {
    const slot = this.modes.findIndex((m) => m.id === id);
    if (slot >= 0) this.select(slot);
  }

  onChange(listener: (mode: ModeDefinition, previous: ModeDefinition) => void): void {
    this.listeners.push(listener);
  }
}
