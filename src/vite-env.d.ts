/// <reference types="vite/client" />

// Only these two variables reach the game (leaderboard Req 6.3). Never add a secret key here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
