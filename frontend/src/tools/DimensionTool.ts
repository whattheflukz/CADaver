
import { BaseTool } from "./BaseTool";
import { findClosestEntity } from "../snapUtils";
import type { SelectionCandidate } from "../types";

export class DimensionTool extends BaseTool {
    id = "dimension";

    onMouseDown(u: number, v: number, __e?: MouseEvent): void {
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
                candidate = { id: snap.entity_id, type: "point", index: 0, position: e.geometry.Point.pos };
            } else if (e && e.geometry.Line) {
                if (snap.snap_type === "Endpoint") {
                    const distStart = Math.sqrt(
                        (snap.position[0] - e.geometry.Line.start[0]) ** 2 +
                        (snap.position[1] - e.geometry.Line.start[1]) ** 2
                    );
                    const distEnd = Math.sqrt(
                        (snap.position[0] - e.geometry.Line.end[0]) ** 2 +
                        (snap.position[1] - e.geometry.Line.end[1]) ** 2
                    );
                    const index = distStart < distEnd ? 0 : 1;
                    candidate = {
                        id: snap.entity_id,
                        type: "point",
                        index,
                        position: index === 0 ? e.geometry.Line.start : e.geometry.Line.end
                    };
                } else {
                    candidate = { id: snap.entity_id, type: "entity" };
                }
            } else if (e && e.geometry.Circle) {
                if (snap.snap_type === "Center") {
                    candidate = { id: snap.entity_id, type: "point", index: 0, position: e.geometry.Circle.center };
                } else {
                    candidate = { id: snap.entity_id, type: "entity" };
                }
            } else if (e && e.geometry.Arc) {
                if (snap.snap_type === "Center") {
                    candidate = { id: snap.entity_id, type: "point", index: 0, position: e.geometry.Arc.center };
                } else {
                    candidate = { id: snap.entity_id, type: "entity" };
                }
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
                    candidate = { id: match.id, type: "point", index: 0, position: e.geometry.Point.pos };
                } else {
                    candidate = { id: match.id, type: match.type };
                }
            }
        }

        const currentSel = this.context.dimensionSelection || [];

        if (candidate) {
            const existingIndex = currentSel.findIndex(s =>
                s.id === candidate!.id &&
                s.type === candidate!.type &&
                s.index === candidate!.index
            );

            // Toggle logic for Dimension tool (allows correcting mistakes)
            let newSel: SelectionCandidate[] = [];

            if (existingIndex >= 0) {
                newSel = currentSel.filter((_, i) => i !== existingIndex);
            } else {
                newSel = [...currentSel, candidate];
            }
            this.context.setDimensionSelection?.(newSel);
        } else {
            // Clicked empty space
            this.context.setDimensionSelection?.([]);
        }
    }

    onMouseMove(u: number, v: number, __e?: MouseEvent): void {
        this.context.setDimensionMousePosition?.([u, v]);
    }
}
