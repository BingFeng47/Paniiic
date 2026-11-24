import { describe, expect, it } from 'vitest';
import { MOB_KINDS } from '../../../src/game/laneTypes';
import type { SoundRecipe } from '../../../src/core/audio';
import { GROAN_SEC, JUICE_SOUND_SEC, JUICE_SOUNDS, kindGroans, type JuiceSoundId } from '../../../src/render/juice/juiceSounds';
import { createFakeAudioContext } from '../../helpers/audio';

const AT = 2;

function run(recipe: SoundRecipe, d: number) {
  const ac = createFakeAudioContext({ state: 'running', currentTime: AT });
  const stop = recipe(ac.asAudioContext(), ac.asDestination(), AT, d);
  return { ac, stop };
}

describe('juiceSounds', () => {
  const cases: [string, SoundRecipe, number][] = [
    ...(Object.keys(JUICE_SOUNDS) as JuiceSoundId[]).map((id): [string, SoundRecipe, number] => [id, JUICE_SOUNDS[id], JUICE_SOUND_SEC[id]]),
    ...MOB_KINDS.map((k): [string, SoundRecipe, number] => [`groan:${k}`, kindGroans[k], GROAN_SEC[k]]),
  ];

  it.each(cases)('%s builds synthesized sources inside its window and stops twice safely', (_id, recipe, d) => {
    const { ac, stop } = run(recipe, d);
    const sources = ac.sources();
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      for (const t of [...s.startTimes, ...s.stopTimes]) {
        expect(t).toBeGreaterThanOrEqual(AT);
        expect(t).toBeLessThanOrEqual(AT + d + 1e-9);
      }
    }
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
  });

  it('has a groan for every mob kind', () => {
    for (const k of MOB_KINDS) expect(typeof kindGroans[k]).toBe('function');
  });
});
