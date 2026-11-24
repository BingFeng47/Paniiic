// Work out which spec task just finished, for the task-done hook.
//
// Kiro does not document the PostTaskExec payload, so the reliable source is the spec's own
// tasks.md: a task that changed from "- [ ]" to "- [x]" since the last snapshot is the one that
// just finished. A task name in the payload is used only as a fallback.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SPECS_DIR = '.kiro/specs';
export const CACHE_DIR = 'node_modules/.cache/kiro-hooks';
export const SNAPSHOT = join(CACHE_DIR, 'task-snapshot.json');
export const LAST_PAYLOAD = join(CACHE_DIR, 'last-post-task-exec.json');
export const LAST_SUITE_RUN = join(CACHE_DIR, 'last-suite-run.json');

const CHECKED = /^\s*- \[x\]\*?\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/i;

/** Map of task id → title for every checked task in a tasks.md file. */
export function checkedTasks(markdown) {
  const out = {};
  for (const line of markdown.split('\n')) {
    const m = CHECKED.exec(line);
    if (m) out[m[1]] = m[2].replace(/`/g, '');
  }
  return out;
}

/** { specName: { taskId: title } } for every spec with a tasks.md. */
export function readAllChecked(root = '.') {
  const dir = join(root, SPECS_DIR);
  const all = {};
  if (!existsSync(dir)) return all;
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name, 'tasks.md');
    if (existsSync(file)) all[name] = checkedTasks(readFileSync(file, 'utf8'));
  }
  return all;
}

/** Tasks checked now but not in the snapshot. Parent tasks are dropped when a child is listed. */
export function newlyChecked(before, now) {
  const found = [];
  for (const [spec, tasks] of Object.entries(now)) {
    const prev = before[spec] ?? {};
    const ids = Object.keys(tasks).filter((id) => !(id in prev));
    for (const id of ids) {
      const isParentOfAnother = ids.some((other) => other !== id && other.startsWith(`${id}.`));
      if (!isParentOfAnother) found.push({ spec, id, title: tasks[id] });
    }
  }
  return found.sort((a, b) => a.spec.localeCompare(b.spec) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Spec folder name from any string in the payload that contains .kiro/specs/<name>. */
export function specFromEvent(event) {
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(event);
  for (const s of strings) {
    const m = /\.kiro[\\/]specs[\\/]([^\\/]+)/.exec(s);
    if (m) return m[1];
  }
  return typeof event?.spec_name === 'string' ? event.spec_name : '';
}

/** Best-effort task label straight from the payload (fallback only). */
export function taskFromEvent(event) {
  const e = event ?? {};
  const t = e.task ?? {};
  const candidates = [
    e.task_title, e.taskTitle, e.task_name, e.taskName, e.task_description, e.taskDescription,
    t.title, t.name, t.description, t.text, e.task_id, e.taskId, t.id,
  ];
  const hit = candidates.find((c) => typeof c === 'string' && c.trim());
  return hit ? hit.trim() : '';
}

/**
 * Whether a finished suite run can stand in for this hook's own run: it must have started at or
 * after this hook did, so the code it tested already included this hook's task.
 */
export function canReuseRun(lastRun, hookStartedAt) {
  return Boolean(lastRun) && Number.isFinite(lastRun.startedAt) && lastRun.startedAt >= hookStartedAt;
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function readSnapshot(root = '.') {
  return readJson(join(root, SNAPSHOT));
}

/** Atomic write so two hooks finishing together never leave half a file. */
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run fn while holding a directory lock shared by all hook processes.
 * If the lock can't be taken within waitMs, fn runs anyway (worst case: duplicate work).
 */
export function withLock(fn, { name = 'task', waitMs = 10_000, staleMs = 30_000 } = {}) {
  const lockDir = join(CACHE_DIR, `${name}.lock`);
  mkdirSync(CACHE_DIR, { recursive: true });
  const start = Date.now();
  let held = false;
  while (!held) {
    try {
      mkdirSync(lockDir);
      held = true;
    } catch {
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > staleMs) rmdirSync(lockDir); // crashed holder
      } catch {
        /* another hook removed it */
      }
      if (Date.now() - start > waitMs) break;
      sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    if (held) {
      try {
        rmdirSync(lockDir);
      } catch {
        /* already gone */
      }
    }
  }
}

export function shorten(text, max = 90) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
