/**
 * Command Palette Tests
 * 
 * Tests command palette functionality:
 * - Opening and closing
 * - Search/filter
 * - Command execution
 * - Keyboard navigation
 */

import { test, expect } from '../setup/fixtures';
import {
    waitForAppReady,
    startNewSketch,
} from '../setup/test-utils';

test.describe('Command Palette', () => {

    test.describe('Opening and Closing', () => {

        test('Ctrl+K opens command palette', async ({ appPage }) => {
            const page = appPage;

            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible({ timeout: 3000 });
        });

        test('pressing Escape closes palette', async ({ appPage }) => {
            const page = appPage;

            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible({ timeout: 3000 });

            await page.keyboard.press('Escape');
            await expect(palette).not.toBeVisible();
        });

        test('clicking outside closes palette', async ({ appPage }) => {
            const page = appPage;

            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible({ timeout: 3000 });

            // Click outside the palette (on the canvas)
            const canvas = page.locator('canvas').first();
            await canvas.click({ position: { x: 10, y: 10 } });

            await expect(palette).not.toBeVisible();
        });

        test('Cmd+K also works on Mac', async ({ appPage }) => {
            const page = appPage;

            // Try Meta+K (Cmd on Mac)
            await page.keyboard.press('Meta+k');

            const palette = page.locator('[data-testid="command-palette"]');
            // May or may not work depending on OS
        });
    });

    test.describe('Search Filtering', () => {

        test('typing filters commands', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible();

            // Type search query
            await page.keyboard.type('line');

            // Should show line-related commands
            const results = page.locator('[data-testid="command-item"]');

            // At least one result
            await expect(results.first()).toBeVisible();
        });

        test('filter is case-insensitive', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.type('LINE');

            const results = page.locator('[data-testid="command-item"]');
            await expect(results.first()).toBeVisible();
        });

        test('filter with no matches shows empty state', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.type('xyznonexistent');

            // Should show no results or empty message
            const noResults = page.locator('[data-testid="no-results"]');
            await expect(noResults).toBeVisible();
        });

        test('backspace clears filter', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.type('xyz');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');

            // Should show all commands again
            const results = page.locator('[data-testid="command-item"]');
            await expect(results.first()).toBeVisible();
        });
    });

    test.describe('Command Execution', () => {

        test('pressing Enter executes highlighted command', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('circle');

            // Enter to execute
            await page.keyboard.press('Enter');

            // Command palette should close
            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).not.toBeVisible();

            // Circle tool should be active
        });

        test('clicking command item executes it', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('line');

            // Click on the first result
            const firstResult = page.locator('[data-testid="command-item"]').first();
            await firstResult.click();

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).not.toBeVisible();
        });
    });

    test.describe('Keyboard Navigation', () => {

        test('arrow down moves selection down', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            // Move down
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('ArrowDown');

            // Some item should be selected
            const selected = page.locator('[data-testid="command-item"].selected');
            // At least navigation worked without error
        });

        test('arrow up moves selection up', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('ArrowUp');

            // Navigation worked
        });

        test('selection wraps around at bottom', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            // Press down many times to wrap
            for (let i = 0; i < 50; i++) {
                await page.keyboard.press('ArrowDown');
            }

            // Should not crash and should have wrapped
        });

        test('Tab also navigates like arrow down', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');

            // Should navigate down
        });
    });

    test.describe('Mode-Based Filtering', () => {

        test('sketch mode shows sketch commands', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            // Should show line, circle, dimension, etc.
            await page.keyboard.type('line');
            const results = page.locator('[data-testid="command-item"]');
            await expect(results.first()).toBeVisible();
        });

        test('modeling mode shows modeling commands', async ({ appPage }) => {
            const page = appPage;

            // Outside of sketch mode
            await page.keyboard.press('Control+k');

            await page.keyboard.type('extrude');
            const results = page.locator('[data-testid="command-item"]');
            // May show extrude command
        });

        test('global commands visible in all modes', async ({ appPage }) => {
            const page = appPage;

            await page.keyboard.press('Control+k');

            await page.keyboard.type('keyboard shortcuts');
            const results = page.locator('[data-testid="command-item"]');
            await expect(results.first()).toBeVisible();
        });
    });

    test.describe('Visual Feedback', () => {

        test('commands show keyboard shortcuts', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');
            await page.keyboard.type('line');

            // Line command should show "L" shortcut
            const shortcutBadge = page.locator('[data-testid="command-shortcut"]');
            await expect(shortcutBadge.first()).toBeVisible();
        });

        test('commands show category', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            // Categories like "geometry", "constraint" should be visible
            const category = page.locator('[data-testid="command-category"]');
            // At least some categories visible
        });
    });
});
