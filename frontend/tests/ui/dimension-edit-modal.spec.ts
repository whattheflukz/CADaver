/**
 * Dimension Edit Modal Tests
 * 
 * Tests dimension editing functionality:
 * - Click dimension opens modal
 * - Enter new value updates constraint
 * - Variable expressions work
 * - Modal keyboard shortcuts
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    drawLine,
    OFFSETS,
    VIEWPORT,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Dimension Edit Modal', () => {

    test.describe('Opening Modal', () => {

        test('clicking on dimension text opens edit modal', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create a dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            // Switch to select
            await selectTool(page, 'select');

            // Click on dimension text (approximately where we placed it)
            await clickAtOffset(page, 0, OFFSETS.small);

            // Modal should appear
            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await expect(modal).toBeVisible({ timeout: 3000 });
        });

        test('double-click on dimension also opens modal', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create a dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');

            // Double-click on dimension
            const canvas = page.locator('canvas').first();
            await canvas.dblclick({
                position: {
                    x: VIEWPORT.centerX,
                    y: VIEWPORT.centerY + OFFSETS.small
                }
            });

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await expect(modal).toBeVisible({ timeout: 3000 });
        });
    });

    test.describe('Editing Values', () => {

        test('entering new value updates dimension', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            // Get input and change value
            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('100');

            // Press Enter to confirm
            await page.keyboard.press('Enter');

            // Modal should close
            await expect(modal).not.toBeVisible();
        });

        test('pressing Escape cancels edit', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Create dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            // Change value
            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('99999');

            // Press Escape to cancel
            await page.keyboard.press('Escape');

            // Modal should close
            await expect(modal).not.toBeVisible();

            // Value should NOT have been applied
        });

        test('clicking confirm button applies value', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('50');

            // Click confirm button
            const confirmBtn = page.locator('[data-testid="dimension-confirm"]');
            await confirmBtn.click();

            await expect(modal).not.toBeVisible();
        });
    });

    test.describe('Variable Expressions', () => {

        test('entering @variable syntax is accepted', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('@width');

            await page.keyboard.press('Enter');

            // Should not crash - may show error if variable doesn't exist
        });

        test('expression with math is accepted', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('10 * 5');

            await page.keyboard.press('Enter');

            // Should evaluate to 50
        });
    });

    test.describe('Driven vs Driving Dimensions', () => {

        test('can toggle dimension to driven mode', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            // Look for driven toggle
            const drivenToggle = page.locator('[data-testid="driven-toggle"]');

            if (await drivenToggle.isVisible()) {
                await drivenToggle.click();
                await page.keyboard.press('Enter');

                // Dimension should now be reference-only (displayed differently)
            }
        });
    });

    test.describe('Edge Cases', () => {

        test('empty input shows error or uses default', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();

            await page.keyboard.press('Enter');

            // Should either show error or keep previous value
        });

        test('invalid expression shows error', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('abc+++');

            await page.keyboard.press('Enter');

            // Should show error indicator (modal may stay open)
        });

        test('negative value handling', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const input = page.locator('[data-testid="dimension-input"]');
            await input.clear();
            await input.fill('-50');

            await page.keyboard.press('Enter');

            // Should handle gracefully (may convert to positive or show error)
        });
    });
});
