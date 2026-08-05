import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// The slide runtimes are classic (non-module) scripts by design, so Vite
// skips them during bundling. Preserve their core/ paths in the build output.
const copySlidesRuntime = {
  name: 'copy-slides-runtime',
  closeBundle() {
    mkdirSync('dist/core', { recursive: true });
    for (const file of ['slides.js', 'morph.js']) {
      copyFileSync(`core/${file}`, `dist/core/${file}`);
    }
  },
};

export default defineConfig({
  plugins: [copySlidesRuntime],
  server: {
    port: 5180,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
