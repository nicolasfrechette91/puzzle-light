import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the static build works from any sub-path (e.g. GitHub Pages /puzzle-light/).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
