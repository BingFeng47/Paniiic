// Temporary tuning helper (task 5.1); deleted after the tuning pass.
import { readdirSync } from 'node:fs';
const chunk = readdirSync(new URL('./mcp-sim/dist/chunks/', import.meta.url)).find((f) => f.startsWith('report-'));
const { t: balanceReport } = await import(`./mcp-sim/dist/chunks/${chunk}`);
const overrides = process.argv[2] ? JSON.parse(process.argv[2]) : undefined;
const policies = (process.argv[3] ?? 'casual,competent,perfect').split(',');
const r = balanceReport({ seeds: 50, firstSeed: 1, policies, overrides });
for (const [p, s] of Object.entries(r.proposal)) console.log(p, JSON.stringify(s));
for (const t of r.targets) console.log(`${t.target} | ${t.goal} | ${t.measured} | ${t.result}`);
console.log('ms', Math.round(r.elapsedMs));
