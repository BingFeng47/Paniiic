// Repository scan for the workspace skills in `.kiro/skills/` (Req 15.1, 15.2): every skill
// folder holds a SKILL.md whose front matter follows the Kiro rules, and every repository path
// it names in backticks still exists, so the recipe cannot drift from the code unnoticed.
// Files are read from disk with node:fs (see tests/helpers/repo.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRepoFiles, type RepoFiles } from './helpers/repo';

const SKILLS_DIR = '.kiro/skills';
/** Top-level folders whose backticked paths must exist. `assets/` is team-owned and may be empty. */
const CHECKED_ROOTS = ['src', 'tests', 'docs', '.kiro'] as const;
/** Kiro skill names: lowercase letters, digits and hyphens, at most 64 characters. */
const NAME_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_DESCRIPTION = 1024;

/**
 * Parse the YAML front matter at the top of a SKILL.md into its top-level scalar keys.
 * Handles `key: value`, quoted values and `>` / `|` block scalars, which is all a skill uses.
 * Returns `null` when the file does not start with a `---` block.
 */
function frontMatter(text: string): Record<string, string> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return null;
  const fields: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!field) continue;
    let value = field[2]!.trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else if (/^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    fields[field[1]!] = value;
  }
  return fields;
}

/**
 * Every repository path under `CHECKED_ROOTS` written inside inline backticks, outside fenced
 * code blocks. Trailing punctuation and `:line` / `:line:col` suffixes are stripped; globs and
 * `<placeholder>` templates are skipped because they name patterns, not files.
 */
function backtickedPaths(markdown: string): string[] {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, '');
  const roots = CHECKED_ROOTS.map((root) => root.replace('.', '\\.')).join('|');
  const pathPattern = new RegExp(`(?:^|[\\s(])((?:${roots})/[^\\s()'"]*)`, 'g');
  const paths = new Set<string>();
  for (const span of prose.matchAll(/`([^`\n]+)`/g)) {
    for (const found of span[1]!.matchAll(pathPattern)) {
      const path = found[1]!.replace(/(:\d+)+$/, '').replace(/[.,;:!?]+$/, '');
      if (/[*?<>{}[\]]/.test(path)) continue;
      paths.add(path);
    }
  }
  return [...paths].sort();
}

describe('skill scan helpers', () => {
  it('reads plain, quoted and folded front matter values', () => {
    expect(frontMatter('---\nname: a-b\ndescription: "Use it."\n---\nbody')).toEqual({
      name: 'a-b',
      description: 'Use it.',
    });
    expect(frontMatter('---\nname: x\ndescription: >\n  Two\n  lines.\n---\n')).toEqual({
      name: 'x',
      description: 'Two lines.',
    });
    expect(frontMatter('# no front matter')).toBeNull();
  });

  it('extracts backticked paths, trimming punctuation and line suffixes and skipping globs', () => {
    const md = [
      'See `src/game/mobs.ts`, then `tests/game/mobs.test.ts:42` and `docs/roadmap.md.`',
      'Also `.kiro/steering/sprites.md` and `addMob` in `src/game/` (not `assets/sprites/**`).',
      'Skip `src/game/*.ts`, `assets/sprites/<kind>/` and `x/src/y.ts`.',
      '```sh',
      'cat `src/in/fence.ts`',
      '```',
    ].join('\n');
    expect(backtickedPaths(md)).toEqual([
      '.kiro/steering/sprites.md',
      'docs/roadmap.md',
      'src/game/',
      'src/game/mobs.ts',
      'tests/game/mobs.test.ts',
    ]);
  });
});

describe('workspace skills (.kiro/skills)', () => {
  let repo: RepoFiles;
  let files: Set<string>;
  let skills: string[];

  beforeAll(async () => {
    repo = await loadRepoFiles();
    files = new Set(CHECKED_ROOTS.flatMap((root) => repo.list(root)));
    const prefix = `${SKILLS_DIR}/`;
    skills = [
      ...new Set(
        repo.list(SKILLS_DIR).map((path) => path.slice(prefix.length).split('/')[0]!),
      ),
    ].sort();
  });

  /** A file path, or a directory path (with or without a trailing slash) holding files. */
  const exists = (path: string): boolean => {
    const dir = path.replace(/\/$/, '');
    return files.has(dir) || [...files].some((file) => file.startsWith(`${dir}/`));
  };

  it('includes the add-mob skill (Req 15.1)', () => {
    expect(skills).toContain('add-mob');
  });

  it('includes the add-ad skill (Req 15.1)', () => {
    expect(skills).toContain('add-ad');
  });

  it('every skill folder has a SKILL.md', () => {
    const missing = skills.filter((skill) => !files.has(`${SKILLS_DIR}/${skill}/SKILL.md`));
    expect(missing).toEqual([]);
  });

  it('front matter name matches the folder and follows the Kiro naming rules (Req 15.1)', () => {
    for (const skill of skills) {
      const fields = frontMatter(repo.read(`${SKILLS_DIR}/${skill}/SKILL.md`));
      expect(fields, `${skill}: front matter`).not.toBeNull();
      expect(fields!.name, `${skill}: name`).toBe(skill);
      expect(fields!.name, `${skill}: name format`).toMatch(NAME_PATTERN);
    }
  });

  it('front matter has a non-empty description of at most 1024 characters (Req 15.1)', () => {
    for (const skill of skills) {
      const description = frontMatter(repo.read(`${SKILLS_DIR}/${skill}/SKILL.md`))?.description;
      expect(description?.trim(), `${skill}: description`).toBeTruthy();
      expect(description!.length, `${skill}: description length`).toBeLessThanOrEqual(
        MAX_DESCRIPTION,
      );
    }
  });

  it('every backticked src/, tests/, docs/ and .kiro/ path exists (Req 15.2)', () => {
    for (const skill of skills) {
      const paths = backtickedPaths(repo.read(`${SKILLS_DIR}/${skill}/SKILL.md`));
      expect(paths.length, `${skill}: names at least one path`).toBeGreaterThan(0);
      expect(paths.filter((path) => !exists(path)), `${skill}: missing paths`).toEqual([]);
    }
  });

  it('add-mob names the files of the mob recipe (Req 15.2)', () => {
    const paths = backtickedPaths(repo.read(`${SKILLS_DIR}/add-mob/SKILL.md`));
    for (const file of [
      'src/game/laneTypes.ts',
      'src/game/balance/lane.ts',
      'src/game/mobs.ts',
      'src/game/spawner.ts',
      'src/render/sprites/entities.ts',
      'src/render/sprites/placeholder.ts',
      'src/render/laneSounds.ts',
    ]) {
      expect(paths).toContain(file);
    }
  });
});

describe('add-ad skill (.kiro/skills/add-ad)', () => {
  it('names the files of the ad recipe (Req 15.2)', async () => {
    const repo = await loadRepoFiles();
    const paths = backtickedPaths(repo.read(`${SKILLS_DIR}/add-ad/SKILL.md`));
    for (const file of [
      'src/game/ads/adTypes.ts',
      'src/game/ads/closePatterns.ts',
      'src/game/balance/ads.ts',
      'src/game/ads/openAd.ts',
      'src/game/ads/placement.ts',
      'src/render/browser/adDom.ts',
      'src/ui/browserCopy.ts',
      'src/render/browser/browserSounds.ts',
      '.kiro/steering/retro-copy.md',
    ]) {
      expect(paths).toContain(file);
    }
  });
});

describe('add-weapon skill (.kiro/skills/add-weapon)', () => {
  it('has the add-weapon name and a when-to-use description (economy-weapons Req 14.1)', async () => {
    const repo = await loadRepoFiles();
    const fields = frontMatter(repo.read(`${SKILLS_DIR}/add-weapon/SKILL.md`));
    expect(fields?.name).toBe('add-weapon');
    expect(fields?.description).toMatch(/\bUse when\b/);
  });

  it('names the files of the weapon recipe (economy-weapons Req 14.2)', async () => {
    const repo = await loadRepoFiles();
    const paths = backtickedPaths(repo.read(`${SKILLS_DIR}/add-weapon/SKILL.md`));
    for (const file of [
      'src/game/economy/economyTypes.ts',
      'src/game/balance/economy.ts',
      'src/game/economy/shop.ts',
      'src/game/economy/weapons.ts',
      'src/render/sprites/entities.ts',
      'src/render/sprites/placeholder.ts',
      'src/render/laneView.ts',
      'src/ui/economyCopy.ts',
      'src/ui/shopTray.ts',
      'src/render/economySounds.ts',
    ]) {
      expect(paths).toContain(file);
    }
  });
});
