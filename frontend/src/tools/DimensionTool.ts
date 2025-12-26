
import { BaseTool } from "./BaseTool";
import { findClosestEntity } from "../snapUtils";
import type { SelectionCandidate } from "../types";

export class DimensionTool extends BaseTool {
    id = "dimension";

    onMouseDown(u: number, v: number, _e?: MouseEvent): void {
        const rawPoint: [number, number] = [u, v];
        const sketch = this.context.sketch;

        // 1. Try to Commit Dimension (if valid proposal exists and placement mode is active)
        if (this.context.commitDimension && this.context.commitDimension()) {
            return;
        }

        // 2. Entity/Point Hit Testing
        // (Similar to SelectTool but populates dimensionSelection)

        let candidate: SelectionCandidate | null = null;

        const snap = this.context.snapPoint;
        if (snap && snap.entity_id) {
            const e = sketch.entities.find(ent => ent.id === snap.entity_id);
            if (e && e.geometry.Point) {
                candidate = { id: snap.entity_id, type: "point", position: e.geometry.Point.pos };
            } else {
                candidate = { id: snap.entity_id, type: "entity" };
            }
        } else if (snap && snap.snap_type === "Origin") {
            candidate = { id: "origin", type: "origin", position: [0, 0] };
        } else {
            const match = findClosestEntity(rawPoint, sketch, 0.5);
            if (match) {
                // For Point entities found by hit-testing
                const e = sketch.entities.find(ent => ent.id === match.id);
                if (e && e.geometry.Point) {
                    candidate = { id: match.id, type: "point", position: e.geometry.Point.pos };
                } else {
                    candidate = { id: match.id, type: match.type };
                }
            }
        }

        const currentSel = this.context.dimensionSelection || [];

        if (candidate) {
            const isSelected = currentSel.some(s => s.id === candidate!.id);

            // Toggle logic for Dimension tool (allows correcting mistakes)
            let newSel: SelectionCandidate[] = [];

            if (isSelected) {
                newSel = currentSel.filter(s => s.id !== candidate!.id);
            } else {
                newSel = [...currentSel, candidate];
            }
            this.context.setDimensionSelection?.(newSel);
        } else {
            // Clicked empty space
            this.context.setDimensionSelection?.([]);
        }
    }

    onMouseMove(u: number, v: number, _e?: MouseEvent): void {
        this.context.setDimensionMousePosition?.([u, v]);
    }
}
