/**
 * ModeBand: the hero's hexagonal wristband (BRIEF.md §1). It holds the active mode, and the
 * mode decides which movement abilities are on. Stage 1A always runs in Grapple mode;
 * switching (Tab / 1–2) and Titan's own moves arrive in stage 1B.
 */

export type ModeId = 'grapple' | 'titan';

export interface MovementAbilities {
  sprint: boolean;
  swing: boolean;
  zip: boolean;
  dive: boolean;
  wallRun: boolean;
  wallClimb: boolean;
}

export interface ModeDefinition {
  id: ModeId;
  abilities: MovementAbilities;
  /** Band glow and accent colours (BRIEF.md §1 and §4.1). */
  glow: string;
  accent: string;
}

export const MODES: Record<ModeId, ModeDefinition> = {
  grapple: {
    id: 'grapple',
    abilities: { sprint: true, swing: true, zip: true, dive: true, wallRun: true, wallClimb: true },
    glow: '#3FD6FF',
    accent: '#2A0D44',
  },
  // Placeholder for stage 1B: slow but strong, no rope.
  titan: {
    id: 'titan',
    abilities: { sprint: true, swing: false, zip: false, dive: true, wallRun: false, wallClimb: false },
    glow: '#FFA21F',
    accent: '#2B2830',
  },
};

export class ModeBand {
  private current: ModeDefinition;
  private readonly listeners: Array<(mode: ModeDefinition) => void> = [];

  constructor(initial: ModeId = 'grapple') {
    this.current = MODES[initial];
  }

  get mode(): ModeDefinition {
    return this.current;
  }

  get abilities(): MovementAbilities {
    return this.current.abilities;
  }

  setMode(id: ModeId): void {
    if (this.current.id === id) return;
    this.current = MODES[id];
    for (const listener of this.listeners) listener(this.current);
  }

  onChange(listener: (mode: ModeDefinition) => void): void {
    this.listeners.push(listener);
  }
}
