import { devices } from '@playwright/test';
import base from './playwright.config';

export default {
  ...base,
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
  ],
};
