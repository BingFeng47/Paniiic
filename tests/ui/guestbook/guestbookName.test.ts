// Guestbook name: normalizeName and the stored last name (leaderboard Req 5.2, 5.8, Property 4).
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLeaderboardClient } from '../../../src/core/leaderboard';
import {
  GUESTBOOK_STORAGE_KEY,
  loadName,
  normalizeName,
  saveName,
} from '../../../src/ui/guestbook/guestbookName';
import { loadRepoFiles } from '../../helpers/repo';
import { FAKE_STORAGE_MODES, createFakeStorage } from '../../helpers/storage';

// The `name` check from docs/leaderboard.sql, read from the file so the test follows the SQL.
let SQL_NAME_PATTERN: string | undefined;
beforeAll(async () => {
  const sql = (await loadRepoFiles()).read('docs/leaderboard.sql');
  SQL_NAME_PATTERN = /check \(name ~ '([^']+)' and name = btrim\(name\)\)/.exec(sql)?.[1];
});

/** Postgres `name ~ pattern and name = btrim(name)` (btrim strips spaces only). */
function passesDatabaseCheck(name: string): boolean {
  return new RegExp(SQL_NAME_PATTERN!).test(name) && name === name.replace(/^ +| +$/g, '');
}

/** True when the real client accepts the name and sends the insert. */
async function clientAccepts(name: string): Promise<boolean> {
  let sent = false;
  const fetchFn = (async () => {
    sent = true;
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const client = createLeaderboardClient({ url: 'https://example.test', key: 'sb_publishable_x' }, fetchFn);
  const result = await client.submit({ name, score: 100, outcome: 'won', seconds: 180, download: 100, kills: 10 });
  return sent && result.ok;
}

// Names built mostly from the allowed alphabet plus spaces, tabs and a few disallowed characters.
const nameChar = fc.constantFrom(...'aZ09 _-  \t.!é'.split(''));
const rawName = fc.oneof(fc.string({ maxLength: 20 }), fc.array(nameChar, { maxLength: 20 }).map((cs) => cs.join('')));

describe('normalizeName', () => {
  it('trims, collapses inner spaces and checks the length and alphabet', () => {
    expect(normalizeName('  Bing  ')).toBe('Bing');
    expect(normalizeName('Calvin   the  Great')).toBe(null); // 16 characters after collapsing
    expect(normalizeName('Mr   Bones')).toBe('Mr Bones');
    expect(normalizeName('ab')).toBe(null);
    expect(normalizeName('abc')).toBe('abc');
    expect(normalizeName('123456789012')).toBe('123456789012');
    expect(normalizeName('1234567890123')).toBe(null);
    expect(normalizeName('zom_bie-98')).toBe('zom_bie-98');
    expect(normalizeName('<b>hi</b>')).toBe(null);
    expect(normalizeName('tab\tname')).toBe(null);
    expect(normalizeName('')).toBe(null);
  });

  it('found the name check in docs/leaderboard.sql', () => {
    expect(SQL_NAME_PATTERN).toBe('^[A-Za-z0-9 _-]{3,12}$');
  });
});

describe('Property 4: name normalization', () => {
  // Property: Req 5.2 normalizeName is idempotent
  /** **Validates: Requirements 5.2** */
  it('is idempotent', () => {
    fc.assert(
      fc.property(rawName, (raw) => {
        const once = normalizeName(raw);
        if (once !== null) expect(normalizeName(once)).toBe(once);
      }),
    );
  });

  // Property: Req 5.2 every normalized name passes the database check and the client
  /** **Validates: Requirements 5.2** */
  it('every non-null result passes the database check and the client validation', async () => {
    await fc.assert(
      fc.asyncProperty(rawName, async (raw) => {
        const name = normalizeName(raw);
        if (name === null) return;
        expect(passesDatabaseCheck(name)).toBe(true);
        expect(/ {2}/.test(name)).toBe(false);
        expect(await clientAccepts(name)).toBe(true);
      }),
    );
  });

  // Property: Req 5.8 a saved name loads back unchanged
  /** **Validates: Requirements 5.8** */
  it('round-trips a saved name through storage', () => {
    fc.assert(
      fc.property(rawName, (raw) => {
        const fake = createFakeStorage({ mode: 'ok', key: GUESTBOOK_STORAGE_KEY });
        const name = normalizeName(raw);
        expect(saveName(fake.getter, raw)).toBe(name !== null);
        expect(loadName(fake.getter)).toBe(name);
        if (name !== null) {
          expect(JSON.parse(fake.stored(GUESTBOOK_STORAGE_KEY)!)).toEqual({ v: 1, name });
        }
      }),
    );
  });

  // Property: Req 5.8 bad storage falls back to null without errors
  /** **Validates: Requirements 5.8** */
  it('blocked, throwing or garbage storage falls back to null without throwing', () => {
    const stored = fc.oneof(
      fc.constant(null),
      fc.string(),
      fc.json(),
      rawName.map((name) => JSON.stringify({ v: 1, name })),
      fc.record({ v: fc.anything(), name: fc.anything() }).map((o) => JSON.stringify(o)),
    );
    fc.assert(
      fc.property(fc.constantFrom(...FAKE_STORAGE_MODES), stored, rawName, (mode, initial, raw) => {
        const fake = createFakeStorage({ mode, initial, key: GUESTBOOK_STORAGE_KEY });
        const loaded = loadName(fake.getter);
        // Anything loaded is a valid Player_Name.
        if (loaded !== null) expect(normalizeName(loaded)).toBe(loaded);
        if (mode === 'nullGetter' || mode === 'getterThrows' || mode === 'readThrows') {
          expect(loaded).toBeNull();
        }
        const saved = saveName(fake.getter, raw);
        // `readThrows` only blocks getItem, so a write can still succeed there.
        if (mode === 'nullGetter' || mode === 'getterThrows' || mode === 'writeThrows') expect(saved).toBe(false);
        if (mode === 'ok') expect(saved).toBe(normalizeName(raw) !== null);
      }),
    );
  });
});

describe('loadName', () => {
  it('rejects a wrong version and an invalid stored name', () => {
    const v2 = createFakeStorage({ initial: '{"v":2,"name":"Bing"}', key: GUESTBOOK_STORAGE_KEY });
    expect(loadName(v2.getter)).toBeNull();
    const bad = createFakeStorage({ initial: '{"v":1,"name":"<script>"}', key: GUESTBOOK_STORAGE_KEY });
    expect(loadName(bad.getter)).toBeNull();
    const spaced = createFakeStorage({ initial: '{"v":1,"name":"  Mr   Bones "}', key: GUESTBOOK_STORAGE_KEY });
    expect(loadName(spaced.getter)).toBe('Mr Bones');
  });
});
