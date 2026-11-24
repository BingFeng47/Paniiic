// Juice_View End_Transition (juice-and-endings Req 7.2).
import { describe, expect, it } from 'vitest';
import type { SessionContext } from '../../../src/dialup/session';
import type { WindowManager } from '../../../src/desktop/windowManager';
import type { GameState } from '../../../src/game/types';
import { createJuiceView } from '../../../src/render/juice/juiceView';
import { createFakeAudioEngine } from '../../helpers/audio';
import { laneWith } from '../../helpers/lane';

function mount() {
  const screen = document.createElement('div');
  screen.className = 'screen-content';
  const scene = document.createElement('div');
  const overlayHost = document.createElement('div');
  scene.appendChild(overlayHost);
  screen.appendChild(scene);
  document.body.appendChild(screen);
  const ctx: SessionContext = {
    laneHost: document.createElement('div'),
    overlayHost,
    windows: {} as WindowManager,
    audio: createFakeAudioEngine(),
    toScreenPoint: (x, y) => ({ x, y }),
    send: () => {},
  };
  const view = createJuiceView();
  view.mount(ctx);
  const layer = scene.querySelector<HTMLElement>('.juice-layer')!;
  return { view, layer, screen };
}

describe('Juice_View endFrame', () => {
  it('fades the overlays from 1 to 0 over 30 ticks on a win', () => {
    const { view, layer } = mount();
    const won: GameState = { ...laneWith([]), phase: 'won' };
    const seen: number[] = [];
    for (let t = 1; t <= 30; t++) {
      view.endFrame!(won, t);
      seen.push(Number(layer.style.opacity));
    }
    expect(seen[0]).toBeLessThan(1);
    expect(seen[0]).toBeGreaterThan(0.9);
    expect(seen[29]).toBe(0);
    for (let i = 1; i < 30; i++) expect(seen[i]).toBeLessThan(seen[i - 1]!);
    view.unmount();
  });
  it('leaves the overlays alone on a loss', () => {
    const { view, layer } = mount();
    view.endFrame!({ ...laneWith([]), phase: 'lost' }, 15);
    expect(layer.style.opacity).toBe('');
    view.unmount();
  });
});
