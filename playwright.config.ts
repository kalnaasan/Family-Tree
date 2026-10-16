import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /perf\.spec\.ts/ },
    // Timing tests run alone, after everything else: other tests running at the same time steal CPU from a
    // measurement taken at 4x throttle.
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /perf\.spec\.ts/,
      dependencies: ['chromium', 'webkit'],
    },
  ],
})
