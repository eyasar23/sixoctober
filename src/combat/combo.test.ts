import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { type ComboEvent, ComboTracker, type StrikeKind } from './combo';

const STEP = 1 / 120;
const c = tuning.combat;

/** Runs the tracker for `seconds`, pressing `presses` at the given times. Events get a time stamp. */
function play(seconds: number, presses: Array<[number, StrikeKind]>, timeScale = 1) {
  const combo = new ComboTracker(c);
  combo.timeScale = timeScale;
  const log: Array<ComboEvent & { t: number }> = [];
  const events: ComboEvent[] = [];
  const queue = [...presses];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const t = i * STEP;
    while (queue.length > 0 && queue[0]![0] <= t + 1e-9) combo.press(queue.shift()![1]);
    combo.update(STEP, events);
    for (const e of events) log.push({ ...e, t });
    events.length = 0;
  }
  return log;
}

describe('combo timing', () => {
  it('a single click: wind-up, then the hit at hitAt of the strike', () => {
    const log = play(1, [[0, 'punch']]);
    const start = log.find((e) => e.type === 'start');
    const hit = log.find((e) => e.type === 'hit');
    expect(start && start.type === 'start' && start.step).toBe(1);
    expect(hit!.t - start!.t).toBeCloseTo(c.punchTime * c.hitAt, 1);
    expect(log.filter((e) => e.type === 'start')).toHaveLength(1);
  });

  it('a click during a strike waits for chainAt, then chains into step 2', () => {
    const log = play(1.5, [
      [0, 'punch'],
      [0.05, 'kick'],
    ]);
    const starts = log.filter((e) => e.type === 'start');
    expect(starts.map((e) => (e.type === 'start' ? `${e.kind}${e.step}` : ''))).toEqual(['punch1', 'kick2']);
    expect(starts[1]!.t).toBeCloseTo(c.punchTime * c.chainAt, 1);
  });

  it('three clicks in time make punch–punch–kick finisher, then the chain resets', () => {
    const log = play(2, [
      [0, 'punch'],
      [0.2, 'punch'],
      [0.4, 'kick'],
    ]);
    const steps = log.filter((e) => e.type === 'start').map((e) => (e.type === 'start' ? e.step : 0));
    expect(steps).toEqual([1, 2, 3]);
    const finisher = log.filter((e) => e.type === 'start')[2];
    expect(finisher && finisher.type === 'start' && finisher.duration).toBeCloseTo(c.kickTime + c.finisherExtra, 5);
    expect(log.some((e) => e.type === 'reset')).toBe(true);
  });

  it('a click within the window after a strike continues; a late one starts over', () => {
    const inTime = play(1.5, [
      [0, 'punch'],
      [c.punchTime + c.comboWindow * 0.5, 'punch'],
    ]);
    expect(inTime.filter((e) => e.type === 'start').map((e) => (e.type === 'start' ? e.step : 0))).toEqual([1, 2]);
    const late = play(2, [
      [0, 'punch'],
      [c.punchTime + c.comboWindow + 0.2, 'punch'],
    ]);
    expect(late.filter((e) => e.type === 'start').map((e) => (e.type === 'start' ? e.step : 0))).toEqual([1, 1]);
  });

  it('a fourth click after the finisher starts a new chain at step 1', () => {
    const log = play(3, [
      [0, 'punch'],
      [0.2, 'punch'],
      [0.4, 'punch'],
      [0.6, 'kick'],
    ]);
    expect(log.filter((e) => e.type === 'start').map((e) => (e.type === 'start' ? e.step : 0))).toEqual([1, 2, 3, 1]);
  });

  it('Titan strikes take longer by the heavy time scale', () => {
    const log = play(1, [[0, 'punch']], c.heavyTimeScale);
    const hit = log.find((e) => e.type === 'hit');
    expect(hit!.t).toBeCloseTo(c.punchTime * c.heavyTimeScale * c.hitAt, 1);
  });
});
