// Repository file access for the scan tests (tests/copy.test.ts).
//
// The repo has no @types/node, so node:fs is imported dynamically with a minimal local type
// (the same approach as tests/desktop/iconArt.test.ts). Paths are relative to the repository
// root, where Vitest runs, and always use forward slashes.

interface DirEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface NodeFs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
}

export interface RepoFiles {
  /** File contents as UTF-8 text. */
  read(path: string): string;
  /** Every file under `dir`, recursively, e.g. `src/core/h.ts`, sorted. */
  list(dir: string): string[];
}

export async function loadRepoFiles(): Promise<RepoFiles> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  const list = (dir: string): string[] => {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) files.push(...list(path));
      else if (entry.isFile()) files.push(path);
    }
    return files.sort();
  };
  return { read: (path) => fs.readFileSync(path, 'utf8'), list };
}

/** After one of these characters, a `/` starts a regular expression rather than a division. */
const REGEX_AFTER_CHAR = new Set('(,=:[!&|?{};+-*%<>~^');
/** After one of these keywords, a `/` starts a regular expression. */
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'case', 'do', 'else', 'in', 'of', 'void', 'yield', 'await',
  'delete', 'throw', 'new',
]);

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/**
 * Replace every comment with spaces, keeping newlines, so the result has the same length and
 * line numbers as `source`. String, template and regex literals are kept as they are, so a `//`
 * or `/*` inside them is not mistaken for a comment.
 *
 * `'ts'` handles `//` and block comments, quotes, template literals with nested `${}` and regex
 * literals (detected from the previous token, which is enough for this codebase). `'css'`
 * handles only block comments and quoted strings, so `url(http://...)` survives.
 */
export function stripComments(source: string, syntax: 'ts' | 'css' = 'ts'): string {
  const n = source.length;
  let out = '';
  let i = 0;
  /** Last character of code (not whitespace, not comment) that was emitted. */
  let prev = '';
  let braces = 0;
  /** Brace depth at which each open template `${` started, innermost last. */
  const templates: number[] = [];

  /** Copy a quoted string starting at `i` (the quote) through its closing quote. */
  const copyQuoted = (quote: string): void => {
    let j = i + 1;
    while (j < n && source[j] !== quote && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
    j = Math.min(n, j + 1);
    out += source.slice(i, j);
    i = j;
    prev = quote;
  };

  /** Copy template text from `i` up to and including the closing backtick or the next `${`. */
  const copyTemplateBody = (): void => {
    let j = i;
    while (j < n) {
      if (source[j] === '\\') j += 2;
      else if (source[j] === '`') {
        j += 1;
        prev = '`';
        break;
      } else if (source[j] === '$' && source[j + 1] === '{') {
        j += 2;
        templates.push(braces);
        prev = '{';
        break;
      } else j += 1;
    }
    out += source.slice(i, Math.min(n, j));
    i = Math.min(n, j);
  };

  const regexAllowed = (): boolean => {
    if (prev === '' || REGEX_AFTER_CHAR.has(prev)) return true;
    if (!/[A-Za-z_$]/.test(prev)) return false;
    const word = /[A-Za-z_$][\w$]*$/.exec(out.trimEnd())?.[0] ?? '';
    return REGEX_AFTER_WORD.has(word);
  };

  /** Copy a regex literal starting at `i`. Returns false (copies nothing) if it isn't one. */
  const copyRegex = (): boolean => {
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const c = source[j]!;
      if (c === '\n') return false;
      if (c === '\\') j += 2;
      else {
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        j += 1;
      }
    }
    if (j >= n) return false;
    j += 1;
    while (j < n && /[a-z]/i.test(source[j]!)) j += 1;
    out += source.slice(i, j);
    i = j;
    prev = '/';
    return true;
  };

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (syntax === 'ts' && c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'") {
      copyQuoted(c);
    } else if (syntax === 'ts' && c === '`') {
      out += c;
      i += 1;
      copyTemplateBody();
    } else if (syntax === 'ts' && c === '/' && regexAllowed() && copyRegex()) {
      // copied by copyRegex
    } else if (syntax === 'ts' && c === '}' && templates.length > 0 && templates.at(-1) === braces) {
      templates.pop();
      out += c;
      i += 1;
      copyTemplateBody();
    } else {
      if (c === '{') braces += 1;
      else if (c === '}') braces -= 1;
      if (!isSpace(c)) prev = c;
      out += c;
      i += 1;
    }
  }
  return out;
}
