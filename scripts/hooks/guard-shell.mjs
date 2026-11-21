// PreToolUse (shell): block destructive or rule-breaking shell commands.
import { block, readEvent } from './lib.mjs';

const event = await readEvent();
const cmd = String(event.tool_input?.command ?? '');

// Build output folders are safe to wipe.
const SAFE_RM = /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\.\/)?(dist|coverage|node_modules)\/?(\s|$)/;

const RULES = [
  { re: /\brm\s+-[a-z]*(rf|fr)\b/, why: 'Recursive force delete. Ask the user first.', unless: SAFE_RM },
  { re: /\bgit\s+push\b.*(--force\b|\s-f\b|--force-with-lease)/, why: 'Force push. Ask the user first.' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard discards work. Ask the user first.' },
  { re: /\bgit\s+clean\s+-[a-z]*f/, why: 'git clean deletes untracked files. Ask the user first.' },
  { re: /\.kiro\b.*>>?\s*\.gitignore|>>?\s*\.gitignore.*\.kiro\b/, why: '.kiro/ must never be gitignored (hackathon disqualification rule).' },
  { re: /\bgit\s+rm\b.*\.kiro\b/, why: 'Removing .kiro/ from git breaks the hackathon submission.' },
];

for (const { re, why, unless } of RULES) {
  if (re.test(cmd) && !(unless && unless.test(cmd))) block(`Blocked by guard-shell hook: ${why}\nCommand: ${cmd}`);
}
