import type { SketchTool, SketchToolContext } from "./types";

export abstract class BaseTool implements SketchTool {
    abstract id: string;

    constructor(protected context: SketchToolContext) { }

    onActivate(): void { }
    onDeactivate(): void { }

    onMouseDown(u: number, v: number, e: MouseEvent): void { }
    onMouseMove(u: number, v: number, e: MouseEvent): void { }
    onMouseUp(u: number, v: number, e: MouseEvent): void { }
    onKeyDown(e: KeyboardEvent): void { }
    onCancel(): void { }

    // Helper to request a solver update
    protected sendUpdate() {
        this.context.sendUpdate(this.context.sketch);
    }
}
