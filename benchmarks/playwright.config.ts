import { defineConfig, devices } from '@playwright/test';

// The suite measures the production build in headless Chromium: the CPU throttling, long task and
// process APIs it relies on are Chromium's. One worker, one test at a time, so runs do not disturb
// each other.
export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.bench.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  reporter: 'list',
  globalSetup: './src/setup.ts',
  globalTeardown: './src/teardown.ts',
  use: {
    baseURL: 'http://localhost:4174',
    launchOptions: { args: ['--enable-precise-memory-info'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command:
      'pnpm --filter @vidopdf/web build && pnpm --filter @vidopdf/web exec vite preview --port 4174 --strictPort',
    cwd: '..',
    url: 'http://localhost:4174',
    // Never reuse a server: it could be serving an old build and the numbers would describe it.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
