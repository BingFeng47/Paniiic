// Leaderboard configuration from the Vite env (leaderboard Req 6.3, 6.4).
// Only the publishable key is accepted. A secret key is refused and never printed.

export interface LeaderboardConfig {
  readonly url: string;
  readonly key: string;
}

/** The env fields this module reads. Any other variable is ignored. */
export interface LeaderboardEnv {
  readonly VITE_SUPABASE_URL?: unknown;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: unknown;
}

const PUBLISHABLE_PREFIX = 'sb_publishable_';
const SECRET_PREFIX = 'sb_secret_';

/** Returns the config, or `null` when it is missing, not `https://` or not a publishable key. */
export function readLeaderboardConfig(
  env: LeaderboardEnv = import.meta.env,
): LeaderboardConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL;
  const rawKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof rawUrl !== 'string' || typeof rawKey !== 'string') return null;
  const key = rawKey.trim();
  if (key.startsWith(SECRET_PREFIX)) {
    // Do not include the key, or any part of it beyond the public prefix, in the message.
    console.error(
      'Leaderboard disabled: VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. ' +
        'Use the publishable key and rotate the secret key.',
    );
    return null;
  }
  if (!key.startsWith(PUBLISHABLE_PREFIX) || key.length === PUBLISHABLE_PREFIX.length) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  // Keep only the origin and path, without a trailing slash, so `${url}/rest/v1/scores` is exact.
  const url = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  return { url, key };
}
