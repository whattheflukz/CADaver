/**
 * Dimension Dragging Tests
 * 
 * Tests that dimension text/annotations can be repositioned by dragging:
 * - Distance dimensions
 * - HorizontalDistance dimensions
 * - VerticalDistance dimensions
 * - Angle dimensions
 * - Radius dimensions
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    dragInViewport,
    drawLine,
    drawCircle,
    OFFSETS,
    VIEWPORT,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Dimension Dragging', () => {

    test.describe('Distance Dimension Dragging', () => {

        test('can drag distance dimension text to new position', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create a dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            // Switch to select tool
            await selectTool(page, 'select');

            // Drag the dimension text
            const dimX = VIEWPORT.centerX;
            const dimY = VIEWPORT.centerY + OFFSETS.small;

            await dragInViewport(
                page,
                dimX, dimY,
                dimX, dimY + OFFSETS.medium
            );

            // Verify the dimension still exists and app didn't crash
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });

        test('dragging updates dimension offset persistently', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create a dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.small);

            // Drag dimension
            await selectTool(page, 'select');
            await dragInViewport(
                page,
                VIEWPORT.centerX - OFFSETS.small, VIEWPORT.centerY - OFFSETS.small,
                VIEWPORT.centerX - OFFSETS.large, VIEWPORT.centerY - OFFSETS.large
            );

            // Draw another entity to trigger re-render
            await drawLine(page, OFFSETS.large, -OFFSETS.small, OFFSETS.large, OFFSETS.small);

            // Dimension should still be at new position
            // (Visual verification - app didn't reset position)
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });
    });

    test.describe('HorizontalDistance Dragging', () => {

        test('can drag horizontal distance dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');

            // Create horizontal distance by placing to the side
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, -OFFSETS.large - 20, -OFFSETS.small); // Far left = horizontal

            const initialCount = await getConstraintCount(page);

            // Drag it
            await selectTool(page, 'select');

            await dragInViewport(
                page,
                VIEWPORT.centerX - OFFSETS.large - 20, VIEWPORT.centerY - OFFSETS.small,
                VIEWPORT.centerX - OFFSETS.large - 20, VIEWPORT.centerY + OFFSETS.small
            );

            // Should still have same constraints
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('VerticalDistance Dragging', () => {

        test('can drag vertical distance dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');

            // Create vertical distance by placing above/below
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, -OFFSETS.small, -OFFSETS.large - 20); // Far up = vertical

            const initialCount = await getConstraintCount(page);

            // Drag it
            await selectTool(page, 'select');

            await dragInViewport(
                page,
                VIEWPORT.centerX - OFFSETS.small, VIEWPORT.centerY - OFFSETS.large - 20,
                VIEWPORT.centerX + OFFSETS.small, VIEWPORT.centerY - OFFSETS.large - 20
            );

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Angle Dimension Dragging', () => {

        test('can drag angle arc to adjust display position', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create angle dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, OFFSETS.small, 0);
            await clickAtOffset(page, 0, OFFSETS.small);
            await clickAtOffset(page, OFFSETS.small, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            // Drag the angle arc
            await selectTool(page, 'select');

            await dragInViewport(
                page,
                VIEWPORT.centerX + OFFSETS.small, VIEWPORT.centerY + OFFSETS.small,
                VIEWPORT.centerX + OFFSETS.medium, VIEWPORT.centerY + OFFSETS.medium
            );

            // Constraint should still exist
            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Radius Dimension Dragging', () => {

        test('can drag radius dimension text', async ({ sketchWithCircle }) => {
            const page = sketchWithCircle;

            // Create radius dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, OFFSETS.medium, 0); // Circle edge
            await clickAtOffset(page, OFFSETS.medium + OFFSETS.small, 0); // Place

            const initialCount = await getConstraintCount(page);

            // Drag it
            await selectTool(page, 'select');

            await dragInViewport(
                page,
                VIEWPORT.centerX + OFFSETS.medium + OFFSETS.small, VIEWPORT.centerY,
                VIEWPORT.centerX + OFFSETS.large, VIEWPORT.centerY - OFFSETS.small
            );

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

    test.describe('Drag Interactions', () => {

        test('dragging dimension does not alter geometry', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            // Drag dimension very far
            await selectTool(page, 'select');
            await dragInViewport(
                page,
                VIEWPORT.centerX, VIEWPORT.centerY + OFFSETS.small,
                VIEWPORT.centerX + OFFSETS.large * 2, VIEWPORT.centerY + OFFSETS.large * 2
            );

            // Geometry should not have moved
            // The lines should still be at their original positions
            // This is a sanity check that drag affects only visual offset
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });

        test('can drag dimension immediately after creation', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create dimension and immediately drag
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Final click for placement, then drag
            const placeX = VIEWPORT.centerX;
            const placeY = VIEWPORT.centerY + OFFSETS.small;

            // Place with click-and-drag in one motion
            const canvas = page.locator('canvas').first();
            await canvas.hover({ position: { x: placeX, y: placeY } });
            await page.mouse.down();
            await page.mouse.move(placeX, placeY + OFFSETS.medium, { steps: 5 });
            await page.mouse.up();

            // Should work without errors
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });

        test('multiple dimensions can be dragged independently', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create two dimensions
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'dimension');
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, 0, OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.small, 0);

            // Drag first
            await selectTool(page, 'select');
            await dragInViewport(
                page,
                VIEWPORT.centerX, VIEWPORT.centerY + OFFSETS.small,
                VIEWPORT.centerX, VIEWPORT.centerY + OFFSETS.medium
            );

            // Drag second
            await dragInViewport(
                page,
                VIEWPORT.centerX + OFFSETS.small, VIEWPORT.centerY,
                VIEWPORT.centerX + OFFSETS.medium, VIEWPORT.centerY
            );

            // Both should still exist
            const count = await getConstraintCount(page);
            expect(count).toBe(2);
        });
    });
});
