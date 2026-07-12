import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end runs against the built app served by vite preview: the service
 * worker only exists in a build, and the exit criterion is the offline
 * journey. Chromium and WebKit per the testing stack (main plan §5).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI === undefined ? 0 : 1,
  use: {
    baseURL: 'http://localhost:4173'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'corepack pnpm exec vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 30_000
  }
});
