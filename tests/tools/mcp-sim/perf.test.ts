import { describe, expect, it } from 'vitest';
import { balanceReport } from '../../../tools/mcp-sim/src/report';

// Req 4.5: a 50-seed report over three policies must finish within 60 seconds.
describe('balanceReport performance', () => {
  it(
    'runs 50 seeds x idle, casual, competent in under 60 s',
    () => {
      const start = performance.now();
      const result = balanceReport({ seeds: 50, policies: ['idle', 'casual', 'competent'] });
      const elapsed = performance.now() - start;
      console.log(`balanceReport 50x3: ${(elapsed / 1000).toFixed(1)} s`);
      expect(result.proposal.idle).toBeDefined();
      expect(result.proposal.casual).toBeDefined();
      expect(result.proposal.competent).toBeDefined();
      expect(elapsed).toBeLessThan(60_000);
    },
    120_000,
  );
});
