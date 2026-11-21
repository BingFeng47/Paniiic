import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: { include: ['src/**/*.ts'], exclude: ['src/main.ts'] },
  },
});
