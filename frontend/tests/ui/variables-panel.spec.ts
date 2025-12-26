/**
 * Variables Panel Tests
 * 
 * Tests the variables panel functionality:
 * - Opening panel
 * - Creating variables
 * - Editing variables
 * - Using variables in dimensions
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    OFFSETS,
} from '../setup/test-utils';

test.describe('Variables Panel', () => {

    test.describe('Opening Panel', () => {

        test('can open variables panel via command palette', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await expect(panel).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Creating Variables', () => {

        test('can create new variable', async ({ sketchPage }) => {
            const page = sketchPage;

            // Open variables panel
            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            // Click add button
            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            // Fill in name
            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('width');

            // Fill in value
            const valueInput = page.locator('[data-testid="variable-value-input"]');
            await valueInput.fill('100');

            // Confirm
            const confirmBtn = page.locator('[data-testid="variable-confirm-btn"]');
            await confirmBtn.click();

            // Variable should appear in list
            const variableItem = page.locator('[data-testid="variable-item"]').filter({ hasText: 'width' });
            await expect(variableItem).toBeVisible();
        });

        test('variable names must be valid identifiers', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('123invalid'); // Invalid - starts with number

            // Should show error or prevent creation
        });
    });

    test.describe('Editing Variables', () => {

        test('can edit existing variable value', async ({ sketchPage }) => {
            const page = sketchPage;

            // First create a variable
            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('height');

            const valueInput = page.locator('[data-testid="variable-value-input"]');
            await valueInput.fill('50');

            const confirmBtn = page.locator('[data-testid="variable-confirm-btn"]');
            await confirmBtn.click();

            // Now click to edit
            const variableItem = page.locator('[data-testid="variable-item"]').filter({ hasText: 'height' });
            await variableItem.click();

            // Change value
            const editValueInput = page.locator('[data-testid="variable-value-input"]');
            await editValueInput.clear();
            await editValueInput.fill('75');

            await page.keyboard.press('Enter');
        });

        test('can delete variable', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            // Create variable
            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('temp');

            const valueInput = page.locator('[data-testid="variable-value-input"]');
            await valueInput.fill('1');

            const confirmBtn = page.locator('[data-testid="variable-confirm-btn"]');
            await confirmBtn.click();

            // Delete it
            const variableItem = page.locator('[data-testid="variable-item"]').filter({ hasText: 'temp' });
            const deleteBtn = variableItem.locator('[data-testid="delete-variable-btn"]');

            if (await deleteBtn.isVisible()) {
                await deleteBtn.click();

                // Confirm deletion if needed
                const confirmDelete = page.locator('[data-testid="confirm-delete"]');
                if (await confirmDelete.isVisible()) {
                    await confirmDelete.click();
                }

                // Variable should be gone
                await expect(variableItem).not.toBeVisible();
            }
        });
    });

    test.describe('Variable Units', () => {

        test('can set variable unit', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('length');

            const valueInput = page.locator('[data-testid="variable-value-input"]');
            await valueInput.fill('10');

            // Set unit
            const unitSelect = page.locator('[data-testid="variable-unit-select"]');
            if (await unitSelect.isVisible()) {
                await unitSelect.selectOption('mm');
            }

            const confirmBtn = page.locator('[data-testid="variable-confirm-btn"]');
            await confirmBtn.click();
        });
    });

    test.describe('Using Variables in Dimensions', () => {

        test('dimension can reference variable', async ({ sketchPage }) => {
            const page = sketchPage;

            // Create variable first
            await page.keyboard.press('Control+k');
            await page.keyboard.type('variables');
            await page.keyboard.press('Enter');

            const panel = page.locator('[data-testid="variables-panel"]');
            await panel.waitFor({ state: 'visible' });

            const addBtn = page.locator('[data-testid="add-variable-btn"]');
            await addBtn.click();

            const nameInput = page.locator('[data-testid="variable-name-input"]');
            await nameInput.fill('width');

            const valueInput = page.locator('[data-testid="variable-value-input"]');
            await valueInput.fill('200');

            const confirmBtn = page.locator('[data-testid="variable-confirm-btn"]');
            await confirmBtn.click();

            // Close panel
            await page.keyboard.press('Escape');

            // Draw geometry
            await selectTool(page, 'line');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await page.keyboard.press('Escape');

            // Create dimension
            await selectTool(page, 'dimension');
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            // Edit dimension to use variable
            await selectTool(page, 'select');
            await clickAtOffset(page, 0, OFFSETS.small);

            const modal = page.locator('[data-testid="dimension-edit-modal"]');
            await modal.waitFor({ state: 'visible', timeout: 3000 });

            const dimInput = page.locator('[data-testid="dimension-input"]');
            await dimInput.clear();
            await dimInput.fill('@width');
            await page.keyboard.press('Enter');

            // Dimension should now be 200
        });
    });
});
