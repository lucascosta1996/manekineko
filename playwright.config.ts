import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/visual',
  globalSetup: './tests/visual/global-setup.ts',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 3,
  timeout: 60000,
  expect: { timeout: 10000, toHaveScreenshot: { threshold: 0.1, maxDiffPixels: 0, animations: 'disabled' } },
  outputDir: 'test-results/visual',
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/visual/results.json' }]],
  use: { serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1, colorScheme: 'light', contextOptions: { reducedMotion: 'reduce' }, screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: ['landing','web','launch'].filter(app => !process.env.UI_APP || app === process.env.UI_APP).map((app) => ({
    command: `node scripts/visual/serve.mjs ${app}`, url: `http://127.0.0.1:${({landing:4311,web:4312,launch:4313}[app as 'landing'|'web'|'launch'])}`,
    reuseExistingServer: false, timeout: 60000,
  })),
});
