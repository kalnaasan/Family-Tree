import { defineConfig, devices } from '@playwright/test'
import type { Language } from './src/i18n/languageType.ts'

/** The specs that run again with the Language set to Arabic (spec section 13.7). Persistence, single-writer, large-tree, perf and `rtl.spec.ts` (which makes an English page read right to left by hand; `rtl-arabic` does it in Arabic) stay English. */
const ARABIC_SPECS = /[\\/](smoke|tree|keyboard|add-relative|search|backup|undo|touch|photos|rtl-arabic)\.spec\.ts$/
/** Not run in the English projects: the timing tests have their own project, and `rtl-arabic` needs Arabic. */
const ENGLISH_IGNORED = /(perf|rtl-arabic)\.spec\.ts$/
const arabic: { language: Language; baseURL: string } = { language: 'ar', baseURL: 'http://localhost:4174' }

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // the same app built with Arabic offered, for the Arabic projects; the released build never offers it
    {
      command: 'vite build --mode arabic --outDir dist-ar && vite preview --outDir dist-ar --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ENGLISH_IGNORED },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: ENGLISH_IGNORED },
    { name: 'chromium-ar', use: { ...devices['Desktop Chrome'], ...arabic }, testMatch: ARABIC_SPECS },
    { name: 'webkit-ar', use: { ...devices['Desktop Safari'], ...arabic }, testMatch: ARABIC_SPECS },
    // Timing tests run alone, after everything else: other tests running at the same time steal CPU from a
    // measurement taken at 4x throttle.
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /perf\.spec\.ts/,
      dependencies: ['chromium', 'webkit', 'chromium-ar', 'webkit-ar'],
    },
  ],
})
