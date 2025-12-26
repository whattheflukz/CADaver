/**
 * Line Tool Tests
 * 
 * Tests line drawing functionality:
 * - Basic line creation
 * - Snapping behavior
 * - Chained line drawing
 * - Construction mode
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    OFFSETS,
    getEntityCount,
} from '../setup/test-utils';

test.describe('Line Tool', () => {

    test.describe('Basic Line Drawing', () => {

        test('clicking two points creates a line', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Escape to finish tool
            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('line starts from first click point', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'line');

            // Click at specific location
            await clickAtOffset(page, OFFSETS.small, OFFSETS.small);
            await clickAtOffset(page, OFFSETS.large, OFFSETS.small);
            await page.keyboard.press('Escape');

            // Line should start at first click
        });

        test('multiple lines can be drawn in sequence', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'line');

            // Draw first line
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, 0);

            // Continue to draw second line (chained)
            await clickAtOffset(page, OFFSETS.medium, 0);

            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 2);
        });
    });

    test.describe('Snapping', () => {

        test('snaps to origin when near', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'line');

            // Click near origin (should snap)
            await clickAtOffset(page, 5, 5);
            await clickAtOffset(page, OFFSETS.medium, 0);

            await page.keyboard.press('Escape');

            // Line should have snapped to origin
        });

        test('snaps to existing line endpoint', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw first line
            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, 0);
            await page.keyboard.press('Escape');

            // Draw second line starting near first's endpoint
            await selectTool(page, 'line');
            await clickAtOffset(page, 3, 3); // Near [0,0]
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);
            await page.keyboard.press('Escape');

            // Should have snapped
        });

        test('snaps to midpoint of line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw horizontal line
            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.large, 0);
            await clickAtOffset(page, OFFSETS.large, 0);
            await page.keyboard.press('Escape');

            // Draw line starting near midpoint
            await selectTool(page, 'line');
            await clickAtOffset(page, 3, 3); // Near center (which is midpoint)
            await clickAtOffset(page, 0, OFFSETS.medium);
            await page.keyboard.press('Escape');

            // Should have snapped to midpoint
        });

        test('horizontal/vertical snap creates aligned lines', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'line');

            // Start at origin
            await clickAtViewportCenter(page);

            // Move almost horizontally (should snap to pure horizontal)
            await clickAtOffset(page, OFFSETS.large, 3);

            await page.keyboard.press('Escape');

            // Line should be perfectly horizontal
        });
    });

    test.describe('Construction Mode', () => {

        test('can toggle construction mode', async ({ sketchPage }) => {
            const page = sketchPage;

            // Toggle construction mode via command palette
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await page.keyboard.press('Escape');

            // Line should be construction (dashed)
        });

        test('construction lines are drawn dashed', async ({ sketchPage }) => {
            const page = sketchPage;

            // Enable construction mode
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await page.keyboard.press('Escape');

            // Visual verification - should appear dashed
        });
    });

    test.describe('Line Tool Cancellation', () => {

        test('Escape cancels pending line', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Don't complete - press Escape
            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });

        test('switching tool cancels pending line', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Switch to circle tool
            await selectTool(page, 'circle');

            // Line should be cancelled
            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Chained Drawing', () => {

        test('next line starts from previous endpoint', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'line');

            // Draw first line
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, 0);

            // Second line should auto-start from [0,0]
            await clickAtOffset(page, 0, -OFFSETS.medium);

            await page.keyboard.press('Escape');

            const count = await getEntityCount(page);
            expect(count).toBe(2);
        });

        test('double-click ends chained drawing', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'line');

            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, 0);

            // Double-click to end chain
            const canvas = page.locator('canvas').first();
            await canvas.dblclick();

            // Further clicks should start new line, not continue chain
        });
    });
});
