// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadRepoFiles } from '../../helpers/repo';
import { createServer, handleTool } from '../../../tools/mcp-sim/src/server';

const VALID = { seed: 1, policy: 'idle', maxSeconds: 1 } as const;

type Field = 'seed' | 'policy' | 'maxSeconds';
const badValue: Record<Field, fc.Arbitrary<unknown>> = {
  seed: fc.oneof(fc.integer({ max: -1 }), fc.string(), fc.constant(1.5), fc.constant(null)),
  policy: fc.oneof(
    fc.string().filter((s) => !['idle', 'casual', 'competent', 'perfect'].includes(s)),
    fc.integer(),
  ),
  maxSeconds: fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 601 }), fc.string()),
};

const invalidArb = fc
  .subarray<Field>(['seed', 'policy', 'maxSeconds'], { minLength: 1 })
  .chain((fields) =>
    fc.record(Object.fromEntries(fields.map((f) => [f, badValue[f]])) as Record<Field, fc.Arbitrary<unknown>>).map(
      (bad) => ({ fields, input: { ...VALID, ...bad } }),
    ),
  );

describe('handleTool', () => {
  // Feature: zombie-sim-mcp, Property 5: Invalid input is reported, not thrown
  // **Validates: Requirements 1.3, 1.4**
  it('reports every invalid field and keeps serving valid calls', async () => {
    await fc.assert(
      fc.asyncProperty(invalidArb, async ({ fields, input }) => {
        const bad = await handleTool('simulate_run', input);
        expect(bad.isError).toBe(true);
        const msg = bad.content[0]!.text;
        for (const f of fields) expect(msg).toMatch(new RegExp(`^${f}:`, 'm'));
        const ok = await handleTool('simulate_run', VALID);
        expect(ok.isError).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  it('reports non-object input and unknown keys as errors', async () => {
    for (const raw of [42, 'x', [], { ...VALID, extra: 1 }]) {
      const r = await handleTool('simulate_run', raw);
      expect(r.isError).toBe(true);
    }
    expect((await handleTool('validate_sprites', { nope: 1 })).isError).toBe(true);
  });
});

describe('createServer', () => {
  it('lists exactly three Tools over an in-memory transport', async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await server.connect(serverT);
    await client.connect(clientT);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['balance_report', 'simulate_run', 'validate_sprites']);
    await client.close();
    await server.close();
  });
});

// Reads the built bundle (dist/server.mjs plus its chunks). Built by `npm run sim:build`;
// skipped with a message when dist is missing, to keep the test free of an in-test build.
// Paths are relative to the repo root, where Vitest runs.
const DIST = 'tools/mcp-sim/dist';
const repo = await loadRepoFiles();
const bundle = (() => {
  try {
    return repo.list(DIST).filter((f) => f.endsWith('.mjs'));
  } catch {
    return [];
  }
})();
const hasDist = bundle.includes(`${DIST}/server.mjs`);
if (!hasDist) console.warn('[server.test] tools/mcp-sim/dist missing: run `npm run sim:build`; bundle check skipped.');

describe.skipIf(!hasDist)('built bundle', () => {
  it('has no fetch, http or writeFile usage', () => {
    for (const f of bundle) {
      const src = repo.read(f);
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/['"](node:)?https?['"]/);
      expect(src, f).not.toMatch(/\bwriteFile(Sync)?\b/);
    }
  });
});
