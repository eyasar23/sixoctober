import type { ModeDefinition } from './modeBand';

/** Kanca (Grapple): fast; rope swings, zips, ledge launches, dives, wall runs. Electric cyan. */
export const grappleMode: ModeDefinition = {
  id: 'grapple',
  nameKey: 'mode.grapple',
  abilities: {
    sprint: true,
    swing: true,
    zip: true,
    dive: true,
    wallRun: true,
    wallClimb: true,
    ledgeLaunch: true,
    chargedJump: false,
    groundPound: false,
  },
  glow: '#3FD6FF',
  accent: '#2A0D44',
  costume: { armor: false, weight: 0 },
  strikes: 'light',
};
