// SSR library build for the zombie-sim MCP server and the balance-check CLI.
// Run with `npm run sim:build`. Output goes to tools/mcp-sim/dist/ (gitignored)
// and is never part of the game's `npm run build`.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        server: `${here}src/server.ts`,
        check: `${here}src/check.ts`,
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    },
  },
});
