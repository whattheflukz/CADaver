/**
 * Playwright Test Fixtures for CAD Sketch Testing
 * 
 * Provides reusable test fixtures for common starting states
 */

import { test as base, Page } from '@playwright/test';
import {
    waitForAppReady,
    startNewSketch,
    drawLine,
    drawCircle,
    drawRectangle,
    OFFSETS
} from './test-utils';

/** Extended test fixtures */
export const test = base.extend<{
    /** Page with app loaded and ready */
    appPage: Page;
    /** Page in sketch mode on XY plane */
    sketchPage: Page;
    /** Page with basic geometry (2 perpendicular lines) */
    sketchWithLines: Page;
    /** Page with a circle */
    sketchWithCircle: Page;
    /** Page with a rectangle (4 lines) */
    sketchWithRectangle: Page;
    /** Page with intersecting lines (for trim testing) */
    sketchWithIntersection: Page;
}>({
    // Basic app page - loaded and ready
    appPage: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await use(page);
    },

    // Page in sketch mode
    sketchPage: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await startNewSketch(page);
        await use(page);
    },

    // Sketch with two perpendicular lines
    sketchWithLines: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await startNewSketch(page);

        // Draw horizontal line
        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        // Draw vertical line
        await drawLine(page, 0, -OFFSETS.medium, 0, OFFSETS.medium);

        await use(page);
    },

    // Sketch with a circle
    sketchWithCircle: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await startNewSketch(page);

        // Draw circle at center with medium radius
        await drawCircle(page, 0, 0, OFFSETS.medium);

        await use(page);
    },

    // Sketch with a rectangle
    sketchWithRectangle: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await startNewSketch(page);

        // Draw rectangle
        await drawRectangle(page, -OFFSETS.medium, -OFFSETS.small, OFFSETS.medium, OFFSETS.small);

        await use(page);
    },

    // Sketch with two intersecting lines (X pattern)
    sketchWithIntersection: async ({ page }, use) => {
        await page.goto('/');
        await waitForAppReady(page);
        await startNewSketch(page);

        // Draw diagonal line from top-left to bottom-right
        await drawLine(page, -OFFSETS.medium, -OFFSETS.medium, OFFSETS.medium, OFFSETS.medium);

        // Draw diagonal line from top-right to bottom-left
        await drawLine(page, OFFSETS.medium, -OFFSETS.medium, -OFFSETS.medium, OFFSETS.medium);

        await use(page);
    },
});

export { expect } from '@playwright/test';
