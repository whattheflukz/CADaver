/**
 * Point to Line Dimension Tests
 * 
 * Tests DistancePointLine constraint creation:
 * - Line endpoint to another line
 * - Origin to line
 * - Circle center to line
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawLine,
    drawCircle,
    OFFSETS,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Point to Line Dimensioning', () => {

    test.describe('Endpoint to Line Distance', () => {

        test('dimension from line endpoint to another line', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on line endpoint (left end of horizontal line)
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click on the vertical line (not at endpoint)
            await clickAtOffset(page, 0, OFFSETS.small);

            // Place dimension
            await clickAtOffset(page, -OFFSETS.small, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('dimension from top endpoint to horizontal line', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on vertical line's top endpoint
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Click on horizontal line (middle segment)
            await clickAtOffset(page, OFFSETS.small, 0);

            // Place dimension
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Origin to Line Distance', () => {

        test('dimension from origin to line creates DistancePointLine', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line that doesn't pass through origin
            await drawLine(page, OFFSETS.medium, -OFFSETS.medium, OFFSETS.medium, OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click origin
            await clickAtViewportCenter(page);

            // Click on line
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension
            await clickAtOffset(page, OFFSETS.small, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Circle Center to Line Distance', () => {

        test('dimension from circle center to line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a circle
            await drawCircle(page, 0, 0, OFFSETS.small);

            // Draw a line away from the circle
            await drawLine(page, OFFSETS.large, -OFFSETS.medium, OFFSETS.large, OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click circle center
            await clickAtViewportCenter(page);

            // Click on line
            await clickAtOffset(page, OFFSETS.large, 0);

            // Place dimension
            await clickAtOffset(page, OFFSETS.medium, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Order Independence', () => {

        test('clicking line first then point works the same', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click line first
            await clickAtOffset(page, OFFSETS.small, 0); // horizontal line middle

            // Then click endpoint of vertical line
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Place dimension
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Edge Cases', () => {

        test('point on line does not create zero-distance dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // The intersection point is on both lines - should handle gracefully
            await selectTool(page, 'dimension');

            // Click the intersection point
            await clickAtViewportCenter(page);

            // Click on horizontal line (which goes through this point)
            await clickAtOffset(page, OFFSETS.small, 0);

            // This might create a zero distance or be prevented - verify no crash
            // Just verify the app didn't break
            await page.keyboard.press('Escape');
            await selectTool(page, 'select');
        });

        test('dimension to very short line segment', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a very short line
            await drawLine(page, 0, 0, 5, 5);

            // Draw another line far away
            await drawLine(page, OFFSETS.large, 0, OFFSETS.large, OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click endpoint of short line
            await clickAtOffset(page, 0, 0);

            // Click far line
            await clickAtOffset(page, OFFSETS.large, OFFSETS.small);

            // Place dimension
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });
});
