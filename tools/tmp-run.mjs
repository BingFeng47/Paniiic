// Temporary tuning helper (task 5.1); deleted after the tuning pass.
import { readdirSync } from 'node:fs';
const chunk = readdirSync(new URL('./mcp-sim/dist/chunks/', import.meta.url)).find((f) => f.startsWith('report-'));
const { r: runBot } = await import(`./mcp-sim/dist/chunks/${chunk}`);
const overrides = process.argv[2] ? JSON.parse(process.argv[2]) : undefined;
const s = runBot({ seed: Number(process.argv[4] ?? 1), policy: process.argv[3] ?? 'competent', overrides });
console.log(s.outcome, s.endSeconds, 'bossArrived', s.bossArrived, 'earned', s.earnedAtEnd, 'mistakes', s.adMistakes, 'fakes', s.fakeClicks);
console.log(JSON.stringify(s.chapterStarts), JSON.stringify(s.purchases));
console.log(s.perSecond.filter((x) => Math.round(x.s) % 10 === 0).map((x) => `${x.s}:${x.integrity.toFixed(0)}/${x.download.toFixed(0)}%/${x.earned}`).join(' '));
