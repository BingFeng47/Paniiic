// PostTaskExec: run the full suite, then append a line to docs/kiro-log.md.
// The log is raw material for the "How we used Kiro" submission writeup.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { readEvent } from './lib.mjs';

const event = await readEvent();
const LOG = 'docs/kiro-log.md';

const tsc = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
const tests = spawnSync('npx', ['vitest', 'run', '--reporter=dot'], { encoding: 'utf8' });
const ok = tsc.status === 0 && tests.status === 0;

const task = event.task_title ?? event.task?.title ?? event.task_id ?? event.task?.id ?? 'unknown task';
const spec = event.spec_name ?? event.spec?.name ?? event.spec_path ?? '';
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

if (!existsSync(LOG)) writeFileSync(LOG, '# Kiro development log\n\nAppended automatically by the `task-done` hook.\n\n');
appendFileSync(
  LOG,
  `- ${new Date().toISOString()} | ${branch || 'no-branch'} | ${spec ? `${spec} / ` : ''}${task} | ${ok ? 'checks passed' : 'CHECKS FAILED'}\n`,
);

if (!ok) {
  process.stderr.write(
    `Task finished but checks failed.\n${(tsc.stdout + tsc.stderr).trim()}\n${(tests.stdout + tests.stderr).trim().slice(-4000)}\n`,
  );
  process.exit(1);
}
process.stdout.write('task-done: types and tests pass; logged to docs/kiro-log.md\n');
