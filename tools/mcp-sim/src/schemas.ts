// zod input and output schemas for the zombie-sim MCP Tools (design "Server (server.ts)", Req 1.3).
// zod ships with @modelcontextprotocol/sdk; no extra package.
import { z } from 'zod';
import { POLICY_NAMES, type PolicyName } from './policies';
import type { PolicyStats, ReportResult, TargetCheck } from './report';
import type { RunSummary } from './runBot';

export const policySchema = z.enum(POLICY_NAMES as unknown as [PolicyName, ...PolicyName[]]);

const seedSchema = z.number().int().min(0);

/** One partial object per balance table. Values are checked by the game's own validation. */
const tableSchema = z.record(z.string(), z.unknown());
export const overridesSchema = z
  .object({
    core: tableSchema.optional(),
    lane: tableSchema.optional(),
    ads: tableSchema.optional(),
    chapters: tableSchema.optional(),
    economy: tableSchema.optional(),
  })
  .strict();

export const simulateRunShape = {
  seed: seedSchema,
  policy: policySchema,
  overrides: overridesSchema.optional(),
  maxSeconds: z.number().int().min(1).max(600).optional(),
};

export const balanceReportShape = {
  seeds: z.number().int().min(1).max(500),
  firstSeed: seedSchema.optional(),
  policies: z.array(policySchema).min(1),
  overrides: overridesSchema.optional(),
  baseline: overridesSchema.optional(),
};

export const validateSpritesShape = {};

export const simulateRunSchema = z.object(simulateRunShape).strict();
export const balanceReportSchema = z.object(balanceReportShape).strict();
export const validateSpritesSchema = z.object(validateSpritesShape).strict();

// Output schemas: the JSON the Tools return in their text content. They document the contract
// for callers such as the balance-tuner agent; the compile-time checks below keep them in step
// with the TypeScript types.

const nullableNumber = z.number().nullable();

export const secondSampleSchema = z.object({
  s: z.number(),
  integrity: z.number(),
  download: z.number(),
  wallet: z.number(),
  earned: z.number(),
});

export const runSummarySchema = z.object({
  seed: z.number(),
  policy: policySchema,
  outcome: z.enum(['won', 'lost', 'timeout']),
  endSeconds: z.number(),
  perSecond: z.array(secondSampleSchema),
  chapterStarts: z.record(z.string(), z.number()),
  purchases: z.array(z.object({ item: z.string(), s: z.number() })),
  adMistakes: z.number(),
  fakeClicks: z.number(),
  criticalInPlotTurn2: z.boolean(),
  bossArrived: z.boolean(),
  earnedAtEnd: z.number(),
});

export const policyStatsSchema = z.object({
  winRate: z.number(),
  medianWinSeconds: nullableNumber,
  medianSawKbSeconds: nullableNumber,
  medianFlameKbSeconds: nullableNumber,
  medianEarnedAtWin: nullableNumber,
  bossArrivedShare: nullableNumber,
  criticalShare: z.number(),
  sawKb: z.number(),
  flameKb: z.number(),
  shopKb: z.number(),
});

export const targetCheckSchema = z.object({
  target: z.string(),
  measured: nullableNumber,
  goal: z.string(),
  result: z.enum(['pass', 'warn']),
});

const policyStatsTableSchema = z.partialRecord(policySchema, policyStatsSchema);

export const reportResultSchema = z.object({
  proposal: policyStatsTableSchema,
  baseline: policyStatsTableSchema.optional(),
  targets: z.array(targetCheckSchema),
  elapsedMs: z.number(),
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Deep<T> = T extends readonly (infer U)[] ? Deep<U>[] : T extends object ? { -readonly [K in keyof T]: Deep<T[K]> } : T;
const schemaMatches = <T extends true>(): T | undefined => undefined;
schemaMatches<Same<Deep<z.infer<typeof runSummarySchema>>, Deep<RunSummary>>>();
schemaMatches<Same<Deep<z.infer<typeof policyStatsSchema>>, Deep<PolicyStats>>>();
schemaMatches<Same<Deep<z.infer<typeof targetCheckSchema>>, Deep<TargetCheck>>>();
schemaMatches<Same<Deep<z.infer<typeof reportResultSchema>>, Deep<ReportResult>>>();
