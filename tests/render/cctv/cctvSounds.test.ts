import { describe, expect, it } from 'vitest';
import { CCTV_SOUND_SEC, CCTV_SOUNDS, type CctvSoundId } from '../../../src/render/cctv/cctvSounds';
import { CCTV_TUNING } from '../../../src/render/cctv/cctvTuning';
import { createFakeAudioContext, type FakeGainNode } from '../../helpers/audio';

const AT = 2;
const IDS = Object.keys(CCTV_SOUNDS) as CctvSoundId[];

function play(id: CctvSoundId, d: number = CCTV_SOUND_SEC[id]) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = CCTV_SOUNDS[id](ac.asAudioContext(), ac.asDestination(), AT, d);
  return { ac, stop };
}

describe('CCTV_SOUNDS', () => {
  it('lasts 600 s for the hum and 250 ms for the static', () => {
    expect(CCTV_SOUND_SEC).toEqual({ cameraHum: 600, cameraStatic: 0.25 });
  });

  it('builds the hum from 60 and 120 Hz sines plus band-passed noise', () => {
    const { ac } = play('cameraHum');
    expect(ac.oscillators.map((o) => [o.type, o.frequency.valuesSet()[0]])).toEqual([
      ['sine', 60],
      ['sine', 120],
    ]);
    expect(ac.filters.map((f) => f.type)).toEqual(['bandpass']);
    expect(ac.bufferSources).toHaveLength(1);
  });

  it('builds the static from band-passed noise only', () => {
    const { ac } = play('cameraStatic');
    expect(ac.oscillators).toEqual([]);
    expect(ac.filters.map((f) => f.type)).toEqual(['bandpass']);
    expect(ac.bufferSources).toHaveLength(1);
  });

  it.each<[CctvSoundId, number]>([
    ['cameraHum', CCTV_TUNING.humLevel],
    ['cameraStatic', CCTV_TUNING.staticLevel],
  ])('%s peaks at its tuning level and fades 0 → 0 inside its window', (id, level) => {
    const d = CCTV_SOUND_SEC[id];
    const { ac } = play(id);
    const outs = ac.gains.filter((g) => g.outputs.includes(ac.destination));
    expect(outs).toHaveLength(1);
    const out = outs[0] as FakeGainNode;
    expect(Math.max(...out.gain.valuesSet())).toBe(level);
    const timed = out.gain.events.filter((e) => 'time' in e);
    expect(timed[0]).toMatchObject({ value: 0, time: AT });
    expect((timed[timed.length - 1] as { time: number }).time).toBeCloseTo(AT + d, 9);
    for (const s of ac.sources()) expect(s.stopTimes[0]).toBeLessThanOrEqual(AT + d + 1e-9);
  });

  it.each(IDS)('%s stops every node and survives a double stop', (id) => {
    const { ac, stop } = play(id);
    stop();
    stop();
    expect(ac.unstopped()).toEqual([]);
    expect(ac.destination.inputs).toEqual([]);
  });
});
