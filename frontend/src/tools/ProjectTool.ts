import { BaseTool } from "./BaseTool";
import type { TopoId } from "../types";

export class ProjectTool extends BaseTool {
    id = "project";

    onSelect(topoId: TopoId): boolean {
        // We only care about Topological IDs (from 3D kernel), as opposed to sketch selections
        if (topoId && typeof topoId === 'object' && 'feature_id' in topoId) {
            console.log("[ProjectTool] Projecting entity:", topoId);

            const sketchId = this.context.sketchId;
            if (sketchId) {
                this.context.send({
                    command: 'ProjectEntity',
                    payload: {
                        sketch_id: sketchId,
                        topo_id: topoId
                    }
                });
                return true;
            }
        }
        return false;
    }
}
