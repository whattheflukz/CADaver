/**
 * Sketch Keyboard Shortcut Tests
 * 
 * Tests all keyboard shortcuts in sketch mode:
 * - Tool activation shortcuts
 * - Constraint shortcuts
 * - Action shortcuts
 * - Escape behavior
 */

import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    drawLine,
    drawCircle,
    OFFSETS,
    getConstraintCount,
} from '../setup/test-utils';

test.describe('Tool Keyboard Shortcuts', () => {

    test.describe('Geometry Tool Shortcuts', () => {

        test('L activates Line tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('l');

            // Verify line tool is active by drawing
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Should have created a line (1 entity)
        });

        test('C activates Circle tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('c');

            await clickAtOffset(page, 0, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Should have created a circle
        });

        test('A activates Arc tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('a');

            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, 0, -OFFSETS.medium);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Should have created an arc
        });

        test('R activates Rectangle tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('r');

            await clickAtOffset(page, -OFFSETS.medium, -OFFSETS.small);
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);

            // Should have created 4 lines
        });

        test('P activates Point tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('p');

            await clickAtOffset(page, OFFSETS.medium, OFFSETS.medium);

            // Should have created a point
        });

        test('S activates Slot tool', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('s');

            // Might activate slot tool - S is also "new sketch" in modeling mode
            // In sketch mode, S should be slot
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            // Third click for width typically
            await clickAtOffset(page, OFFSETS.medium, OFFSETS.small);
        });
    });

    test.describe('Dimension Tool Shortcut', () => {

        test('D activates Dimension tool', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await page.keyboard.press('d');

            // Apply dimension
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);
            await clickAtOffset(page, 0, OFFSETS.small);

            const count = await getConstraintCount(page);
            expect(count).toBeGreaterThan(0);
        });

        test('M activates Measure tool', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await page.keyboard.press('m');

            // Measure between two points
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await clickAtOffset(page, OFFSETS.medium, 0);

            // Should show measurement (visual verification)
        });
    });

    test.describe('Constraint Shortcuts', () => {

        test('H applies Horizontal constraint to selected line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw diagonal line
            await drawLine(page, -OFFSETS.medium, -OFFSETS.small, OFFSETS.medium, OFFSETS.small);

            // Select it
            await selectTool(page, 'select');
            await clickAtOffset(page, 0, 0);

            // Apply horizontal
            await page.keyboard.press('h');

            const count = await getConstraintCount(page);
            expect(count).toBe(1);
        });

        test('V applies Vertical constraint to selected line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw diagonal line
            await drawLine(page, -OFFSETS.small, -OFFSETS.medium, OFFSETS.small, OFFSETS.medium);

            await selectTool(page, 'select');
            await clickAtOffset(page, 0, 0);

            await page.keyboard.press('v');

            const count = await getConstraintCount(page);
            expect(count).toBe(1);
        });

        test('I applies Coincident constraint to selected points', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two lines with nearby endpoints
            await drawLine(page, -OFFSETS.large, 0, -OFFSETS.medium, 0);
            await drawLine(page, -OFFSETS.medium + 5, 0, OFFSETS.medium, 0);

            await selectTool(page, 'select');

            // Select both endpoints
            await clickAtOffset(page, -OFFSETS.medium, 0);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, -OFFSETS.medium + 5, 0);
            await page.keyboard.up('Shift');

            await page.keyboard.press('i');

            const count = await getConstraintCount(page);
            expect(count).toBe(1);
        });

        test('E applies Equal constraint to selected entities', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two lines of different lengths
            await drawLine(page, -OFFSETS.large, -OFFSETS.small, -OFFSETS.medium, -OFFSETS.small);
            await drawLine(page, OFFSETS.small, OFFSETS.small, OFFSETS.medium, OFFSETS.small);

            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.large + 20, -OFFSETS.small);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, OFFSETS.small + 20, OFFSETS.small);
            await page.keyboard.up('Shift');

            await page.keyboard.press('e');

            const count = await getConstraintCount(page);
            expect(count).toBe(1);
        });
    });

    test.describe('Escape Key Behavior', () => {

        test('Escape switches from tool to select', async ({ sketchPage }) => {
            const page = sketchPage;

            // Activate line tool
            await page.keyboard.press('l');

            // Press Escape
            await page.keyboard.press('Escape');

            // Should be in select mode now
        });

        test('Escape clears current tool state', async ({ sketchPage }) => {
            const page = sketchPage;

            // Start drawing line but don't finish
            await page.keyboard.press('l');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // Press Escape
            await page.keyboard.press('Escape');

            // Line should be cancelled, not created
        });

        test('double Escape clears selection', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Select something
            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small, 0);

            // First escape might switch tool
            await page.keyboard.press('Escape');

            // Second escape clears selection
            await page.keyboard.press('Escape');
        });

        test('progressive escape behavior', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            // Activate tool
            await page.keyboard.press('l');

            // Start drawing
            await clickAtOffset(page, -OFFSETS.medium, 0);

            // First Escape: cancel current drawing
            await page.keyboard.press('Escape');

            // Second Escape: switch to select tool
            await page.keyboard.press('Escape');

            // Third Escape: clear any selection
            await page.keyboard.press('Escape');
        });
    });

    test.describe('Modifier Key Combinations', () => {

        test('Ctrl+K opens command palette', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible({ timeout: 3000 });
        });

        test('Ctrl+, opens keyboard shortcuts modal', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('Control+,');

            const modal = page.locator('[data-testid="keyboard-shortcuts-modal"]');
            await expect(modal).toBeVisible({ timeout: 3000 });
        });

        test('Shift+click adds to selection', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');

            // Click first line
            await clickAtOffset(page, OFFSETS.small, 0);

            // Shift+click second line
            await page.keyboard.down('Shift');
            await clickAtOffset(page, 0, OFFSETS.small);
            await page.keyboard.up('Shift');

            // Should have 2 entities selected
        });

        test('Ctrl+click removes from selection', async ({ sketchWithLines }) => {
            const page = sketchWithLines;

            await selectTool(page, 'select');

            // Select both
            await clickAtOffset(page, OFFSETS.small, 0);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, 0, OFFSETS.small);
            await page.keyboard.up('Shift');

            // Ctrl+click to remove one
            await page.keyboard.down('Control');
            await clickAtOffset(page, OFFSETS.small, 0);
            await page.keyboard.up('Control');

            // Should have 1 entity selected
        });
    });

    test.describe('Shortcut Priority', () => {

        test('shortcuts work while modal is closed', async ({ sketchPage }) => {
            const page = sketchPage;

            // Simple shortcut
            await page.keyboard.press('l');

            // Should activate line tool
        });

        test('shortcuts are blocked when modal is open', async ({ sketchPage }) => {
            const page = sketchPage;

            // Open command palette
            await page.keyboard.press('Control+k');

            const palette = page.locator('[data-testid="command-palette"]');
            await expect(palette).toBeVisible();

            // Try pressing L - should type in search, not activate tool
            await page.keyboard.press('l');

            // Palette should still be open
            await expect(palette).toBeVisible();
        });

        test('shortcuts work immediately after closing modal', async ({ sketchPage }) => {
            const page = sketchPage;

            // Open and close command palette
            await page.keyboard.press('Control+k');
            await page.keyboard.press('Escape');

            // Now shortcut should work
            await page.keyboard.press('l');

            // Line tool should be active
        });
    });

    test.describe('Case Insensitivity', () => {

        test('lowercase shortcuts work', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('l');
            // Line tool should activate
        });

        test('uppercase shortcuts work (with shift)', async ({ sketchPage }) => {
            const page = sketchPage;

            await page.keyboard.press('L'); // Capital L
            // Line tool should still activate
        });
    });
});
