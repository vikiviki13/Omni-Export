import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the Figma sandbox code into dist/code.js (single IIFE, no imports at runtime).
export default defineConfig(({ mode }) => ({
  define: { __DEV__: JSON.stringify(mode === 'development') },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2017',
    minify: mode === 'development' ? false : 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/plugin/code.ts'),
      formats: ['iife'],
      name: 'OmniExportPlugin',
      fileName: () => 'code.js',
    },
  },
}));
