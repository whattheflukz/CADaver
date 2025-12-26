import type { SketchTool, SketchToolContext } from "./types";

/**
 * OffsetTool - Creates offset copies of selected geometry
 * For now, just handles selection like SelectTool
 * TODO: Implement actual offset logic
 */
export class OffsetTool implements SketchTool {
    readonly id = "offset";
    private context: SketchToolContext;

    constructor(context: SketchToolContext) {
        this.context = context;
    }

    onMouseDown(x: number, y: number, event?: MouseEvent): void {
        // Selection is handled by Viewport's onSelect
        // TODO: After selection, implement offset preview
    }

    onMouseMove(x: number, y: number, event?: MouseEvent): void {
        // TODO: Show offset preview while hovering
    }

    onMouseUp(x: number, y: number, event?: MouseEvent): void {
        // Selection finalized by Viewport
    }

    cleanup(): void {
        // Cleanup when tool is deactivated
    }
}
