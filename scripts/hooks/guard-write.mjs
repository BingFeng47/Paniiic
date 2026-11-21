// PreToolUse (write): protect hackathon-critical and artist-owned files.
import { block, pathFrom, readEvent, textFrom } from './lib.mjs';

const event = await readEvent();
const input = event.tool_input ?? {};
const path = pathFrom(input).replace(/\\/g, '/');
const text = textFrom(input);

if (/(^|\/)\.gitignore$/.test(path) && /^\s*\/?\.kiro\b/m.test(text)) {
  block('Blocked by guard-write hook: .kiro/ must never be gitignored (hackathon disqualification rule).');
}

// Final SVG frames are drawn by the team. The agent works with placeholders only.
if (/(^|\/)assets\/sprites\//.test(path)) {
  block(
    'Blocked by guard-write hook: assets/sprites/ holds the team\'s final SVG art. ' +
      'Generate placeholders in code (see .kiro/steering/sprites.md) or ask the user.',
  );
}

if (/(^|\/)LICENSE$/.test(path)) {
  block('Blocked by guard-write hook: LICENSE is required by the hackathon. Ask the user before changing it.');
}
