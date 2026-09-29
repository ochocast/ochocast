import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
// Chromium always runs. Set E2E_ALL_BROWSERS=1 to also run Firefox and WebKit.
const allBrowsers = !!process.env.E2E_ALL_BROWSERS;
const authFile = 'playwright/.auth/user.json';

/**
 * See https://playwright.dev/docs/test-configuration.
 * Full guide: e2e/README.md
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* Retries only on CI, so local failures stay visible immediately. */
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ['github'],
    ]
    : [
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ['list'],
    ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Logs in through Keycloak once and stores the session in `authFile`.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
    ...(allBrowsers
      ? [
        {
          name: 'firefox',
          testMatch: /tests\/.*\.spec\.ts/,
          use: { ...devices['Desktop Firefox'], storageState: authFile },
          dependencies: ['setup'],
        },
        {
          name: 'webkit',
          testMatch: /tests\/.*\.spec\.ts/,
          use: { ...devices['Desktop Safari'], storageState: authFile },
          dependencies: ['setup'],
        },
      ]
      : []),
  ],

  /* Start backend and frontend, and wait until both accept connections. */
  webServer: [
    {
      command: 'npm run start:backend',
      port: 3001,
      reuseExistingServer: !isCI,
      timeout: 180 * 1000,
    },
    {
      command: 'npm run start:frontend',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 180 * 1000,
    },
  ],
});
