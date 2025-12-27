
import { BaseTool } from "./BaseTool";
import type { SketchEntity } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints } from "../snapUtils";

export class PointTool extends BaseTool {
    id = "point";

    onMouseDown(u: number, v: number, __e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];

        if (snap) {
            effectivePoint = snap.position;
        }

        const newEntity: SketchEntity = {
            id: crypto.randomUUID(),
            geometry: {
                Point: {
                    pos: effectivePoint
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = { ...this.context.sketch };
        sketch.entities = [...sketch.entities, newEntity];
        sketch.history = [...(sketch.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

        // Apply auto-constraints if snapped to something
        const autoConstraints = applyAutoConstraints(sketch, newEntity.id, snap, null);
        sketch.constraints = [...(sketch.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);

        console.log("Added sketch point with constraints:", autoConstraints.length);
    }
}
