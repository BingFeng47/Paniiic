// Shared helpers for Kiro hook scripts (.kiro/hooks/*.json).
// Kiro passes the hook event as JSON on stdin.

export async function readEvent() {
  if (process.stdin.isTTY) return {};
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Exit code 2 blocks PreToolUse / PreTaskExec; stderr goes back to the agent. */
export function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

/** Pull a file path out of whatever shape the tool input has. */
export function pathFrom(input = {}) {
  return input.path ?? input.file_path ?? input.filePath ?? input.target ?? '';
}

/** Pull the text the tool is about to write, if any. */
export function textFrom(input = {}) {
  return [input.text, input.content, input.newStr, input.new_str].filter((v) => typeof v === 'string').join('\n');
}
