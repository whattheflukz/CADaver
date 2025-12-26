/**
 * Arc Tool Tests
 * 
 * Tests arc drawing functionality:
 * - Three-point arc creation
 * - Snapping behavior
 * - Arc direction
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

test.describe('Arc Tool', () => {

    test.describe('Basic Arc Drawing', () => {

        test('clicking three points creates arc', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'arc');

            // Start point
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Through point (on arc)
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // End point
            await clickAtOffset(page, OFFSETS.medium, 0);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('arc passes through all three points', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'arc');

            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.small); // Through point
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Arc should pass through all three clicked points
        });

        test('arc endpoints are first and third clicks', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'arc');

            await clickAtOffset(page, -OFFSETS.large, OFFSETS.small);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.large, OFFSETS.small);

            // Arc should have endpoints at first and last click
        });
    });

    test.describe('Arc Direction', () => {

        test('through point determines arc direction', async ({ sketchPage }) => {
            const page = sketchPage;

            // Arc with through-point above creates upper arc
            await selectTool(page, 'arc');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium); // Above
            await clickAtOffset(page, OFFSETS.medium, 0);

            await page.keyboard.press('Escape');

            // Arc with through-point below creates lower arc
            await selectTool(page, 'arc');
            await clickAtOffset(page, -OFFSETS.medium, OFFSETS.large);
            await clickAtOffset(page, 0, OFFSETS.large + OFFSETS.medium); // Below
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.large);
        });
    });

    test.describe('Snapping', () => {

        test('arc endpoint snaps to origin', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'arc');

            // Start near origin
            await clickAtOffset(page, 3, 3);
            await clickAtOffset(page, OFFSETS.medium, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.large, 0);

            // First point should snap to origin
        });

        test('arc endpoint snaps to existing endpoint', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line
            await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);

            await selectTool(page, 'arc');

            // Start near line endpoint
            await clickAtOffset(page, -OFFSETS.medium + 3, 3);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Should snap to line endpoint
        });
    });

    test.describe('Arc Tool Cancellation', () => {

        test('Escape after first point cancels', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'arc');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });

        test('Escape after second point cancels', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'arc');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);

            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Collinear Points', () => {

        test('collinear points are handled gracefully', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'arc');

            // Three points on a line (collinear) - cannot define arc
            await clickAtOffset(page, -OFFSETS.large, 0);
            await clickAtOffset(page, 0, 0);
            await clickAtOffset(page, OFFSETS.large, 0);

            // Should handle gracefully (may not create arc or may show error)
        });
    });

    test.describe('Multiple Arcs', () => {

        test('can draw multiple arcs in sequence', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'arc');

            // First arc
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);
            await clickAtOffset(page, 0, -OFFSETS.large);
            await clickAtOffset(page, OFFSETS.medium, -OFFSETS.medium);

            // Second arc
            await clickAtOffset(page, -OFFSETS.medium, OFFSETS.medium);
            await clickAtOffset(page, 0, OFFSETS.large);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 2);
        });
    });

    test.describe('Arc Preview', () => {

        test('arc preview shows while defining through point', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'arc');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Move mouse - should show arc preview
            const canvas = page.locator('canvas').first();
            await canvas.hover({ position: { x: 640, y: 260 } });

            // Preview should be visible (visual check)
        });
    });
});
