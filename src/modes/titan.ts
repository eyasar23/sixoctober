import type { ModeDefinition } from './modeBand';

/**
 * Titan: slow but unstoppable. No rope; charged super jump, ground pound with a shockwave,
 * slow wall climb, heavy area strikes. Amber over charcoal, armour plates on the hoodie.
 */
export const titanMode: ModeDefinition = {
  id: 'titan',
  nameKey: 'mode.titan',
  abilities: {
    sprint: true,
    swing: false,
    zip: false,
    dive: false,
    wallRun: false,
    wallClimb: true,
    ledgeLaunch: false,
    chargedJump: true,
    groundPound: true,
  },
  glow: '#FFA21F',
  accent: '#2B2830',
  costume: { armor: true, weight: 1 },
  movement: (tuning) => tuning.titan.movement,
  strikes: 'heavy',
};
