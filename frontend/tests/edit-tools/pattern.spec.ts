/**
 * Pattern Tool Tests
 * 
 * Tests linear and circular pattern functionality:
 * - Linear pattern with various counts
 * - Linear pattern with spacing
 * - Circular pattern around center
 * - Circular pattern with angle
 * - Pattern of multiple entities
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
} from '../setup/test-utils';

test.describe('Linear Pattern', () => {

    test.describe('Basic Linear Pattern', () => {

        test('linear pattern creates multiple copies of line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line to pattern
            await drawLine(page, -OFFSETS.medium, 0, -OFFSETS.small, 0);

            const initialCount = await getEntityCount(page);

            // Select it
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, 0);

            // Open linear pattern
            await page.keyboard.press('Control+k');
            await page.keyboard.type('linear pattern');
            await page.keyboard.press('Enter');

            // Wait for modal
            await page.waitForSelector('[data-testid="linear-pattern-modal"]', { timeout: 5000 });

            // Set count to 3
            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('3');

            // Set spacing
            const spacingInput = page.locator('[data-testid="pattern-spacing-input"]');
            await spacingInput.clear();
            await spacingInput.fill('30');

            // Confirm
            await page.click('[data-testid="pattern-confirm"]');

            // Should have 3 lines now (original + 2 copies)
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 2); // 2 new copies
        });

        test('linear pattern with 1 copy creates 2 total', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawLine(page, -OFFSETS.medium, 0, -OFFSETS.small, 0);

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('linear pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="linear-pattern-modal"]');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('2');

            await page.click('[data-testid="pattern-confirm"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 1);
        });
    });

    test.describe('Linear Pattern Direction', () => {

        test('linear pattern along custom direction', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawLine(page, -OFFSETS.medium, 0, -OFFSETS.small, 0);

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('linear pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="linear-pattern-modal"]');

            // Set 45° direction
            const dirXInput = page.locator('[data-testid="pattern-dir-x-input"]');
            const dirYInput = page.locator('[data-testid="pattern-dir-y-input"]');
            await dirXInput.clear();
            await dirXInput.fill('1');
            await dirYInput.clear();
            await dirYInput.fill('1');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('3');

            await page.click('[data-testid="pattern-confirm"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 2);
        });
    });

    test.describe('Pattern Multiple Entities', () => {

        test('linear pattern of multiple selected entities', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw two lines
            await drawLine(page, -OFFSETS.medium, -OFFSETS.small, -OFFSETS.small, -OFFSETS.small);
            await drawLine(page, -OFFSETS.medium, OFFSETS.small, -OFFSETS.small, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select both
            await selectTool(page, 'select');
            await clickAtOffset(page, -OFFSETS.medium + 20, -OFFSETS.small);
            await page.keyboard.down('Shift');
            await clickAtOffset(page, -OFFSETS.medium + 20, OFFSETS.small);
            await page.keyboard.up('Shift');

            await page.keyboard.press('Control+k');
            await page.keyboard.type('linear pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="linear-pattern-modal"]');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('3');

            await page.click('[data-testid="pattern-confirm"]');

            // Should have 6 lines total (2 original + 4 copies)
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 4);
        });
    });
});

test.describe('Circular Pattern', () => {

    test.describe('Basic Circular Pattern', () => {

        test('circular pattern creates rotated copies around center', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line off-center
            await drawLine(page, OFFSETS.medium, 0, OFFSETS.large, 0);

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.medium + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('circular pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="circular-pattern-modal"]', { timeout: 5000 });

            // 4 copies around full circle
            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('4');

            // Full 360°
            const angleInput = page.locator('[data-testid="pattern-angle-input"]');
            await angleInput.clear();
            await angleInput.fill('360');

            await page.click('[data-testid="pattern-confirm"]');

            // Should have 4 lines
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 3);
        });

        test('circular pattern with 90° creates quarter circle', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawLine(page, OFFSETS.medium, 0, OFFSETS.large, 0);

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.medium + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('circular pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="circular-pattern-modal"]');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('4');

            const angleInput = page.locator('[data-testid="pattern-angle-input"]');
            await angleInput.clear();
            await angleInput.fill('90'); // Quarter circle only

            await page.click('[data-testid="pattern-confirm"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 3);
        });
    });

    test.describe('Custom Center Point', () => {

        test('circular pattern around specified center', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw line
            await drawLine(page, OFFSETS.small, 0, OFFSETS.medium, 0);

            // Draw a point to use as center
            await selectTool(page, 'point');
            await clickAtOffset(page, -OFFSETS.medium, 0);

            const initialCount = await getEntityCount(page);

            // Select the line (not the point)
            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.small + 20, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('circular pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="circular-pattern-modal"]');

            // Set center to the point position
            const centerXInput = page.locator('[data-testid="pattern-center-x-input"]');
            const centerYInput = page.locator('[data-testid="pattern-center-y-input"]');
            await centerXInput.clear();
            await centerXInput.fill(`${-OFFSETS.medium}`);
            await centerYInput.clear();
            await centerYInput.fill('0');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('6');

            await page.click('[data-testid="pattern-confirm"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    test.describe('Pattern Circle Entity', () => {

        test('circular pattern of circle', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawCircle(page, OFFSETS.medium, 0, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, OFFSETS.medium, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('circular pattern');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="circular-pattern-modal"]');

            const countInput = page.locator('[data-testid="pattern-count-input"]');
            await countInput.clear();
            await countInput.fill('8');

            await page.click('[data-testid="pattern-confirm"]');

            // 8 circles
            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount + 7);
        });
    });
});

test.describe('Pattern Edge Cases', () => {

    test('cancel pattern modal without applying', async ({ sketchPage }) => {
        const page = sketchPage;

        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        const initialCount = await getEntityCount(page);

        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);

        await page.keyboard.press('Control+k');
        await page.keyboard.type('linear pattern');
        await page.keyboard.press('Enter');

        await page.waitForSelector('[data-testid="linear-pattern-modal"]');

        // Cancel
        await page.click('[data-testid="pattern-cancel"]');

        const newCount = await getEntityCount(page);
        expect(newCount).toBe(initialCount);
    });

    test('pattern with count of 1 does nothing', async ({ sketchPage }) => {
        const page = sketchPage;

        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        const initialCount = await getEntityCount(page);

        await selectTool(page, 'select');
        await clickAtOffset(page, 0, 0);

        await page.keyboard.press('Control+k');
        await page.keyboard.type('linear pattern');
        await page.keyboard.press('Enter');

        await page.waitForSelector('[data-testid="linear-pattern-modal"]');

        const countInput = page.locator('[data-testid="pattern-count-input"]');
        await countInput.clear();
        await countInput.fill('1');

        await page.click('[data-testid="pattern-confirm"]');

        const newCount = await getEntityCount(page);
        expect(newCount).toBe(initialCount);
    });

    test('pattern with nothing selected shows feedback', async ({ sketchPage }) => {
        const page = sketchPage;

        await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

        // Clear selection
        await page.keyboard.press('Escape');

        await page.keyboard.press('Control+k');
        await page.keyboard.type('linear pattern');
        await page.keyboard.press('Enter');

        // Modal may or may not open depending on implementation
        // Just verify no crash
        await page.keyboard.press('Escape');
    });
});
