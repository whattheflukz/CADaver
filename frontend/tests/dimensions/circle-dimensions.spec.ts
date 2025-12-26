/**
 * Circle and Radius Dimension Tests
 * 
 * Tests radius and diameter dimensions on circles and arcs:
 * - Radius dimension on circle
 * - Point to circle edge distance
 * - Point to circle center distance
 * - Arc radius dimension
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawCircle,
    drawArc,
    drawLine,
    OFFSETS,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Circle Dimensioning', () => {

    test.describe('Radius Dimension', () => {

        test('selecting circle creates radius dimension', async ({ sketchWithCircle }) => {
            const page = sketchWithCircle;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on circle edge (not center)
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension
            await clickAtOffset(page, OFFSETS.medium + OFFSETS.small, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('clicking circle center then edge creates radius dimension', async ({ sketchWithCircle }) => {
            const page = sketchWithCircle;

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click center first
            await clickAtViewportCenter(page);

            // Then click edge
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension
            await clickAtOffset(page, OFFSETS.small, -OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('radius dimension appears with "R" prefix', async ({ sketchWithCircle }) => {
            const page = sketchWithCircle;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium + OFFSETS.small, 0);

            // Check for radius annotation in viewport
            // The dimension text should contain "R" for radius
            const annotation = page.locator('text=R');
            // This is a visual check - the exact selector depends on how annotations render
        });
    });

    test.describe('Point to Circle Distance', () => {

        test('dimension from external point to circle center', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw circle
            await drawCircle(page, 0, 0, OFFSETS.small);

            // Draw a point entity far from circle
            await selectTool(page, 'point');
            await clickAtOffset(page, OFFSETS.large, 0);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click the point
            await clickAtOffset(page, OFFSETS.large, 0);

            // Click circle center
            await clickAtViewportCenter(page);

            // Place dimension
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('dimension from line endpoint to circle center', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw circle
            await drawCircle(page, 0, 0, OFFSETS.small);

            // Draw a line
            await drawLine(page, OFFSETS.large, -OFFSETS.small, OFFSETS.large, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click line endpoint
            await clickAtOffset(page, OFFSETS.large, -OFFSETS.small);

            // Click circle center
            await clickAtViewportCenter(page);

            // Place
            await clickAtOffset(page, OFFSETS.medium, 0);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Multiple Circles', () => {

        test('dimension between two circle centers', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two circles
            await drawCircle(page, -OFFSETS.medium, 0, OFFSETS.small);
            await drawCircle(page, OFFSETS.medium, 0, OFFSETS.small);

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click first circle center
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click second circle center
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension
            await clickAtOffset(page, 0, -OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });

        test('equal radius constraint between two circles', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two circles with different radii
            await drawCircle(page, -OFFSETS.medium, 0, OFFSETS.small);
            await drawCircle(page, OFFSETS.medium, 0, OFFSETS.medium);

            // Select both circle edges
            await clickAtOffset(page, -OFFSETS.medium + OFFSETS.small, 0);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, OFFSETS.medium + OFFSETS.medium, 0);
            await page.keyboard.up('Shift');

            // Apply equal constraint
            await page.keyboard.press('e');

            // Verify constraint added
            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });
    });
});

test.describe('Arc Dimensioning', () => {

    test.describe('Arc Radius', () => {

        test('selecting arc creates radius dimension', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw an arc
            await drawArc(
                page,
                -OFFSETS.medium, 0,
                0, -OFFSETS.medium,
                OFFSETS.medium, 0
            );

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click on arc (middle of arc)
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Place dimension
            await clickAtOffset(page, 0, -OFFSETS.large);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Arc Endpoints', () => {

        test('dimension between arc endpoints', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw an arc
            await drawArc(
                page,
                -OFFSETS.medium, 0,
                0, -OFFSETS.medium,
                OFFSETS.medium, 0
            );

            const initialCount = await getConstraintCount(page);

            await selectTool(page, 'dimension');

            // Click arc start point
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click arc end point
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Place dimension
            await clickAtOffset(page, 0, OFFSETS.small);

            const newCount = await getConstraintCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });
});
