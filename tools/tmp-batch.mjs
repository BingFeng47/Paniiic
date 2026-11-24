// Temporary tuning helper (task 5.1); deleted after the tuning pass.
import { readdirSync } from 'node:fs';
const chunk = readdirSync(new URL('./mcp-sim/dist/chunks/', import.meta.url)).find((f) => f.startsWith('report-'));
const m = await import(`./mcp-sim/dist/chunks/${chunk}`);
const balanceReport = m.t;
const T = () => structuredClone(m.a().chapters);
// chapters helper: ch(fn) gives a cloned chapter list with fn(byId) applied
const ch = (fn) => { const c = T(); fn(Object.fromEntries(c.map((x) => [x.id, x]))); return c; };
const sets = eval(`(${process.argv[2]})`);
const policies = (process.argv[3] ?? 'competent').split(',');
const seeds = Number(process.argv[4] ?? 50);
for (const [name, overrides] of Object.entries(sets)) {
  const r = balanceReport({ seeds, firstSeed: 1, policies, overrides });
  const row = (s) => s ? `win ${s.winRate} t ${s.medianWinSeconds?.toFixed(1)} saw ${s.medianSawKbSeconds} flame ${s.medianFlameKbSeconds} earned ${s.medianEarnedAtWin}/${s.shopKb} boss ${s.bossArrivedShare} crit ${s.criticalShare}` : '';
  console.log(name, '|', policies.map((p) => `${p}: ${row(r.proposal[p])}`).join(' || '));
  if (process.env.JSON) console.log(JSON.stringify(overrides));
}
