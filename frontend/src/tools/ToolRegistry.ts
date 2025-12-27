import type { SketchTool, SketchToolContext } from "./types";
import { LineTool } from "./LineTool";
import { CircleTool } from "./CircleTool";
import { RectangleTool } from "./RectangleTool";
import { ArcTool } from "./ArcTool";
import { SelectTool } from "./SelectTool";
import { DimensionTool } from "./DimensionTool";
import { MeasureTool } from "./MeasureTool";
import { OffsetTool } from "./OffsetTool";
import { PointTool } from "./PointTool";
import { EllipseTool } from "./EllipseTool";
import { SlotTool } from "./SlotTool";

import { PolygonTool } from "./PolygonTool";
import { ConstraintTool } from "./ConstraintTool";
import { TrimTool } from "./TrimTool";

export class ToolRegistry {
    private tools: Map<string, SketchTool> = new Map();


    constructor(context: SketchToolContext) {

        this.register(new LineTool(context));
        this.register(new CircleTool(context));
        this.register(new RectangleTool(context));
        this.register(new ArcTool(context));
        this.register(new SelectTool(context));
        this.register(new DimensionTool(context));
        this.register(new MeasureTool(context));
        this.register(new OffsetTool(context));
        this.register(new PointTool(context));
        this.register(new EllipseTool(context));
        this.register(new SlotTool(context));
        this.register(new PolygonTool(context));
        this.register(new TrimTool(context));

        // Register Constraint Tools
        this.register(new ConstraintTool(context, "Horizontal"));
        this.register(new ConstraintTool(context, "Vertical"));
        this.register(new ConstraintTool(context, "Coincident"));
        this.register(new ConstraintTool(context, "Parallel"));
        this.register(new ConstraintTool(context, "Perpendicular"));
        this.register(new ConstraintTool(context, "Equal"));
        this.register(new ConstraintTool(context, "Fix"));
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
