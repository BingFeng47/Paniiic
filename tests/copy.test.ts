// Repository scans for the legal guardrails: invented names only in the copy tables (Req 14.5),
// markup only from our own constant icon SVG (Req 14.4) and no audio files (Req 12.7).
// Source files are read from disk with node:fs (see tests/helpers/repo.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { DESKTOP_COPY } from '../src/desktop/copy';
import { DIALER_COPY, DIAL_STAGES } from '../src/dialup/dialScript';
import { BOOT_SCRIPT } from '../src/scenes/boot/bootScript';
import { SHUTDOWN_COPY } from '../src/scenes/shutdown/shutdownScript';
import { OPTIONS_COPY, TITLE_COPY } from '../src/scenes/title/titleCopy';
import { LANE_COPY } from '../src/ui/laneCopy';
import { RESULT_COPY } from '../src/ui/resultCopy';
import { loadRepoFiles, stripComments, type RepoFiles } from './helpers/repo';

/** Real product, company and brand names that must never appear in game text (design.md). */
const BANNED = [
  'windows', 'microsoft', 'netscape', 'aol', 'america online', 'internet explorer', 'notepad',
  'pentium', 'intel', 'amd', 'phoenix', 'award software', 'american megatrends', 'hayes',
  'us robotics', 'compuserve', 'prodigy', 'energy star',
] as const;

/**
 * Case-insensitive whole-word match. Words inside a multi-word name may be joined by any run of
 * spaces, `-` or `_`. Only letters count as word characters, so "Windows98" and "Pentium-II" are
 * caught while "window" and "Intelligent" are not.
 */
const BANNED_PATTERNS = BANNED.map((term) => {
  const body = term
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_-]+');
  return { term, pattern: new RegExp(`(?<![a-z])${body}(?![a-z])`, 'i') };
});

function bannedNamesIn(text: string): string[] {
  return BANNED_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term);
}

interface FoundString {
  readonly path: string;
  readonly text: string;
}

/** Every string in a nested structure of objects and arrays, with its property path. */
function collectStrings(value: unknown, path: string, out: FoundString[] = []): FoundString[] {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${path}.${key}`, out);
  }
  return out;
}

function bannedHits(strings: readonly FoundString[]): string[] {
  return strings.flatMap(({ path, text }) => bannedNamesIn(text).map((term) => `${path}: "${term}"`));
}

const COPY_TABLES = {
  DESKTOP_COPY,
  BOOT_SCRIPT,
  DIALER_COPY,
  DIAL_STAGES,
  SHUTDOWN_COPY,
  LANE_COPY,
  TITLE_COPY,
  OPTIONS_COPY,
  RESULT_COPY,
} as const;

let repo: RepoFiles;
let srcFiles: string[];
beforeAll(async () => {
  repo = await loadRepoFiles();
  srcFiles = repo.list('src');
});

/** File contents with comments blanked, so prose about a rule does not trip the scan. */
const code = (path: string): string => stripComments(repo.read(path), path.endsWith('.css') ? 'css' : 'ts');

describe('banned-name matcher', () => {
  it('catches real names in any case, spacing and with suffixes', () => {
    expect(bannedNamesIn('Runs on WINDOWS98')).toEqual(['windows']);
    expect(bannedNamesIn('Pentium-II CPU')).toEqual(['pentium']);
    expect(bannedNamesIn('america  online')).toEqual(['america online']);
    expect(bannedNamesIn('US_Robotics modem')).toEqual(['us robotics']);
    expect(bannedNamesIn('an Energy-Star ally')).toEqual(['energy star']);
  });

  it('ignores invented names and ordinary words', () => {
    expect(bannedNamesIn('Phantom 98 window, Jotter, intelligent, NightOwl BIOS, damage')).toEqual([]);
  });
});

describe('copy tables use invented names only (Req 14.5)', () => {
  it('walks nested objects and arrays down to every string', () => {
    const boot = collectStrings(BOOT_SCRIPT, 'BOOT_SCRIPT');
    expect(boot).toContainEqual({ path: 'BOOT_SCRIPT.header[0].text', text: BOOT_SCRIPT.header[0]!.text });
    expect(boot).toContainEqual({ path: 'BOOT_SCRIPT.splash.wordmark', text: 'Phantom 98' });
    const desktop = collectStrings(DESKTOP_COPY, 'DESKTOP_COPY').map((s) => s.text);
    expect(desktop).toContain(DESKTOP_COPY.readme);
    expect(desktop).toContain('Shut Down...');
  });

  it.each(Object.entries(COPY_TABLES))('%s has no real product or company names', (name, table) => {
    const strings = collectStrings(table, name);
    expect(strings.length).toBeGreaterThan(0);
    expect(bannedHits(strings)).toEqual([]);
  });

  it("index.html's title and text have no real product or company names", () => {
    const doc = new DOMParser().parseFromString(repo.read('index.html'), 'text/html');
    expect(doc.title).not.toBe('');
    expect(bannedHits([{ path: 'index.html <title>', text: doc.title }])).toEqual([]);
    expect(bannedHits([{ path: 'index.html <body>', text: doc.body.textContent ?? '' }])).toEqual([]);
  });
});

describe('markup comes only from the constant icon art (Req 14.4)', () => {
  it('uses innerHTML only in src/desktop/iconArt.ts', () => {
    const users = srcFiles.filter((f) => /\binnerHTML\b/.test(code(f)));
    expect(users).toEqual(['src/desktop/iconArt.ts']);
  });

  it('uses no other HTML string sinks anywhere in src/', () => {
    const sink = /\b(outerHTML|insertAdjacentHTML|createContextualFragment)\b|\bdocument\s*\.\s*write(ln)?\s*\(/;
    expect(srcFiles.filter((f) => sink.test(code(f)))).toEqual([]);
  });
});

describe('every sound is synthesized (Req 12.7)', () => {
  const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|mid|midi)\b/i;

  it('src/ contains no audio files', () => {
    expect(srcFiles.filter((f) => AUDIO_EXT.test(f))).toEqual([]);
  });

  it('src/ and index.html reference no audio files', () => {
    const files = [...srcFiles, 'index.html'];
    expect(files.filter((f) => AUDIO_EXT.test(f.endsWith('.html') ? repo.read(f) : code(f)))).toEqual([]);
  });

  it('src/ and index.html use no media elements or decoded audio', () => {
    const media = /\bnew\s+Audio\s*\(|\bHTMLAudioElement\b|\bdecodeAudioData\b|\bcreateMediaElementSource\b|<audio\b/i;
    const files = [...srcFiles, 'index.html'];
    expect(files.filter((f) => media.test(f.endsWith('.html') ? repo.read(f) : code(f)))).toEqual([]);
  });
});
