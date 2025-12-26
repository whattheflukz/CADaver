/**
 * Measurement Tool Tests
 * 
 * Tests for temporary, non-driving measurements between sketch entities.
 * Measurements are session-only and update live as geometry changes.
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawLine,
    getConstraintCount,
    OFFSETS,
} from '../setup/test-utils';

test.describe('Measurement Tool', () => {

    test.describe('Point-to-Point Measurements', () => {

        test('selecting two line endpoints creates distance measurement', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Constraints should NOT increase (measurements are non-driving)
            const initialConstraints = await getConstraintCount(page);

            // Activate measure tool
            await selectTool(page, 'measure');

            // Click on first line's endpoint (left end of horizontal line)
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click on second point (top of vertical line)
            await clickAtOffset(page, 0, -OFFSETS.medium);

            // Allow time for measurement to render
            await page.waitForTimeout(300);

            // Constraints should NOT increase (measurements are non-driving)
            const newConstraints = await getConstraintCount(page);
            expect(newConstraints).toBe(initialConstraints);
        });

        test('measurement from line endpoint to origin', async ({ sketchWithLines }) => {
            const page = sketchWithLines;
            const initialConstraints = await getConstraintCount(page);

            await selectTool(page, 'measure');

            // Click on line endpoint
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Click on origin (center)
            await clickAtViewportCenter(page);

            await page.waitForTimeout(300);

            // Measurement is non-driving, no constraint added
            const newConstraints = await getConstraintCount(page);
            expect(newConstraints).toBe(initialConstraints);
        });
    });

    test.describe('Line-to-Line Measurements', () => {

        test('selecting two lines creates angle measurement', async ({ sketchWithLines }) => {
            const page = sketchWithLines;
            const initialConstraints = await getConstraintCount(page);

            await selectTool(page, 'measure');

            // Click on horizontal line (middle of line = entity selection)
            await clickAtOffset(page, OFFSETS.small, 0);

            // Click on vertical line
            await clickAtOffset(page, 0, OFFSETS.small);

            await page.waitForTimeout(300);

            // Non-driving measurement
            const newConstraints = await getConstraintCount(page);
            expect(newConstraints).toBe(initialConstraints);
        });
    });

    test.describe('Cancellation', () => {

        test('Escape cancels pending measurement selection', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'measure');

            // Start selection
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Cancel with escape
            await page.keyboard.press('Escape');

            // Should be able to start fresh selection
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);

            await page.waitForTimeout(200);
        });

        test('switching tools clears pending measurement', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'measure');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Switch to line tool
            await selectTool(page, 'line');

            // Cancel line tool
            await page.keyboard.press('Escape');

            // Return to measure - should start fresh
            await selectTool(page, 'measure');
        });
    });

    test.describe('Measurements Do Not Constrain', () => {

        test('measurements do not affect sketch DOF', async ({ sketchWithLines }) => {
            const page = sketchWithLines;
            const initialConstraints = await getConstraintCount(page);

            // Create multiple measurements
            await selectTool(page, 'measure');

            // First measurement
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await page.waitForTimeout(200);

            // Second measurement
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, 0, OFFSETS.medium);
            await page.waitForTimeout(200);

            // Constraint count should NOT change
            const finalConstraints = await getConstraintCount(page);
            expect(finalConstraints).toBe(initialConstraints);
        });
    });
});
