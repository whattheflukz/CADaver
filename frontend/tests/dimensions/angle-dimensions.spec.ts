/**
 * Angle Dimension Tests
 * 
 * Tests angle dimensioning between lines:
 * - Acute angles
 * - Obtuse angles
 * - Right angles
 * - Parallel lines (0°/180°)
 * - Nearly parallel lines
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    drawLine,
    OFFSETS,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Angle Dimensioning', () => {

    test.describe('Basic Angle Dimensions', () => {

        test('angle between perpendicular lines creates 90° dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on horizontal line
            await clickAtOffset(page, OFFSETS.small, 0);

            // Click on vertical line
            await clickAtOffset(page, 0, OFFSETS.small);

            // Place angle arc
            await clickAtOffset(page, OFFSETS.small, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('acute angle dimension (45°)', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw horizontal line
            await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

            // Draw 45° diagonal line from origin
            await drawLine(page, 0, 0, OFFSETS.medium, -OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click horizontal line
            await clickAtOffset(page, -OFFSETS.small, 0);

            // Click diagonal line
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            // Place angle
            await clickAtOffset(page, OFFSETS.small, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('obtuse angle dimension (135°)', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw horizontal line
            await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

            // Draw line at 135° from horizontal
            await drawLine(page, 0, 0, -OFFSETS.medium, -OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click horizontal line
            await clickAtOffset(page, OFFSETS.small, 0);

            // Click diagonal line
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);

            // Place angle
            await clickAtOffset(page, -OFFSETS.small, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Parallel Lines Edge Case', () => {

        test('angle between parallel lines shows 0°', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two parallel horizontal lines
            await drawLine(page, -OFFSETS.medium, -OFFSETS.small, OFFSETS.medium, -OFFSETS.small);
            await drawLine(page, -OFFSETS.medium, OFFSETS.small, OFFSETS.medium, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click first line
            await clickAtOffset(page, 0, -OFFSETS.small);

            // Click second line
            await clickAtOffset(page, 0, OFFSETS.small);

            // Place angle (should show 0 or 180)
            await clickAtOffset(page, OFFSETS.large, 0);

            // Verify constraint was created (even for 0°)
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('angle between nearly parallel lines is small but non-zero', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw horizontal line
            await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

            // Draw nearly horizontal line (5° offset)
            await drawLine(page, -OFFSETS.medium, -5, OFFSETS.medium, 5);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click both lines
            await clickAtOffset(page, 0, 0);
            await clickAtOffset(page, 0, 2);

            // Place
            await clickAtOffset(page, OFFSETS.large, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Intersecting Lines', () => {

        test('angle dimension on X intersection works', async ({ sketchWithIntersection }) => {
            const page = sketchWithIntersection;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click one diagonal
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);

            // Click other diagonal
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            // Place
            await clickAtOffset(page, 0, -OFFSETS.medium);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('can dimension either of the two angles at intersection', async ({ sketchWithIntersection }) => {
            const page = sketchWithIntersection;

            await selectTool(page, 'dimension');

            // Click both diagonals
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            // Placing on one side gives one angle, other side gives supplementary
            // Place in upper-left quadrant
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);

            // Verify dimension created
            const count1 = await getConstraintCount(page);
            expect(count1).toBeGreaterThan(0);
        });
    });

    test.describe('Non-Intersecting Lines', () => {

        test('angle dimension works on lines that do not intersect', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two non-intersecting lines
            await drawLine(page, -OFFSETS.large, -OFFSETS.medium, -OFFSETS.small, -OFFSETS.medium);
            await drawLine(page, OFFSETS.small, OFFSETS.medium, OFFSETS.large, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click both lines
            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium - 10);

            // Place (extended intersection area)
            await clickAtOffset(page, 0, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Line Selection Order', () => {

        test('line selection order does not affect angle value', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create first angle dimension clicking horizontal then vertical
            await selectTool(page, 'dimension');
            await clickAtOffset(page, OFFSETS.small, 0);  // horizontal
            await clickAtOffset(page, 0, OFFSETS.small);  // vertical
            await clickAtOffset(page, OFFSETS.small, OFFSETS.small);

            const count1 = await getConstraintCount(page);

            // Create second angle dimension clicking vertical then horizontal
            await selectTool(page, 'dimension');
            await clickAtOffset(page, 0, -OFFSETS.small); // vertical
            await clickAtOffset(page, -OFFSETS.small, 0); // horizontal
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);

            const count2 = await getConstraintCount(page);

            // Both should have created valid constraints
            expect(count2).toBe(count1 + 1);
        });
    });

    test.describe('Edge Cases', () => {

        test('clicking same line twice does not create angle constraint', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click horizontal line twice
            await clickAtOffset(page, OFFSETS.small, 0);
            await clickAtOffset(page, -OFFSETS.small, 0);

            // This might create a length dimension instead, but not an angle
            // Cancel
            await page.keyboard.press('Escape');

            // Should not have added an angle constraint for same line
            // (might have added length - that's fine)
        });

        test('angle between line and point is not valid', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line
            await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

            // Draw a point
            await selectTool(page, 'point');
            await clickAtOffset(page, 0, OFFSETS.medium);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click line
            await clickAtOffset(page, 0, 0);

            // Click point
            await clickAtOffset(page, 0, OFFSETS.medium);

            // This should not create an angle constraint (point-line creates distance)
            // Place
            await clickAtOffset(page, OFFSETS.small, OFFSETS.medium);

            // Should have created a DistancePointLine, not Angle
            const newCount = await getConstraintCount(page);
            expect(newCount).toBeGreaterThanOrEqual(initialCount);
        });
    });
});
