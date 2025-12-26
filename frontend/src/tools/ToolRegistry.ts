import type { SketchTool, SketchToolContext } from "./types";
import { LineTool } from "./LineTool";
import { CircleTool } from "./CircleTool";
import { RectangleTool } from "./RectangleTool";
import { ArcTool } from "./ArcTool";
import { SelectTool } from "./SelectTool";
import { DimensionTool } from "./DimensionTool";
import { MeasureTool } from "./MeasureTool";
import { OffsetTool } from "./OffsetTool";

export class ToolRegistry {
    private tools: Map<string, SketchTool> = new Map();
    private context: SketchToolContext;

    constructor(context: SketchToolContext) {
        this.context = context;
        this.register(new LineTool(context));
        this.register(new CircleTool(context));
        this.register(new RectangleTool(context));
        this.register(new ArcTool(context));
        this.register(new SelectTool(context));
        this.register(new DimensionTool(context));
        this.register(new MeasureTool(context));
        this.register(new OffsetTool(context));
    }

    private register(tool: SketchTool) {
        this.tools.set(tool.id, tool);
    }

    getTool(id: string): SketchTool | undefined {
        return this.tools.get(id);
    }

    getAllTools(): SketchTool[] {
        return Array.from(this.tools.values());
    }
}
