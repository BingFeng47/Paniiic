// PostFileSave (*.ts): type-check the project and run tests related to the saved file.
// Exit 1 with stderr so the agent sees failures and fixes them.
import { spawnSync } from 'node:child_process';
import { pathFrom, readEvent } from './lib.mjs';

const event = await readEvent();
const file = process.argv[2] || pathFrom(event.tool_input) || event.file_path || '';

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });

const failures = [];
const tsc = run('npx', ['tsc', '--noEmit', '--pretty', 'false']);
if (tsc.status !== 0) failures.push(`TypeScript errors:\n${(tsc.stdout + tsc.stderr).trim()}`);

if (file) {
  const tests = run('npx', ['vitest', 'related', '--run', '--passWithNoTests', file]);
  if (tests.status !== 0) failures.push(`Related tests failed for ${file}:\n${(tests.stdout + tests.stderr).trim().slice(-4000)}`);
}

if (failures.length) {
  process.stderr.write(failures.join('\n\n') + '\n');
  process.exit(1);
}
process.stdout.write(`check-on-save: types OK${file ? `, related tests OK (${file})` : ''}\n`);
