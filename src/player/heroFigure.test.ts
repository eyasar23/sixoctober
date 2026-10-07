import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HeroFigure, type HeroFrame } from './heroFigure';
import { makeTuning } from './simTestUtils';

/** Head minus hips in the figure's own frame (it faces −Z), after holding a state for 2 s. */
function headOffset(state: HeroFrame['state'], extra: Partial<HeroFrame> = {}): Vector3 {
  const figure = new HeroFigure(makeTuning());
  const frame: HeroFrame = {
    state,
    stateTime: 0,
    position: new Vector3(),
    yaw: 0,
    velocity: new Vector3(),
    sprinting: false,
    landingKind: 'soft',
    ropeTarget: null,
    ropeSide: 1,
    wallNormal: new Vector3(0, 0, 1),
    action: { kind: 'punch', step: 1, duration: 0.3 },
    charge: 0,
    ...extra,
  };
  for (let i = 0; i < 120; i++) {
    frame.stateTime += 1 / 60;
    figure.update(1 / 60, frame);
  }
  figure.root.updateMatrixWorld(true);
  const head = figure.figure.bone('neck').getWorldPosition(new Vector3());
  const hips = figure.figure.bone('pelvis').getWorldPosition(new Vector3());
  return head.sub(hips);
}

describe('hero poses lean the way they are written', () => {
  it('stands upright when idle', () => {
    expect(Math.abs(headOffset('grounded').z)).toBeLessThan(0.08);
  });

  it('a sprint and the ledge crouch lean forward: head ahead of the hips', () => {
    expect(headOffset('grounded', { velocity: new Vector3(0, 0, -9), sprinting: true }).z).toBeLessThan(-0.05);
    expect(headOffset('perch').z).toBeLessThan(-0.1);
  });

  it('knocked out: flat on the back', () => {
    const offset = headOffset('down');
    expect(offset.z).toBeGreaterThan(0.3);
    expect(offset.y).toBeLessThan(0.3);
  });
});
