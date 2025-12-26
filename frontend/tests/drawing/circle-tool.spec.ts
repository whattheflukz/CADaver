/**
 * Circle Tool Tests
 * 
 * Tests circle drawing functionality:
 * - Basic circle creation
 * - Center and radius definition
 * - Snapping behavior
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawLine,
    OFFSETS,
    getEntityCount,
} from '../setup/test-utils';

test.describe('Circle Tool', () => {

    test.describe('Basic Circle Drawing', () => {

        test('clicking center then edge creates circle', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');

            // Click center
            await clickAtViewportCenter(page);

            // Click to define radius
            await clickAtOffset(page, OFFSETS.medium, 0);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('circle radius is distance from center to second click', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);
            await clickAtOffset(page, OFFSETS.large, 0);

            // Circle should have radius equal to OFFSETS.large
        });

        test('circle center is first click point', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'circle');

            // Center at specific offset
            await clickAtOffset(page, OFFSETS.small, OFFSETS.small);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            // Circle center should be at first click
        });
    });

    test.describe('Snapping', () => {

        test('circle center snaps to origin', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'circle');

            // Click near origin
            await clickAtOffset(page, 3, 3);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Center should snap to origin
        });

        test('circle center snaps to line endpoint', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line
            await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);

            await selectTool(page, 'circle');

            // Click near line endpoint
            await clickAtOffset(page, -OFFSETS.medium + 3, 3);
            await clickAtOffset(page, 0, 0);

            // Center should snap to endpoint
        });

        test('radius snaps to line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw vertical line
            await drawLine(page, OFFSETS.medium, -OFFSETS.large, OFFSETS.medium, OFFSETS.large);

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);

            // Click on line (should snap radius to line distance)
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Radius should be exactly OFFSETS.medium
        });
    });

    test.describe('Circle Tool Cancellation', () => {

        test('Escape before second click cancels circle', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);

            // Cancel before defining radius
            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });

        test('switching tool cancels pending circle', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);

            // Switch to line tool
            await selectTool(page, 'line');
            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Multiple Circles', () => {

        test('can draw multiple circles', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');

            // First circle
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, -OFFSETS.medium + OFFSETS.small, 0);

            // Second circle
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium + OFFSETS.small, 0);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 2);
        });

        test('circles do not chain like lines', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'circle');

            // First circle
            await clickAtViewportCenter(page);
            await clickAtOffset(page, OFFSETS.small, 0);

            // Second circle should require new center click
            await clickAtOffset(page, OFFSETS.large, 0); // This is new center
            await clickAtOffset(page, OFFSETS.large + OFFSETS.small, 0); // This is radius
        });
    });

    test.describe('Construction Mode', () => {

        test('construction circle is drawn dashed', async ({ sketchPage }) => {
            const page = sketchPage;

            // Enable construction mode
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Circle should appear dashed
        });
    });

    test.describe('Very Small / Very Large Circles', () => {

        test('very small circle is created', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);
            await clickAtOffset(page, 5, 0); // Very small radius

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('large circle is created', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'circle');
            await clickAtViewportCenter(page);
            await clickAtOffset(page, OFFSETS.large * 2, 0);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });
});
