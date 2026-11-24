// @vitest-environment node
// Tests for the task-done hook's task detection. Disk reading is covered by running the hook.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canReuseRun,
  checkedTasks,
  newlyChecked,
  specFromEvent,
  taskFromEvent,
  type AllChecked,
} from '../../../scripts/hooks/taskInfo.mjs';

const TASKS = `# Implementation plan

- [x] 1. Types and balance
  - [x] 1.1 Create \`src/game/types.ts\`
  - [x]* 1.2 Write balance tests
  - [ ] 1.3 Create rng
- [-] 2. Step function
- [ ] 10. Playtester smoke run
- [x] 11. Final checkpoint
`;

describe('checkedTasks', () => {
  it('reads checked tasks, optional (*) tasks and strips backticks', () => {
    expect(checkedTasks(TASKS)).toEqual({
      '1': 'Types and balance',
      '1.1': 'Create src/game/types.ts',
      '1.2': 'Write balance tests',
      '11': 'Final checkpoint',
    });
  });

  it('ignores open and in-progress tasks', () => {
    const ids = Object.keys(checkedTasks(TASKS));
    expect(ids).not.toContain('1.3');
    expect(ids).not.toContain('2');
    expect(ids).not.toContain('10');
  });
});

describe('newlyChecked', () => {
  it('names the task whose box changed', () => {
    const before: AllChecked = { lane: { '1.1': 'a' } };
    const now: AllChecked = { lane: { '1.1': 'a', '1.2': 'b' } };
    expect(newlyChecked(before, now)).toEqual([{ spec: 'lane', id: '1.2', title: 'b' }]);
  });

  it('drops a parent ticked together with its last child', () => {
    const now: AllChecked = { lane: { '2': 'parent', '2.3': 'child' } };
    expect(newlyChecked({ lane: {} }, now)).toEqual([{ spec: 'lane', id: '2.3', title: 'child' }]);
  });

  it('does not treat 1 as the parent of 10', () => {
    const now: AllChecked = { s: { '1': 'one', '10': 'ten' } };
    expect(newlyChecked({ s: {} }, now).map((t) => t.id)).toEqual(['1', '10']);
  });

  it('handles a spec that is new since the snapshot', () => {
    expect(newlyChecked({}, { fresh: { '1.1': 'x' } })).toEqual([{ spec: 'fresh', id: '1.1', title: 'x' }]);
  });

  // Property: only tasks absent from the snapshot are ever reported, and each at most once.
  it('reports only tasks that were not in the snapshot', () => {
    const ids = fc.uniqueArray(fc.stringMatching(/^[1-9](\.[1-9])?$/), { maxLength: 12 });
    fc.assert(
      fc.property(ids, ids, (a, b) => {
        const before: AllChecked = { s: Object.fromEntries(a.map((id) => [id, id])) };
        const now: AllChecked = { s: Object.fromEntries([...a, ...b].map((id) => [id, id])) };
        const found = newlyChecked(before, now).map((t) => t.id);
        expect(found.every((id) => !a.includes(id))).toBe(true);
        expect(new Set(found).size).toBe(found.length);
      }),
    );
  });
});

describe('payload helpers', () => {
  it('finds the spec name anywhere in the payload', () => {
    expect(specFromEvent({ spec_path: '/Users/x/proj/.kiro/specs/connection-lane/tasks.md' })).toBe('connection-lane');
    expect(specFromEvent({ nested: { file: 'C:\\p\\.kiro\\specs\\game-core\\tasks.md' } })).toBe('game-core');
    expect(specFromEvent({})).toBe('');
  });

  it('reads a task label when the payload has one', () => {
    expect(taskFromEvent({ task: { title: ' 2.1 Create mobs ' } })).toBe('2.1 Create mobs');
    expect(taskFromEvent({ cwd: '/x' })).toBe('');
    expect(taskFromEvent(null)).toBe('');
  });
});

describe('canReuseRun (shared suite run for parallel hooks)', () => {
  it('reuses a run that started at or after the hook started', () => {
    expect(canReuseRun({ startedAt: 1000 }, 1000)).toBe(true);
    expect(canReuseRun({ startedAt: 1500 }, 1000)).toBe(true);
  });

  it('reruns when the last run started before the hook, so it may miss the task', () => {
    expect(canReuseRun({ startedAt: 999 }, 1000)).toBe(false);
  });

  it('reruns when there is no usable previous run', () => {
    expect(canReuseRun(null, 1000)).toBe(false);
    expect(canReuseRun({}, 1000)).toBe(false);
    expect(canReuseRun({ startedAt: 'soon' }, 1000)).toBe(false);
  });
});
