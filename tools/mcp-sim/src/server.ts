// zombie-sim MCP server: MCP wiring only (design "Server (server.ts)", Req 1.1, 1.3–1.5).
// Three Tools over stdio. No network code and no file writes; the only file reads live in sprites.ts.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { z } from 'zod';
import { balanceReport, type ReportInput } from './report';
import { BotRunError, runBot, type BotRunInput } from './runBot';
import {
  balanceReportSchema,
  balanceReportShape,
  simulateRunSchema,
  simulateRunShape,
  validateSpritesSchema,
  validateSpritesShape,
} from './schemas';
import { validateSpriteFiles } from './sprites';

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export type ToolName = 'simulate_run' | 'balance_report' | 'validate_sprites';

const text = (t: string, isError = false): ToolResult =>
  isError ? { content: [{ type: 'text', text: t }], isError: true } : { content: [{ type: 'text', text: t }] };

/** One line per invalid field, e.g. `seed: Too small: expected number to be >=0`. */
export function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(input)'}: ${i.message}`);
  return `Invalid input:\n${lines.join('\n')}`;
}

function errorText(err: unknown): string {
  if (err instanceof BotRunError) return `Run failed (seed ${err.seed}): ${err.message}`;
  const seed = (err as { seed?: unknown } | null)?.seed;
  const message = err instanceof Error ? err.message : String(err);
  return typeof seed === 'number' ? `Run failed (seed ${seed}): ${message}` : `Run failed: ${message}`;
}

const TOOLS = {
  simulate_run: {
    schema: simulateRunSchema,
    call: async (args: unknown) => runBot(args as BotRunInput),
  },
  balance_report: {
    schema: balanceReportSchema,
    call: async (args: unknown) => balanceReport(args as ReportInput),
  },
  validate_sprites: {
    schema: validateSpritesSchema,
    call: async () => validateSpriteFiles(),
  },
} as const;

/**
 * Parse, call, wrap. Never throws: schema failures and Run errors come back as `isError: true`
 * so the server keeps running (Req 1.3, 1.4). Tests call this directly, without stdio.
 */
export async function handleTool(name: ToolName, raw: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return text(`Unknown tool: ${String(name)}`, true);
  const parsed = tool.schema.safeParse(raw ?? {});
  if (!parsed.success) return text(formatIssues(parsed.error), true);
  try {
    const result = await tool.call(parsed.data);
    return text(JSON.stringify(result));
  } catch (err) {
    return text(errorText(err), true);
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'zombie-sim', version: '1.0.0' });
  server.registerTool(
    'simulate_run',
    {
      description: 'Play one headless Run with a bot policy and return its summary.',
      inputSchema: simulateRunShape,
    },
    (args) => handleTool('simulate_run', args),
  );
  server.registerTool(
    'balance_report',
    {
      description: 'Play many seeds per policy and report win rates, medians and Balance_Target checks.',
      inputSchema: balanceReportShape,
    },
    (args) => handleTool('balance_report', args),
  );
  server.registerTool(
    'validate_sprites',
    {
      description: 'Check team sprite frames in assets/sprites against the sprite rules and list missing animations.',
      inputSchema: validateSpritesShape,
    },
    (args) => handleTool('validate_sprites', args),
  );
  return server;
}

export async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

// Start only when run as the entry file (dist/server.mjs), not when a test imports this module.
const argv1 = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1] ?? '';
if (/server\.(mjs|js)$/.test(argv1) && import.meta.url.endsWith(argv1.split(/[\\/]/).pop() ?? '\0')) {
  void main();
}
