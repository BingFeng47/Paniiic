// Temporary tuning helper (task 5.1); deleted after the tuning pass.
import { readdirSync } from 'node:fs';
const chunk = readdirSync(new URL('./mcp-sim/dist/chunks/', import.meta.url)).find((f) => f.startsWith('report-'));
const m = await import(`./mcp-sim/dist/chunks/${chunk}`);
const ch = (fn) => { const c = structuredClone(m.a().chapters); fn(Object.fromEntries(c.map((x) => [x.id, x]))); return c; };
const sets = eval(`(${process.argv[2]})`);
const v = (x) => (x === null || x === undefined ? '–' : String(x));
for (const [name, overrides] of Object.entries(sets)) {
  const r = m.t({ seeds: 50, firstSeed: 1, policies: ['idle', 'casual', 'competent', 'perfect'], overrides });
  console.log(`### ${name}\n`);
  console.log('| Policy | Win rate | Median win (s) | Median saw KB (s) | Median saw + flame KB (s) | Median KB earned at win | Boss arrived share | Critical share |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [p, s] of Object.entries(r.proposal)) console.log(`| ${p} | ${v(s.winRate)} | ${v(s.medianWinSeconds)} | ${v(s.medianSawKbSeconds)} | ${v(s.medianFlameKbSeconds)} | ${v(s.medianEarnedAtWin)} | ${v(s.bossArrivedShare)} | ${v(s.criticalShare)} |`);
  const c = r.proposal.competent;
  console.log(`\nKB thresholds: saw ${c.sawKb}, saw + flamethrower ${c.flameKb}, shop ${c.shopKb}\n`);
  console.log('| Target | Goal | Measured | Result |\n|---|---|---|---|');
  for (const t of r.targets) console.log(`| ${t.target} | ${t.goal} | ${v(t.measured)} | ${t.result} |`);
  console.log('');
}
