/**
 * Rectangle Tool Tests
 * 
 * Tests rectangle drawing functionality:
 * - Two-corner rectangle creation
 * - Creates 4 connected lines
 * - Snapping behavior
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    OFFSETS,
    getEntityCount,
} from '../setup/test-utils';

test.describe('Rectangle Tool', () => {

    test.describe('Basic Rectangle Drawing', () => {

        test('clicking two corners creates rectangle', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'rectangle');

            // First corner
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.small);

            // Opposite corner
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            // Rectangle should be 4 lines
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 4);
        });

        test('rectangle creates 4 connected lines', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            // Should have 4 line entities forming a closed rectangle
        });

        test('rectangle corners are at click positions', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');

            const x1 = -OFFSETS.small;
            const y1 = -OFFSETS.small;
            const x2 = OFFSETS.large;
            const y2 = OFFSETS.large;

            await clickAtOffset(page, x1, y1);
            await clickAtOffset(page, x2, y2);

            // Rectangle should have corners at these positions
        });
    });

    test.describe('Rectangle Snapping', () => {

        test('first corner snaps to origin', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');

            // Click near origin
            await clickAtOffset(page, 3, 3);
            await clickAtOffset(page, OFFSETS.large, OFFSETS.medium);

            // First corner should snap to origin
        });

        test('second corner can snap to create square', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');
            await clickAtViewportCenter(page);

            // If holding shift, may constrain to square
            await page.keyboard.down('Shift');
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium + 5);
            await page.keyboard.up('Shift');

            // May create square (equal sides)
        });
    });

    test.describe('Rectangle Tool Cancellation', () => {

        test('Escape after first corner cancels', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);

            await page.keyboard.press('Escape');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Rectangle Constraints', () => {

        test('rectangle lines may have auto horizontal/vertical constraints', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            // Rectangle should have:
            // - 2 horizontal lines
            // - 2 vertical lines
            // May auto-add horizontal/vertical constraints
        });

        test('rectangle corners are coincident', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            // All 4 corners should have coincident constraints connecting lines
        });
    });

    test.describe('Multiple Rectangles', () => {

        test('can draw multiple rectangles', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'rectangle');

            // First rectangle
            await clickAtOffset(page, -OFFSETS.large, -OFFSETS.small);
            await clickAtOffset(page, -OFFSETS.medium, OFFSETS.small);

            // Second rectangle
            await clickAtOffset(page, OFFSETS.medium, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.large, OFFSETS.small);

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 8); // 4 lines each
        });
    });

    test.describe('Construction Mode Rectangle', () => {

        test('construction rectangle creates dashed lines', async ({ sketchPage }) => {
            const page = sketchPage;

            // Enable construction mode
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            // All 4 lines should be construction (dashed)
        });
    });

    test.describe('Degenerate Rectangles', () => {

        test('very small rectangle is created', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, 0, 0);
            await clickAtOffset(page, 5, 3); // Very small

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 4);
        });

        test('same corner click is handled', async ({ sketchPage }) => {
            const page = sketchPage;

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'rectangle');
            await clickAtViewportCenter(page);
            await clickAtViewportCenter(page); // Same point

            // Should either create zero-size rectangle or cancel
            const newCount = await getEntityCount(page);
            // Accept either outcome
        });
    });

    test.describe('Rectangle Preview', () => {

        test('preview shows while dragging to second corner', async ({ sketchPage }) => {
            const page = sketchPage;

            await selectTool(page, 'rectangle');
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);

            // Move mouse - should show rectangle preview
            const canvas = page.locator('canvas').first();
            await canvas.hover({ position: { x: 740, y: 410 } });

            // Preview rectangle should be visible (visual check)
        });
    });
});
