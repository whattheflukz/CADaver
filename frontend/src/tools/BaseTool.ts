import type { SketchTool, SketchToolContext } from "./types";

export abstract class BaseTool implements SketchTool {
    abstract id: string;

    protected context: SketchToolContext;

    constructor(context: SketchToolContext) {
        this.context = context;
    }

    onActivate(): void { }
    onDeactivate(): void { }

    onMouseDown(_u: number, _v: number, _e: MouseEvent): void { }
    onMouseMove(_u: number, _v: number, _e: MouseEvent): void { }
    onMouseUp(_u: number, _v: number, _e: MouseEvent): void { }
    onKeyDown(_e: KeyboardEvent): void { }
    onCancel(): void { }

    // Helper to request a solver update
    protected sendUpdate() {
        this.context.sendUpdate(this.context.sketch);
    }
}
