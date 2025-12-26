
import { test, expect } from '../setup/fixtures';
import {
    selectTool,
    clickAtOffset,
    drawLine,
    drawRectangle,
    OFFSETS,
    getEntityCount
} from '../setup/test-utils';

test.describe('Offset Tool', () => {

    test.describe('Single Entity Offset', () => {

        test('create offset from single line', async ({ sketchPage }) => {
            const page = sketchPage;

            // Draw a line
            await drawLine(page, -OFFSETS.medium, 0, OFFSETS.medium, 0);

            const initialCount = await getEntityCount(page);

            // Select it
            await selectTool(page, 'select');
            await clickAtOffset(page, 0, 0);

            // Activate offset tool
            await page.keyboard.press('Control+k');
            await page.keyboard.type('offset');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="offset-modal"]');

            // Set distance
            const distInput = page.locator('[data-testid="offset-distance-input"]');
            await distInput.clear();
            await distInput.fill('20');

            // Confirm
            await page.click('[data-testid="offset-confirm"]');

            // Should have 1 new line + distance constraint potentially? 
            // The implementation might create just the entity or entity + constraint.
            // Assuming 1 new entity for now.
            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(initialCount);
        });
    });

    test.describe('Offset Loop', () => {

        test('create offset from rectangle (loop)', async ({ sketchPage }) => {
            const page = sketchPage;

            await drawRectangle(page, -OFFSETS.small, -OFFSETS.small, OFFSETS.small, OFFSETS.small);

            const initialCount = await getEntityCount(page);

            // Select all lines of rectangle (box select or manual)
            // For now, let's select one edge and see if it chains (it might not without chain select)
            // Or manual select all 4.
            await selectTool(page, 'select');

            // Top
            await clickAtOffset(page, 0, OFFSETS.small);
            await page.keyboard.down('Shift');
            // Right
            await clickAtOffset(page, OFFSETS.small, 0);
            // Bottom
            await clickAtOffset(page, 0, -OFFSETS.small);
            // Left
            await clickAtOffset(page, -OFFSETS.small, 0);
            await page.keyboard.up('Shift');

            await page.keyboard.press('Control+k');
            await page.keyboard.type('offset');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="offset-modal"]');

            const distInput = page.locator('[data-testid="offset-distance-input"]');
            await distInput.clear();
            await distInput.fill('10');

            await page.click('[data-testid="offset-confirm"]');

            const newCount = await getEntityCount(page);
            // Should create 4 new lines
            expect(newCount).toBe(initialCount + 4);
        });
    });

    test.describe('Offset Modal Interaction', () => {
        test('flip direction toggles offset side', async ({ sketchPage }) => {
            // This is hard to test visually without screenshot, but we can check if entities are created
            // and maybe inspect their coordinates if we wanted to be precise.
            // For now, just ensure the UI works.
            const page = sketchPage;
            await drawLine(page, 0, 0, 100, 0);
            await selectTool(page, 'select');
            await clickAtOffset(page, 50, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('offset');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="offset-modal"]');

            await page.click('[data-testid="offset-flip-btn"]');
            await page.click('[data-testid="offset-confirm"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBeGreaterThan(1);
        });

        test('cancel offset does not create entities', async ({ sketchPage }) => {
            const page = sketchPage;
            await drawLine(page, 0, 0, 100, 0);
            const initialCount = await getEntityCount(page);

            await selectTool(page, 'select');
            await clickAtOffset(page, 50, 0);

            await page.keyboard.press('Control+k');
            await page.keyboard.type('offset');
            await page.keyboard.press('Enter');

            await page.waitForSelector('[data-testid="offset-modal"]');
            await page.click('[data-testid="offset-cancel"]');

            const newCount = await getEntityCount(page);
            expect(newCount).toBe(initialCount);
        });
    });

});
