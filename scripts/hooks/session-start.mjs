// SessionStart: give the agent a short status brief (stdout is added to context).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SNAPSHOT, readAllChecked, readSnapshot, withLock, writeJson } from './taskInfo.mjs';

// Baseline for the task-done hook, which names a task by diffing checkboxes against it.
withLock(() => {
  if (!readSnapshot()) writeJson(SNAPSHOT, readAllChecked());
});

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();
const lines = ['## Session brief (session-start hook)'];

lines.push(`Branch: ${git('rev-parse', '--abbrev-ref', 'HEAD') || '(no commits yet)'}`);
const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
lines.push(`Uncommitted files: ${dirty}`);

const SPECS = '.kiro/specs';
if (existsSync(SPECS)) {
  for (const name of readdirSync(SPECS).sort()) {
    const tasks = join(SPECS, name, 'tasks.md');
    if (!existsSync(tasks)) {
      lines.push(`Spec ${name}: no tasks.md yet (requirements/design stage)`);
      continue;
    }
    const md = readFileSync(tasks, 'utf8');
    const done = (md.match(/^\s*- \[x\]/gim) ?? []).length;
    const open = (md.match(/^\s*- \[ \]/gm) ?? []).length;
    lines.push(`Spec ${name}: ${done} done, ${open} open`);
  }
}

const deadline = Date.parse('2026-12-04T22:00:00Z'); // 4 Dec 14:00 PT
const days = ((deadline - Date.now()) / 86_400_000).toFixed(1);
lines.push(`Days to Kiroween submission deadline: ${days}`);

process.stdout.write(lines.join('\n') + '\n');
