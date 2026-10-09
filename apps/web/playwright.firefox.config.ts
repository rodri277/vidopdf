import { devices } from '@playwright/test';
import base from './playwright.config';

export default {
  ...base,
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
  ],
};
