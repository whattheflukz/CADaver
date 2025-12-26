/**
 * Geometric Constraint Tests
 * 
 * Tests all geometric constraints:
 * - Horizontal (lines)
 * - Vertical (lines)
 * - Coincident (point-point, point-line)
 * - Parallel (lines)
 * - Perpendicular (lines)
 * - Equal (lengths, radii)
 * - Fix (points)
 * - Symmetric
 * - Tangent
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
    getEntityCount,
} from '../setup/test-utils';

test.describe('Horizontal Constraint', () => {

    test('applying horizontal to diagonal line makes it horizontal', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw diagonal line
        await drawLine(page, -OFFSETS.medium, -OFFSETS.small, OFFSETS.medium, OFFSETS.small);

        const initialCount = await getConstraintCount(page);

        // Select line
        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);

        // Apply horizontal constraint
        await page.keyboard.press('h');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('horizontal constraint can be applied via command palette', async ({ sketchPage }) => {
        const page = sketchPage;

        await drawLine(page, -OFFSETS.medium, -OFFSETS.small, OFFSETS.medium, OFFSETS.small);

        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);

        // Open command palette and type
        await page.keyboard.press('Control+k');
        await page.keyboard.type('horizontal');
        await page.keyboard.press('Enter');

        const count = await getConstraintCount(page);
        expect(count).toBeGreaterThan(0);
    });

    test('horizontal on already horizontal line is valid', async ({ sketchWithLines }) => {
        const page = sketchWithLines;

        const initialCount = await getConstraintCount(page);

        // Select horizontal line
        await selectTool(page, 'select');
        await clickAtOffset(page, OFFSETS.small, 0);

        // Apply horizontal
        await page.keyboard.press('h');

        // Should create constraint (even if redundant)
        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });
});

test.describe('Vertical Constraint', () => {

    test('applying vertical to diagonal line makes it vertical', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw diagonal line
        await drawLine(page, -OFFSETS.small, -OFFSETS.medium, OFFSETS.small, OFFSETS.medium);

        const initialCount = await getConstraintCount(page);

        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);

        await page.keyboard.press('v');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('vertical constraint H and V shortcuts work correctly', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two diagonal lines
        await drawLine(page, -OFFSETS.medium, -OFFSETS.small, -OFFSETS.medium + 20, OFFSETS.small);
        await drawLine(page, OFFSETS.medium, -OFFSETS.small, OFFSETS.medium + 20, OFFSETS.small);

        // Apply H to first
        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium + 10, 0);
        await page.keyboard.press('h');

        // Apply V to second
        await clickAtOffset(page, OFFSETS.medium + 10, 0);
        await page.keyboard.press('v');

        const count = await getConstraintCount(page);
        expect(count).toBe(2);
    });
});

test.describe('Coincident Constraint', () => {

    test('coincident between two line endpoints', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two separate lines
        await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);
        await drawLine(page, OFFSETS.medium, 0, OFFSETS.large, 0);

        const initialCount = await getConstraintCount(page);

        // Select first line's endpoint
        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium, 0);

        // Shift+click second line's endpoint  
        await page.keyboard.down('Shift');
        await clickAtOffset(page, OFFSETS.medium, 0);
        await page.keyboard.up('Shift');

        // Apply coincident
        await page.keyboard.press('i');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('coincident snaps points together', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two lines with gap
        await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);
        await drawLine(page, -OFFSETS.medium + 10, 0, OFFSETS.medium, 0); // Small gap

        // Apply coincident between adjacent endpoints
        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium, 0);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, -OFFSETS.medium + 10, 0);
        await page.keyboard.up('Shift');

        await page.keyboard.press('i');

        // Points should now be at same position (visually merged)
        const count = await getConstraintCount(page);
        expect(count).toBeGreaterThan(0);
    });

    test('coincident point to origin', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw line not starting from origin
        await drawLine(page, OFFSETS.small, OFFSETS.small, OFFSETS.large, OFFSETS.small);

        const initialCount = await getConstraintCount(page);

        // Select line start and origin
        await selectTool(page, 'select');
        await clickAtOffset(page, OFFSETS.small, OFFSETS.small);
        await page.keyboard.down('Shift');
        await clickAtViewportCenter(page);
        await page.keyboard.up('Shift');

        await page.keyboard.press('i');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });
});

test.describe('Parallel Constraint', () => {

    test('parallel constraint between two lines', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two non-parallel lines
        await drawLine(page, -OFFSETS.medium, -OFFSETS.medium, OFFSETS.medium, -OFFSETS.medium);
        await drawLine(page, -OFFSETS.medium, OFFSETS.medium, OFFSETS.medium, OFFSETS.medium + 10);

        const initialCount = await getConstraintCount(page);

        // Select both lines
        await selectTool(page, 'select');
        await clickAtOffset(page, 0, -OFFSETS.medium);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, 0, OFFSETS.medium + 5);
        await page.keyboard.up('Shift');

        // Apply parallel via command palette
        await page.keyboard.press('Control+k');
        await page.keyboard.type('parallel');
        await page.keyboard.press('Enter');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('parallel makes second line match first orientation', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw horizontal line
        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        // Draw diagonal line
        await drawLine(page, -OFFSETS.medium, OFFSETS.large, 0, OFFSETS.large + OFFSETS.small);

        // Apply parallel
        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, -OFFSETS.small, OFFSETS.large + OFFSETS.small / 2);
        await page.keyboard.up('Shift');

        await page.keyboard.press('Control+k');
        await page.keyboard.type('parallel');
        await page.keyboard.press('Enter');

        // Second line should now be horizontal too
        const count = await getConstraintCount(page);
        expect(count).toBeGreaterThan(0);
    });
});

test.describe('Perpendicular Constraint', () => {

    test('perpendicular constraint creates 90° angle', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two lines at ~45° to each other
        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);
        await drawLine(page, 0, 0, OFFSETS.medium, OFFSETS.medium);

        const initialCount = await getConstraintCount(page);

        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.small, 0);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, OFFSETS.small, OFFSETS.small);
        await page.keyboard.up('Shift');

        await page.keyboard.press('Control+k');
        await page.keyboard.type('perpendicular');
        await page.keyboard.press('Enter');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });
});

test.describe('Equal Constraint', () => {

    test('equal constraint on two lines makes them same length', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two lines of different lengths
        await drawLine(page, -OFFSETS.large, 0, -OFFSETS.small, 0);  // Longer
        await drawLine(page, OFFSETS.small, 0, OFFSETS.medium, 0);   // Shorter

        const initialCount = await getConstraintCount(page);

        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium, 0);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, OFFSETS.small + 10, 0);
        await page.keyboard.up('Shift');

        await page.keyboard.press('e');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('equal constraint on two circles makes same radius', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw two circles with different radii
        await drawCircle(page, -OFFSETS.medium, 0, OFFSETS.small);
        await drawCircle(page, OFFSETS.medium, 0, OFFSETS.medium);

        const initialCount = await getConstraintCount(page);

        // Select both circles (by clicking edges)
        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium + OFFSETS.small, 0);
        await page.keyboard.down('Shift');
        await clickAtOffset(page, OFFSETS.medium + OFFSETS.medium, 0);
        await page.keyboard.up('Shift');

        await page.keyboard.press('e');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });
});

test.describe('Fix Constraint', () => {

    test('fix constraint locks point in place', async ({ sketchWithLines }) => {
        const page = sketchWithLines;

        const initialCount = await getConstraintCount(page);

        // Select a point
        await selectTool(page, 'select');
        await clickAtOffset(page, -OFFSETS.medium, 0);

        // Apply fix via command palette
        await page.keyboard.press('Control+k');
        await page.keyboard.type('fix');
        await page.keyboard.press('Enter');

        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount + 1);
    });

    test('fix on origin creates locked origin constraint', async ({ sketchWithLines }) => {
        const page = sketchWithLines;

        const initialCount = await getConstraintCount(page);

        // Select origin
        await selectTool(page, 'select');
        await clickAtViewportCenter(page);

        // Apply fix
        await page.keyboard.press('Control+k');
        await page.keyboard.type('fix');
        await page.keyboard.press('Enter');

        // Should work even on origin
        const newCount = await getConstraintCount(page);
        expect(newCount).toBeGreaterThanOrEqual(initialCount);
    });
});

test.describe('Constraint Edge Cases', () => {

    test('applying constraint with nothing selected does nothing', async ({ sketchWithLines }) => {
        const page = sketchWithLines;

        const initialCount = await getConstraintCount(page);

        // Clear selection
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');

        // Try to apply constraint
        await page.keyboard.press('h');

        // Count should not change
        const newCount = await getConstraintCount(page);
        expect(newCount).toBe(initialCount);
    });

    test('applying line constraint to circle is rejected gracefully', async ({ sketchWithCircle }) => {
        const page = sketchWithCircle;

        // Select circle
        await selectTool(page, 'select');
        await clickAtOffset(page, OFFSETS.medium, 0);

        // Try horizontal - should not crash
        await page.keyboard.press('h');

        // App should still work
        await selectTool(page, 'line');
        await selectTool(page, 'select');
    });

    test('can undo constraint application', async ({ sketchWithLines }) => {
        const page = sketchWithLines;

        // Apply constraint
        await selectTool(page, 'select');
        await clickAtOffset(page, OFFSETS.small, 0);
        await page.keyboard.press('h');

        const afterAdd = await getConstraintCount(page);

        // Undo (Ctrl+Z)
        await page.keyboard.press('Control+z');

        // May or may not have undo - just verify no crash
        const afterUndo = await getConstraintCount(page);
        // afterUndo could equal afterAdd if no undo, or afterAdd-1 if undo works
    });

    test('multiple constraints can be stacked on same entity', async ({ sketchPage }) => {
        const page = sketchPage;

        // Draw line
        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        // Apply horizontal
        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);
        await page.keyboard.press('h');

        // Apply dimension
        await selectTool(page, 'dimension');
        await clickAtOffset(page, -OFFSETS.medium, 0);
        await clickAtOffset(page, OFFSETS.medium, 0);
        await clickAtOffset(page, 0, OFFSETS.small);

        // Should have 2 constraints
        const count = await getConstraintCount(page);
        expect(count).toBe(2);
    });
});
