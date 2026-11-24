import { describe, expect, it } from 'vitest';
import { LANE_COPY } from '../../src/ui/laneCopy';

describe('LANE_COPY.cctv.combo (pacing-and-economy Req 5.5)', () => {
  it('reads "COMBO xN +K KB"', () => {
    expect(LANE_COPY.cctv.combo(3, 1)).toBe('COMBO x3 +1 KB');
    expect(LANE_COPY.cctv.combo(12, 0)).toBe('COMBO x12 +0 KB');
  });
});
