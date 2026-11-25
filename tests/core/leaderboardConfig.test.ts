// Leaderboard config tests (leaderboard Req 6.3, 6.4).
// Keys are placeholders. The secret-shaped one is built at runtime so no tracked file holds
// a string matching the secret-key scan in tests/docs/secrets.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLeaderboardConfig } from '../../src/core/leaderboardConfig';

const URL_OK = 'https://abc.supabase.co';
const KEY_OK = 'sb_publishable_placeholder';
const secretKey = (): string => ['sb', 'secret', 'x'.repeat(24)].join('_');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readLeaderboardConfig', () => {
  it('accepts an https URL with a publishable key', () => {
    expect(
      readLeaderboardConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }),
    ).toEqual({ url: URL_OK, key: KEY_OK });
  });

  it('drops a trailing slash so the endpoint path is exact', () => {
    expect(
      readLeaderboardConfig({
        VITE_SUPABASE_URL: `${URL_OK}/`,
        VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK,
      })?.url,
    ).toBe(URL_OK);
  });

  it('returns null when a variable is missing or not a string', () => {
    expect(readLeaderboardConfig({})).toBeNull();
    expect(readLeaderboardConfig({ VITE_SUPABASE_URL: URL_OK })).toBeNull();
    expect(readLeaderboardConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK })).toBeNull();
    expect(
      readLeaderboardConfig({ VITE_SUPABASE_URL: 42, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }),
    ).toBeNull();
  });

  it.each(['http://abc.supabase.co', 'ftp://abc.supabase.co', 'abc.supabase.co', 'not a url', ''])(
    'requires https (%s → null)',
    (url) => {
      expect(
        readLeaderboardConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }),
      ).toBeNull();
    },
  );

  it.each(['', 'sb_publishable_', 'anon-key', 'eyJhbGciOiJIUzI1NiJ9.x.y', 'SB_PUBLISHABLE_abc'])(
    'requires an sb_publishable_ key (%s → null)',
    (key) => {
      expect(
        readLeaderboardConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toBeNull();
    },
  );

  it('refuses a secret key with a console error that does not print the key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = secretKey();
    expect(
      readLeaderboardConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
    ).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    const printed = error.mock.calls.flat().map(String).join(' ');
    expect(printed).not.toContain(key);
    expect(printed).not.toContain('x'.repeat(8));
  });

  it('does not log anything for a publishable key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    readLeaderboardConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK });
    expect(error).not.toHaveBeenCalled();
  });
});
