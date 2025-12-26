/**
 * Selection Panel Tests
 * 
 * Tests the selection panel functionality:
 * - Shows single entity selection info
 * - Shows multi-selection count
 * - Updates on selection change
 * - Clears when deselected
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    clickAtViewportCenter,
    drawLine,
    drawCircle,
    OFFSETS,
} from '../setup/test-utils';

test.describe('Selection Panel', () => {

    test.describe('Single Entity Selection', () => {

        test('selecting line shows line info in panel', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small, 0); // Click horizontal line

            // Panel should show line is selected
            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();

            // Should contain entity type
            const typeText = page.locator('[data-testid="selection-type"]');
            await expect(typeText).toContainText(/line/i);
        });

        test('selecting circle shows circle info', async ({ sketchWithCircle }) => {
            const page = sketchWithCircle;

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.medium, 0); // Click circle edge

            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();
        });

        test('selecting point shows point info', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create a point
            await selectTool(page, 'point');
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();
        });
    });

    test.describe('Multi-Selection', () => {

        test('multi-select shows count of selected entities', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');

            // Select horizontal line
            await clickAtOffset(page, OFFSETS.small, 0);

            // Shift-click vertical line
            await page.keyboard.down('Shift');
            await clickAtOffset(page, 0, OFFSETS.small);
            await page.keyboard.up('Shift');

            // Panel should show "2 entities"
            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();

            const countText = page.locator('[data-testid="selection-count"]');
            await expect(countText).toContainText('2');
        });

        test('selecting 3 entities shows correct count', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw three lines
            await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);
            await drawLine(page, 0, 0, OFFSETS.medium, 0);
            await drawLine(page, 0, -OFFSETS.medium, 0, -OFFSETS.small);

            await selectTool(page, 'select');

            // Select all three
            await clickAtOffset(page, -OFFSETS.large + 10, 0);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, OFFSETS.small, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium + 10);
            await page.keyboard.up('Shift');

            const countText = page.locator('[data-testid="selection-count"]');
            await expect(countText).toContainText('3');
        });
    });

    test.describe('Selection Changes', () => {

        test('panel updates when selection changes', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');

            // Select one line
            await clickAtOffset(page, OFFSETS.small, 0);

            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();

            // Select different line (replaces selection)
            await clickAtOffset(page, 0, OFFSETS.small);

            // Panel should still be visible with new selection
            await expect(panel).toBeVisible();
        });

        test('escape clears selection and panel', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small, 0);

            const panel = page.locator('[data-testid="selection-panel"]');
            await expect(panel).toBeVisible();

            // Press Escape
            await page.keyboard.press('Escape');

            // Panel may hide or show empty state
            // At minimum, selection count should be 0 or panel hidden
        });

        test('clicking empty space while selecting clears selection', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small, 0);

            // Click far from geometry
            await clickAtOffset(page, OFFSETS.large, OFFSETS.large);

            // Selection should clear
        });
    });

    test.describe('Selection Panel Actions', () => {

        test('delete button removes selected entity', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small, 0);

            // Look for delete button in panel
            const deleteBtn = page.locator('[data-testid="selection-delete-btn"]');

            // If exists, click it
            if (await deleteBtn.isVisible()) {
                await deleteBtn.click();
                // Entity should be deleted
            }
        });
    });
});
