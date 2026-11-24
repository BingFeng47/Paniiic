// PostTaskExec: run the full suite, then append one line per finished task to docs/kiro-log.md.
// The log is raw material for the "How we used Kiro" submission writeup.
//
// "Run all" finishes several tasks at once, and each fires this hook. Running a 30-second suite
// once per hook in parallel overloads the machine and makes property tests time out, so hooks
// share one suite run: a run that started after this hook started already covers its task.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { readEvent } from './lib.mjs';
import {
  LAST_PAYLOAD,
  LAST_SUITE_RUN,
  SNAPSHOT,
  canReuseRun,
  newlyChecked,
  readAllChecked,
  readJson,
  readSnapshot,
  shorten,
  sleep,
  specFromEvent,
  taskFromEvent,
  withLock,
  writeJson,
} from './taskInfo.mjs';

const startedAt = Date.now();
const event = await readEvent();
const LOG = 'docs/kiro-log.md';
const WAVE_SETTLE_MS = 1500; // let the other hooks of the same wave arrive before testing
const TEST_TIMEOUT_MS = 30_000; // per test; property tests are CPU-bound and slow under load

// Keep the latest raw payload (gitignored) so the real field names can be checked later.
writeJson(LAST_PAYLOAD, { receivedAt: new Date(startedAt).toISOString(), event });

// 1. Claim the tasks whose checkbox changed since the last snapshot.
const claimed = withLock(() => {
  const now = readAllChecked();
  const before = readSnapshot();
  writeJson(SNAPSHOT, now);
  return before ? newlyChecked(before, now) : [];
});

// 2. Run the checks, or reuse a run that started after this hook did.
function runChecks() {
  const tsc = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
  const tests = spawnSync('npx', ['vitest', 'run', '--reporter=dot', `--testTimeout=${TEST_TIMEOUT_MS}`], {
    encoding: 'utf8',
  });
  const ok = tsc.status === 0 && tests.status === 0;
  const output = ok ? '' : `${(tsc.stdout + tsc.stderr).trim()}\n${(tests.stdout + tests.stderr).trim()}`.slice(-4000);
  return { ok, output };
}

const result = withLock(
  () => {
    const last = readJson(LAST_SUITE_RUN);
    if (canReuseRun(last, startedAt)) return { ...last, reused: true };
    sleep(WAVE_SETTLE_MS);
    const runStartedAt = Date.now();
    const run = runChecks();
    writeJson(LAST_SUITE_RUN, { startedAt: runStartedAt, ...run });
    return { ...run, reused: false };
  },
  { name: 'suite', waitMs: 150_000, staleMs: 180_000 },
);

// 3. Log. One line per claimed task; a payload task name is the fallback. A hook that claims
// nothing (its box was already logged by a parallel hook) adds no line.
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || 'no-branch';
const status = result.ok ? 'checks passed' : 'CHECKS FAILED';
const eventSpec = specFromEvent(event);
const eventTask = taskFromEvent(event);
const labels = claimed.length
  ? claimed.map((t) => `${t.spec} ${t.id} ${shorten(t.title)}`)
  : eventTask
    ? [`${eventSpec ? `${eventSpec} ` : ''}${shorten(eventTask)}`]
    : [];

if (labels.length) {
  if (!existsSync(LOG)) writeFileSync(LOG, '# Kiro development log\n\nAppended automatically by the `task-done` hook.\n\n');
  const stamp = new Date().toISOString();
  appendFileSync(LOG, labels.map((l) => `- ${stamp} | ${branch} | ${l} | ${status}\n`).join(''));
}

const what = labels.length ? `logged ${labels.length} task(s)` : 'no new task to log';
if (!result.ok) {
  process.stderr.write(`Task finished but checks failed (${what}).\n${result.output}\n`);
  process.exit(1);
}
process.stdout.write(`task-done: types and tests pass${result.reused ? ' (shared run)' : ''}; ${what}\n`);
