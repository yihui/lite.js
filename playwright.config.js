import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60000,
  // set CHROMIUM_PATH to use an installed browser instead of Playwright's
  use: {launchOptions: {executablePath: process.env.CHROMIUM_PATH || undefined}}
});
