import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Chrome extension build:
//  - manager.html : the management page (React)
//  - background.js: the MV3 service worker (ES module, fixed file name for manifest.json)
// Everything is bundled locally; no remote code is ever loaded.
export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        manager: 'manager.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
