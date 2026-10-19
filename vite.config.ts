/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run bench` (PERF=1) runs only the timing checks, one file at a time, so other tests cannot steal CPU
// from the measurement. `npm test` runs everything else.
const perfOnly = process.env.PERF === '1'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: perfOnly ? ['src/**/*.perf.ts'] : ['src/**/*.test.{ts,tsx}'],
    fileParallelism: !perfOnly,
    // the interface tests are slow when every file runs at once; the default 5 s fails them on a busy machine
    testTimeout: 20_000,
  },
})
