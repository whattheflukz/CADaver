/**
 * MeasureTool - Temporary, non-driving measurement tool
 * 
 * Creates session-only measurements between sketch entities.
 * Measurements update live as geometry changes but do not constrain the sketch.
 */

import { BaseTool } from "./BaseTool";
import { findClosestEntity } from "../snapUtils";
import type { SelectionCandidate } from "../types";

export class MeasureTool extends BaseTool {
    id = "measure";

    onMouseDown(u: number, v: number, _e?: MouseEvent): void {
        const rawPoint: [number, number] = [u, v];
        const sketch = this.context.sketch;

        // Get current selection
        const currentSel = this.context.measurementSelection || [];

        // 1. Hit-test for entities/points
        let candidate: SelectionCandidate | null = null;

        const snap = this.context.snapPoint;
        if (snap && snap.entity_id) {
            const e = sketch.entities.find(ent => ent.id === snap.entity_id);
            if (e && e.geometry.Point) {
                candidate = { id: snap.entity_id, type: "point", position: e.geometry.Point.pos };
            } else if (e && e.geometry.Line) {
                // Check if snapping to endpoint
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
            // Fallback to geometry hit-testing
            const match = findClosestEntity(rawPoint, sketch, 0.5);
            if (match) {
                const e = sketch.entities.find(ent => ent.id === match.id);
                if (e && e.geometry.Point) {
                    candidate = { id: match.id, type: "point", position: e.geometry.Point.pos };
                } else {
                    candidate = { id: match.id, type: match.type };
                }
            }
        }

        if (candidate) {
            // Check if already selected (toggle off)
            const existingIndex = currentSel.findIndex(s =>
                s.id === candidate!.id &&
                s.type === candidate!.type &&
                s.index === candidate!.index
            );

            if (existingIndex >= 0) {
                // Deselect
                const newSel = currentSel.filter((_, i) => i !== existingIndex);
                this.context.setMeasurementSelection?.(newSel);
            } else {
                // Add to selection
                const newSel = [...currentSel, candidate];
                this.context.setMeasurementSelection?.(newSel);

                // If we now have 2 items, create measurement
                if (newSel.length >= 2) {
                    const measurement = this.context.calculateMeasurement?.(newSel[0], newSel[1]);
                    if (measurement && !('Error' in (measurement.result || {}))) {
                        this.context.addActiveMeasurement?.(measurement);
                    }
                    // Clear selection for next measurement
                    this.context.setMeasurementSelection?.([]);
                }
            }
        } else {
            // Clicked empty space - clear pending selection
            this.context.setMeasurementSelection?.([]);
        }
    }

    onCancel(): void {
        // Clear pending selection but keep existing measurements
        this.context.setMeasurementSelection?.([]);
    }
}
