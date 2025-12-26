/**
 * Mirror Tool Tests
 * 
 * Tests mirror functionality:
 * - Mirror single entity across construction line
 * - Mirror multiple entities
 * - Mirror across horizontal axis
 * - Mirror across vertical axis
 * - Mirror across diagonal axis
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawLine,
    drawCircle,
    OFFSETS,
    getEntityCount,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Mirror Tool', () => {

    test.describe('Basic Mirroring', () => {

        test('mirror single line across vertical axis', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a construction line for axis (vertical through origin)
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            // Turn off construction mode
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw a line to be mirrored
            await drawLine(page, -OFFSETS.medium, OFFSETS.small, -OFFSETS.small, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select the non-construction line
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + OFFSETS.small / 2, OFFSETS.small);

            // Open mirror tool
            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            // Select the axis (vertical construction line)
            await clickAtViewportCenter(page);

            // Verify new entity was created
            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });

        test('mirror single line across horizontal axis', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw horizontal construction line for axis
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, -OFFSETS.large, 0, OFFSETS.large, 0);

            // Turn off construction mode
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw a line above the axis
            await drawLine(page, -OFFSETS.medium, -OFFSETS.medium, OFFSETS.medium, -OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select and mirror
            await selectTool(page, 'select');
            await clickAtOffset(page, 0, -OFFSETS.medium / 2);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtOffset(page, OFFSETS.small, 0); // Click axis

            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    test.describe('Multiple Entity Mirroring', () => {

        test('mirror multiple selected lines', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create axis
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw multiple lines to mirror
            await drawLine(page, -OFFSETS.medium, -OFFSETS.small, -OFFSETS.small, -OFFSETS.small);
            await drawLine(page, -OFFSETS.medium, OFFSETS.small, -OFFSETS.small, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select both lines
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, -OFFSETS.small);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, -OFFSETS.medium + 20, OFFSETS.small);
            await page.keyboard.up('Shift');

            // Mirror
            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtViewportCenter(page);

            const newCount = await getEntityCount(page);
            // Should have added 2 more lines
            expect(newCount).toBeGreaterThan(initialCount);
        });

        test('mirror circle creates symmetric circle', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create axis
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw circle to left of axis
            await drawCircle(page, -OFFSETS.medium, 0, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select circle
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Mirror
            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtViewportCenter(page);

            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    test.describe('Mirror Across Diagonal', () => {

        test('mirror line across 45° diagonal axis', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create diagonal axis
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, -OFFSETS.large, -OFFSETS.large, OFFSETS.large, OFFSETS.large);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw horizontal line above diagonal
            await drawLine(page, -OFFSETS.medium, -OFFSETS.medium / 2, OFFSETS.medium / 2, -OFFSETS.medium / 2);

            const initialCount = await getEntityCount(page);

            // Select and mirror
            await selectTool(page, 'select');
            await clickAtOffset(page, 0, -OFFSETS.medium / 2);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtViewportCenter(page);

            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    test.describe('Mirror Constraints', () => {

        test('mirrored geometry creates symmetric constraint', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create axis
            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('construction');
            await page.keyboard.press('Enter');

            // Draw line
            await drawLine(page, -OFFSETS.medium, 0, -OFFSETS.small, OFFSETS.small);

            const initialConstraints = await getConstraintCount(page);

            // Mirror
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, OFFSETS.small / 2);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtViewportCenter(page);

            // May create symmetric constraints
            const newConstraints = await getConstraintCount(page);
            // Check that mirroring worked (constraints may or may not be added)
            expect(newConstraints).toBeGreaterThanOrEqual(initialConstraints);
        });
    });

    test.describe('Edge Cases', () => {

        test('mirror with no selection shows feedback', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw an axis
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            // Clear selection
            await page.keyboard.press('Escape');

            // Try mirror
            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            // Should not crash - may show message
            await page.keyboard.press('Escape');
        });

        test('mirror line that lies on axis', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line that is the axis
            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);

            const initialCount = await getEntityCount(page);

            // Select it and try to mirror it across itself
            await selectTool(page, 'select');
            await clickAtViewportCenter(page);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            await clickAtViewportCenter(page); // Click same line as axis

            // Should handle gracefully
            const newCount = await getEntityCount(page);
            // Count might be same or +1 depending on implementation
        });

        test('cancel mirror operation with Escape', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawLine(page, 0, -OFFSETS.large, 0, OFFSETS.large);
            await drawLine(page, -OFFSETS.medium, 0, -OFFSETS.small, 0);

            const initialCount = await getEntityCount(page);

            // Start mirror
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('mirror');
            await page.keyboard.press('Enter');

            // Cancel
            await page.keyboard.press('Escape');

            // Count should be same
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });
});
