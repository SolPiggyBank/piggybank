import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [preact()],
  define: {
    'process.env.NODE_DEBUG': 'false',
    'process.env': '{}',
  },
  resolve: {
    alias: { buffer: 'buffer/' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'index.html'),
        background: resolve(import.meta.dirname, 'src/background.js'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
