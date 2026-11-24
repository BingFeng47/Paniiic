// Temporary tuning helper (task 5.1); deleted after the tuning pass.
import { readdirSync } from 'node:fs';
const chunk = readdirSync(new URL('./mcp-sim/dist/chunks/', import.meta.url)).find((f) => f.startsWith('report-'));
const m = await import(`./mcp-sim/dist/chunks/${chunk}`);
const ch = (fn) => { const c = structuredClone(m.a().chapters); fn(Object.fromEntries(c.map((x) => [x.id, x]))); return c; };
const base = eval(`(${process.argv[2]})`).ABC;
for (const v of JSON.parse(process.argv[3])) {
  const o = structuredClone(base);
  Object.assign(o.lane.enemies.boss, v.boss ?? {}); if (v.pct) o.chapters.bossAtPercent = v.pct; if (v.hit) o.lane.melee.boss.hitEverySeconds = v.hit;
  for (const first of [1, 51]) {
    const r = m.t({ seeds: 50, firstSeed: first, policies: ['competent'], overrides: o });
    console.log(JSON.stringify(v), first, r.targets.map((t) => `${t.measured === null ? '-' : +t.measured.toFixed(2)}${t.result === 'pass' ? '' : '✗'}`).join(' '));
  }
}
