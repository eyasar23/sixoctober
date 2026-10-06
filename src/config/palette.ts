/**
 * Palette measured from the reference video (BRIEF.md §4.1), plus a few derived shades.
 * A starting point for the mood, not a strict spec.
 */
export const palette = {
  skyTop: '#38164B',
  skyMid: '#895079',
  horizon: '#CA9CB5',
  horizonGlow: '#DFC7C4',
  /** Building bodies: night darks and mid tones. */
  buildings: ['#2A0D44', '#401C4F', '#261420', '#563363', '#3A2350', '#4A2B5E'],
  /** Lit windows; cream is listed most so it is picked most often. */
  windows: ['#E9D1A2', '#E9D1A2', '#E9D1A2', '#DFA78A', '#E5C580', '#E5C580', '#DE8ECA', '#65C4E4'],
  /** Ground-floor shop bands. */
  shops: ['#E9D1A2', '#DE8ECA', '#65C4E4', '#E6AB30', '#DFA78A'],
  /** Neon signs and billboards. */
  neon: ['#DE8ECA', '#65C4E4', '#E6AB30', '#E9D1A2', '#B58CFF'],
  asphalt: '#3A2E4C',
  sidewalk: '#5C4B6E',
  laneLine: '#E9D1A2',
  groundLavender: '#735A92',
  groundLight: '#A78CBB',
  warmGround: '#BC7D5F',
  lamp: '#E6AB30',
  moonlight: '#A78CBB',
  /** Cars: bodies, taxi, head and tail lights. */
  cars: ['#6E4F8F', '#8272A9', '#401C4F', '#2A0D44', '#A78CBB', '#563363', '#CDA091'],
  taxi: '#E6AB30',
  headLight: '#F7E7C6',
  tailLight: '#E8456F',
  antennaLight: '#DE8ECA',
  roof: '#2E1F3D',
  /** Hero: hoodie, jeans, sneakers, skin, hair (matches the stage 0 Blender figure). */
  hoodie: '#BC7D5F',
  jeans: '#6E4F8F',
  sneakers: '#E9D1A2',
  skin: '#DFA78A',
  hair: '#261420',
  ink: '#140A1C',
  /** Titan costume: charcoal hoodie and trousers, armour plates with amber light lines. */
  titanHoodie: '#4A3D40',
  titanJeans: '#2F2A36',
  armor: '#2B2830',
  armorLight: '#FFA21F',
  /** Crime zone: hot red-orange (the light pillar, warnings, the warm tint near a crime). */
  crime: '#FF4A2E',
  crimeHot: '#FF8A2A',
  neonCyan: '#65C4E4',
  lampAmber: '#E6AB30',
} as const;
