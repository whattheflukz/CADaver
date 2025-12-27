import { BaseTool } from "./BaseTool";

export class OffsetTool extends BaseTool {
    readonly id = "offset";




    onMouseDown(_x: number, _y: number, _event?: MouseEvent): void {
        // Selection is handled by Viewport's onSelect
        // TODO: After selection, implement offset preview
    }

    onMouseMove(_x: number, _y: number, _event?: MouseEvent): void {
        // TODO: Show offset preview while hovering
    }

    onMouseUp(_x: number, _y: number, _event?: MouseEvent): void {
        // Selection finalized by Viewport
    }

    cleanup(): void {
        // Cleanup when tool is deactivated
    }
}
