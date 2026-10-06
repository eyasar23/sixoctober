/**
 * Reference palette measured from the reference video (BRIEF.md §4.1).
 * A starting point for the mood, not a strict spec.
 * tools/blender/test_figure.py keeps its own copy of the colours it uses.
 */
export const palette = {
  skyTop: '#38164B',
  skyMid: '#895079',
  horizon: '#CA9CB5',
  horizonGlow: '#DFC7C4',
  /** Building bodies: night darks and mid tones. */
  buildings: ['#2A0D44', '#401C4F', '#261420', '#563363', '#6E4F8F'],
  groundLavender: '#735A92',
  gridLine: '#8272A9',
  moonlight: '#A78CBB',
  /** Lit windows. Cream is listed more than once so it is picked most often. */
  windows: ['#E9D1A2', '#E9D1A2', '#E9D1A2', '#DFA78A', '#E5C580', '#E5C580', '#DE8ECA', '#65C4E4'],
  neonCyan: '#65C4E4',
  lampAmber: '#E6AB30',
} as const;
