import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] }
  },
  webServer: { command: 'npm start -- --port 5179 --strictPort', url: 'http://127.0.0.1:5179', reuseExistingServer: !process.env.CI },
  reporter: 'list'
})
