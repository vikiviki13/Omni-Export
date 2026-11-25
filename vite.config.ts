/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Builds the plugin UI into one self-contained dist/ui.html (no CDN, no network).
function renameToUiHtml(): Plugin {
  return {
    name: 'rename-to-ui-html',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, 'dist/index.html');
      if (existsSync(from)) renameSync(from, resolve(__dirname, 'dist/ui.html'));
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, 'src/ui'),
  plugins: [react(), viteSingleFile(), renameToUiHtml()],
  define: { __DEV__: JSON.stringify(mode === 'development') },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
    minify: mode === 'development' ? false : 'esbuild',
    sourcemap: false,
  },
  test: {
    root: __dirname,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
}));
