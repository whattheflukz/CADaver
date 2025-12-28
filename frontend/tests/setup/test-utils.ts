/**
 * E2E Test Utilities for CAD Sketch Testing
 * 
 * Provides helper functions for common test operations like
 * waiting for sketch mode, clicking in viewport, extracting state, etc.
 */

import { Page, expect } from '@playwright/test';

/** Viewport dimensions - matches typical test window */
export const VIEWPORT = {
    width: 1280,
    height: 720,
    // Center of viewport (approximately where sketch plane center is)
    centerX: 640,
    centerY: 360,
};

/** Common coordinate offsets from center for drawing */
export const OFFSETS = {
    small: 50,
    medium: 100,
    large: 200,
};

/**
 * Wait for the application to be fully loaded and ready
 */
export async function waitForAppReady(page: Page): Promise<void> {
    // Wait for the main viewport canvas to be present
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Wait a bit for Three.js to initialize
    await page.waitForTimeout(1000);

    // Forward console logs from browser to test runner
    // Forward console logs from browser to test runner
    page.on('console', msg => {
        // Log everything to debug
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
}

/**
 * Wait for sketch mode to be active
 */
export async function waitForSketchMode(page: Page): Promise<void> {
    // Sketch toolbar should be visible when in sketch mode
    await page.waitForSelector('[data-testid="sketch-toolbar"]', { timeout: 10000 });
}

/**
 * Wait for the app to be in modeling (non-sketch) mode
 */
export async function waitForModelingMode(page: Page): Promise<void> {
    // Modeling toolbar should be visible when not in sketch
    await page.waitForSelector('[data-testid="modeling-toolbar"]', { timeout: 10000 });
}

/**
 * Start a new sketch on the XY plane
 */
export async function startNewSketch(page: Page): Promise<void> {
    // Press S to start new sketch (or use command palette if shortcut fails)
    // await page.keyboard.press('s'); 
    // Fallback to command palette for reliability in tests
    await executeCommand(page, 'New Sketch');

    // Wait for either setup mode (select plane) or sketch mode (auto-selected/existing)
    await page.waitForTimeout(1000); // Give it a second to settle

    let setupMode = await getSketchSetupMode(page);
    if (setupMode) {
        // Click at center to select the default XY plane helper
        // Using page.mouse for direct interaction with the canvas center
        await clickAtViewportCenter(page);
        await page.waitForTimeout(500);

        // Retry once if still in setup mode
        if (await getSketchSetupMode(page)) {
            await clickAtViewport(page, VIEWPORT.centerX + 10, VIEWPORT.centerY + 10);
            await page.waitForTimeout(500);
        }
    }

    // Wait for sketch mode to activate
    try {
        await waitForSketchMode(page);
    } catch (e) {
        const setupModeAfter = await getSketchSetupMode(page);
        const sketchState = await getSketchState(page);
        console.log(`[Test Debug] waitForSketchMode failed. SetupMode: ${setupModeAfter}, SketchState:`, sketchState);
        throw e;
    }
}

/**
 * Finish the current sketch
 */
export async function finishSketch(page: Page): Promise<void> {
    // Find and click the finish sketch button
    await page.click('[data-testid="finish-sketch"]');

    // Wait for modeling mode
    await waitForModelingMode(page);
}

/**
 * Select a sketch tool by pressing its keyboard shortcut
 */
export async function selectTool(page: Page, tool: SketchTool): Promise<void> {
    const shortcuts: Record<SketchTool, string> = {
        line: 'l',
        circle: 'c',
        arc: 'a',
        rectangle: 'r',
        point: 'p',
        dimension: 'd',
        measure: 'm',
        trim: 't',
        select: 'Escape',
    };

    await page.keyboard.press(shortcuts[tool]);
    await page.waitForTimeout(100); // Brief wait for tool activation
}

export type SketchTool = 'line' | 'circle' | 'arc' | 'rectangle' | 'point' | 'dimension' | 'measure' | 'trim' | 'select';

/**
 * Click at specific viewport coordinates
 */
export async function clickAtViewport(page: Page, x: number, y: number): Promise<void> {
    const canvas = page.locator('canvas').first();
    await canvas.click({ position: { x, y } });
}

/**
 * Click at the center of the viewport
 */
export async function clickAtViewportCenter(page: Page): Promise<void> {
    await clickAtViewport(page, VIEWPORT.centerX, VIEWPORT.centerY);
}

/**
 * Click at an offset from viewport center
 */
export async function clickAtOffset(page: Page, offsetX: number, offsetY: number): Promise<void> {
    await clickAtViewport(page, VIEWPORT.centerX + offsetX, VIEWPORT.centerY + offsetY);
}

/**
 * Move mouse to specific viewport coordinates (without clicking)
 */
export async function moveToViewport(page: Page, x: number, y: number): Promise<void> {
    const canvas = page.locator('canvas').first();
    await canvas.hover({ position: { x, y } });
}

/**
 * Move mouse to the center of the viewport (without clicking)
 */
export async function moveToViewportCenter(page: Page): Promise<void> {
    await moveToViewport(page, VIEWPORT.centerX, VIEWPORT.centerY);
}

/**
 * Move mouse to an offset from viewport center (without clicking)
 */
export async function moveToOffset(page: Page, offsetX: number, offsetY: number): Promise<void> {
    await moveToViewport(page, VIEWPORT.centerX + offsetX, VIEWPORT.centerY + offsetY);
}

/**
 * Drag from one viewport position to another
 */
export async function dragInViewport(
    page: Page,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): Promise<void> {
    const canvas = page.locator('canvas').first();

    await canvas.hover({ position: { x: fromX, y: fromY } });
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 10 });
    await page.mouse.up();
}

/**
 * Draw a line from one offset to another (relative to center)
 */
export async function drawLine(
    page: Page,
    fromOffsetX: number,
    fromOffsetY: number,
    toOffsetX: number,
    toOffsetY: number
): Promise<void> {
    await selectTool(page, 'line');
    await clickAtOffset(page, fromOffsetX, fromOffsetY);
    await clickAtOffset(page, toOffsetX, toOffsetY);
    // Press Escape to finish line tool chain
    await page.keyboard.press('Escape');
}

/**
 * Draw a circle at offset with given radius (approximate via drag)
 */
export async function drawCircle(
    page: Page,
    centerOffsetX: number,
    centerOffsetY: number,
    radiusOffset: number
): Promise<void> {
    await selectTool(page, 'circle');
    await clickAtOffset(page, centerOffsetX, centerOffsetY);
    await clickAtOffset(page, centerOffsetX + radiusOffset, centerOffsetY);
}

/**
 * Draw a rectangle from corner to corner
 */
export async function drawRectangle(
    page: Page,
    corner1OffsetX: number,
    corner1OffsetY: number,
    corner2OffsetX: number,
    corner2OffsetY: number
): Promise<void> {
    await selectTool(page, 'rectangle');
    await clickAtOffset(page, corner1OffsetX, corner1OffsetY);
    await clickAtOffset(page, corner2OffsetX, corner2OffsetY);
}

/**
 * Draw an arc through three points
 */
export async function drawArc(
    page: Page,
    startOffsetX: number,
    startOffsetY: number,
    throughOffsetX: number,
    throughOffsetY: number,
    endOffsetX: number,
    endOffsetY: number
): Promise<void> {
    await selectTool(page, 'arc');
    await clickAtOffset(page, startOffsetX, startOffsetY);
    await clickAtOffset(page, throughOffsetX, throughOffsetY);
    await clickAtOffset(page, endOffsetX, endOffsetY);
}

/**
 * Apply a dimension between two clicks
 */
export async function applyDimension(
    page: Page,
    click1OffsetX: number,
    click1OffsetY: number,
    click2OffsetX: number,
    click2OffsetY: number,
    placementOffsetX?: number,
    placementOffsetY?: number
): Promise<void> {
    await selectTool(page, 'dimension');
    await clickAtOffset(page, click1OffsetX, click1OffsetY);
    await clickAtOffset(page, click2OffsetX, click2OffsetY);

    // If placement specified, click there for dimension text position
    if (placementOffsetX !== undefined && placementOffsetY !== undefined) {
        await clickAtOffset(page, placementOffsetX, placementOffsetY);
    }
}

/**
 * Apply a constraint via keyboard shortcut
 */
export async function applyConstraint(
    page: Page,
    constraint: ConstraintType,
    ...clickOffsets: Array<[number, number]>
): Promise<void> {
    const shortcuts: Record<ConstraintType, string> = {
        horizontal: 'h',
        vertical: 'v',
        coincident: 'i',
        equal: 'e',
    };

    // First select the entities by clicking
    for (const [offsetX, offsetY] of clickOffsets) {
        await clickAtOffset(page, offsetX, offsetY);
        await page.keyboard.down('Shift'); // Hold shift for multi-select
    }
    await page.keyboard.up('Shift');

    // Then apply the constraint
    await page.keyboard.press(shortcuts[constraint]);
}

export type ConstraintType = 'horizontal' | 'vertical' | 'coincident' | 'equal';

/**
 * Open the command palette
 */
export async function openCommandPalette(page: Page): Promise<void> {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('[data-testid="command-palette"]', { timeout: 5000 });
}

/**
 * Execute a command from the command palette
 */
export async function executeCommand(page: Page, commandName: string): Promise<void> {
    await openCommandPalette(page);
    await page.keyboard.type(commandName);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
}

/**
 * Get the current sketch state from the page (via window object)
 * This requires the app to expose state for testing
 */
export async function getSketchState(page: Page): Promise<SketchState | null> {
    return await page.evaluate(() => {
        // @ts-ignore - accessing test hook
        const state = (window as any).sketchState;
        return state ? state.currentSketch : null;
    });
}

/**
 * Get sketch setup mode state
 */
export async function getSketchSetupMode(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        // @ts-ignore
        return (window as any).sketchState?.sketchSetupMode || false;
    });
}

/**
 * Get the number of entities in the current sketch
 */
export async function getEntityCount(page: Page): Promise<number> {
    const state = await getSketchState(page);
    return state?.entities?.length || 0;
}

/**
 * Get the number of constraints in the current sketch
 */
export async function getConstraintCount(page: Page): Promise<number> {
    const state = await getSketchState(page);
    return state?.constraints?.length || 0;
}

/**
 * Check if a specific tool is currently active
 */
export async function isToolActive(page: Page, tool: SketchTool): Promise<boolean> {
    // Check for active class on tool button
    const button = page.locator(`[data-testid="tool-${tool}"]`);
    const classes = await button.getAttribute('class');
    return classes?.includes('active') || false;
}

/**
 * Wait for solve result to show converged status
 */
export async function waitForSolveConverged(page: Page): Promise<void> {
    await page.waitForSelector('[data-testid="solve-status-converged"]', { timeout: 5000 });
}

/**
 * Check if dimension edit modal is open
 */
export async function isDimensionModalOpen(page: Page): Promise<boolean> {
    const modal = page.locator('[data-testid="dimension-edit-modal"]');
    return await modal.isVisible();
}

/**
 * Edit a dimension value in the modal
 */
export async function editDimensionValue(page: Page, value: string): Promise<void> {
    const input = page.locator('[data-testid="dimension-input"]');
    await input.clear();
    await input.fill(value);
    await page.keyboard.press('Enter');
}

/**
 * Press escape multiple times for progressive deselection
 */
export async function pressEscapeMultiple(page: Page, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    }
}

/** Sketch state shape for testing */
export interface SketchState {
    entities: Array<{
        id: string;
        geometry: any;
        is_construction?: boolean;
    }>;
    constraints: Array<{
        constraint: any;
        suppressed?: boolean;
    }>;
}

/**
 * Verify that a line exists between two approximate points
 */
export async function expectLineExists(
    page: Page,
    startApprox: [number, number],
    endApprox: [number, number],
    tolerance: number = 1
): Promise<void> {
    const state = await getSketchState(page);
    expect(state).not.toBeNull();

    const lines = state!.entities.filter(e => e.geometry.Line);
    const matchingLine = lines.find(e => {
        const line = e.geometry.Line;
        const startMatch =
            Math.abs(line.start[0] - startApprox[0]) < tolerance &&
            Math.abs(line.start[1] - startApprox[1]) < tolerance;
        const endMatch =
            Math.abs(line.end[0] - endApprox[0]) < tolerance &&
            Math.abs(line.end[1] - endApprox[1]) < tolerance;
        return startMatch && endMatch;
    });

    expect(matchingLine).toBeDefined();
}

/**
 * Verify that a circle exists at approximate center with radius
 */
export async function expectCircleExists(
    page: Page,
    centerApprox: [number, number],
    radiusApprox: number,
    tolerance: number = 1
): Promise<void> {
    const state = await getSketchState(page);
    expect(state).not.toBeNull();

    const circles = state!.entities.filter(e => e.geometry.Circle);
    const matchingCircle = circles.find(e => {
        const circle = e.geometry.Circle;
        const centerMatch =
            Math.abs(circle.center[0] - centerApprox[0]) < tolerance &&
            Math.abs(circle.center[1] - centerApprox[1]) < tolerance;
        const radiusMatch = Math.abs(circle.radius - radiusApprox) < tolerance;
        return centerMatch && radiusMatch;
    });

    expect(matchingCircle).toBeDefined();
}

/**
 * Verify constraint count matches expected
 */
export async function expectConstraintCount(page: Page, expected: number): Promise<void> {
    const count = await getConstraintCount(page);
    expect(count).toBe(expected);
}

/**
 * Verify entity count matches expected
 */
export async function expectEntityCount(page: Page, expected: number): Promise<void> {
    const count = await getEntityCount(page);
    expect(count).toBe(expected);
}
