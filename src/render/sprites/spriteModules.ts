// The only `import.meta.glob` call for sprite frames (Req 13.1). Vite needs the pattern as a
// literal. With no files under assets/sprites/ this is `{}` and the game draws placeholders.

export const SPRITE_MODULES: Readonly<Record<string, string>> = import.meta.glob<string>(
  '/assets/sprites/**/*.svg',
  { eager: true, query: '?url', import: 'default' },
);
