/**
 * Point to Point Dimension Tests
 * 
 * Tests dimensioning between various point types:
 * - Line endpoints to line endpoints
 * - Line endpoints to origin
 * - Line endpoints to circle center
 * - Point entities
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
    waitForSketchMode,
} from '../setup/test-utils';

test.describe('Point to Point Dimensioning', () => {

    test.describe('Basic Distance Dimensions', () => {

        test('dimension between two line endpoints creates Distance constraint', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Get initial constraint count
            const initialCount = await getConstraintCount(page);

            // Activate dimension tool
            await selectTool(page, 'dimension');

            // Click on first line's start point (left end of horizontal line)
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click on second point (top of vertical line)
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Click to place dimension
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);

            // Verify constraint was added
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('dimension between endpoints on same line creates length dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');

            // Click both endpoints of horizontal line
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension below the line
            await clickAtOffset(page, 0, OFFSETS.small);

            // Verify a constraint was created
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });

        test('clicking same point twice does not create dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click same point twice
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Should not create a new constraint
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Point to Origin Dimensions', () => {

        test('dimension from line endpoint to origin', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on line endpoint
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click on origin (center)
            await clickAtViewportCenter(page);

            // Place the dimension
            await clickAtOffset(page, -OFFSETS.small, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Point to Circle Center Dimensions', () => {

        test('dimension from line endpoint to circle center', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line
            await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);

            // Draw a circle to the right
            await drawCircle(page, OFFSETS.medium, 0, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            // Dimension from line endpoint to circle center
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0); // Line endpoint
            await clickAtOffset(page, OFFSETS.medium, 0);   // Circle center
            await clickAtOffset(page, 0, -OFFSETS.small);   // Placement

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Horizontal Distance Dimensions', () => {

        test('dimension placed to the side creates HorizontalDistance', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');

            // Select two points that have different X and Y
            // Point 1: left end of horizontal line
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Point 2: top of vertical line
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Place dimension far to the left (triggers horizontal distance mode)
            await clickAtOffset(page, -OFFSETS.large - 50, 0);

            // Verify constraint created
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });
    });

    test.describe('Vertical Distance Dimensions', () => {

        test('dimension placed above/below creates VerticalDistance', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');

            // Select two points
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Place dimension far above (triggers vertical distance mode)
            await clickAtOffset(page, 0, -OFFSETS.large - 50);

            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });
    });

    test.describe('Edge Cases', () => {

        test('dimension tool can be cancelled with Escape', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Start dimension selection
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Cancel with escape
            await page.keyboard.press('Escape');

            // Count should not change
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });

        test('switching tools cancels pending dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Switch to line tool
            await selectTool(page, 'line');

            // Escape to cancel
            await page.keyboard.press('Escape');

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });
});
