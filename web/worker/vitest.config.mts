// Unit tests for the Cloudflare Worker (npm run test:worker). The Angular unit-test builder
// only covers src/, so the Worker has its own small Vitest run.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.spec.ts'],
    environment: 'node',
  },
});
