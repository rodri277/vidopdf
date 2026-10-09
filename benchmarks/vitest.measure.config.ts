import { defineConfig } from 'vitest/config';

// Slow measurements that write reports; kept out of the normal test run.
export default defineConfig({
  test: {
    include: ['src/**/*.measure.ts'],
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    fileParallelism: false,
  },
});
