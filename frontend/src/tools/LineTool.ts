import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints, applyAngularSnapping } from "../snapUtils";

export class LineTool extends BaseTool {
    id = "line";
    private startPoint: [number, number] | null = null;
    private startSnap: SnapPoint | null = null;
    private previewId = "preview_line";

    onMouseDown(u: number, v: number, e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];

        if (snap) {
            effectivePoint = snap.position;
        }

        // Apply angular snapping if start point exists
        if (this.startPoint) {
            effectivePoint = this.checkAngularSnap(this.startPoint, effectivePoint, snap);
        }

        if (!this.startPoint) {
            // Click 1: Start
            this.startPoint = effectivePoint;
            this.startSnap = snap;
        } else {
            // Click 2: End
            this.createLine(this.startPoint, effectivePoint, this.startSnap, snap);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, e?: MouseEvent): void {
        if (!this.startPoint) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        effectivePoint = this.checkAngularSnap(this.startPoint, effectivePoint, snap);

        // Update preview
        this.updatePreview(this.startPoint, effectivePoint);
    }

    onCancel(): void {
        this.reset();
        // Remove preview if exists
        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => e.id !== this.previewId);
        if (entities.length !== sketch.entities.length) {
            this.context.setSketch({ ...sketch, entities });
        }
    }

    private reset() {
        this.startPoint = null;
        this.startSnap = null;
    }

    private createLine(start: [number, number], end: [number, number], startSnap: SnapPoint | null, endSnap: SnapPoint | null) {
        const newEntityId = crypto.randomUUID();
        const newEntity: SketchEntity = {
            id: newEntityId,
            geometry: {
                Line: {
                    start: start,
                    end: end
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = { ...this.context.sketch };

        // Remove preview
        sketch.entities = sketch.entities.filter(e => e.id !== this.previewId);

        // Add new entity
        sketch.entities = [...sketch.entities, newEntity];
        sketch.history = [...(sketch.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

        // Auto constraints
        const autoConstraints = applyAutoConstraints(sketch, newEntityId, startSnap, endSnap);
        sketch.constraints = [...(sketch.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }

    private updatePreview(start: [number, number], end: [number, number]) {
        const previewEntity: SketchEntity = {
            id: this.previewId,
            geometry: {
                Line: {
                    start: start,
                    end: end
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => e.id !== this.previewId);

        // We avoid triggering a full solver update for previews, just local state update
        this.context.setSketch({ ...sketch, entities: [...entities, previewEntity] });
    }

    private checkAngularSnap(start: [number, number], current: [number, number], snap: SnapPoint | null): [number, number] {
        // If hard snap exists, respect it (unless grid snap? usually element snap > angular snap)
        if (snap && snap.snap_type !== "Grid") return current;

        const result = applyAngularSnapping(start, current);
        if (result.snapped) {
            return result.position;
        }

        return current;
    }
}
