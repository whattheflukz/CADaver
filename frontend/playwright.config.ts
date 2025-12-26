import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for CAD Sketch E2E Tests
 * 
 * Run all tests: npx playwright test
 * Run with UI:   npx playwright test --ui
 * Run headed:    npx playwright test --headed
 */
export default defineConfig({
    testDir: './tests',

    // Run tests in parallel
    fullyParallel: true,

    // Fail the build on CI if you accidentally left test.only in the source code
    forbidOnly: !!process.env.CI,

    // Retry on CI only
    retries: process.env.CI ? 2 : 0,

    // Limit workers on CI
    workers: process.env.CI ? 1 : undefined,

    // Reporter configuration
    reporter: [
        ['html', { open: 'never' }],
        ['list']
    ],

    // Shared settings for all projects
    use: {
        // Base URL for the dev server
        baseURL: 'http://localhost:5173',

        // Capture screenshot on failure
        screenshot: 'only-on-failure',

        // Record video on failure
        video: 'retain-on-failure',

        // Collect trace on failure
        trace: 'retain-on-failure',

        // Timeout for actions
        actionTimeout: 10000,

        // Navigation timeout
        navigationTimeout: 30000,
    },

    // Configure projects for major browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Run the dev server before starting tests
    webServer: {
        // Run from root to start both backend and frontend
        command: 'npm run dev --prefix ..',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },

    // Global timeout for each test
    timeout: 60000,

    // Expect timeout
    expect: {
        timeout: 10000,
    },
});
