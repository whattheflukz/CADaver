import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints } from "../snapUtils";

export class CircleTool extends BaseTool {
    id = "circle";
    private centerPoint: [number, number] | null = null;
    private centerSnap: SnapPoint | null = null;
    private previewId = "preview_circle";

    onMouseDown(u: number, v: number, e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];

        if (snap) {
            effectivePoint = snap.position;
        }

        if (!this.centerPoint) {
            // Click 1: Center
            this.centerPoint = effectivePoint;
            this.centerSnap = snap;
        } else {
            // Click 2: Radius
            this.createCircle(this.centerPoint, effectivePoint, this.centerSnap);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, e?: MouseEvent): void {
        if (!this.centerPoint) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        // Update preview
        this.updatePreview(this.centerPoint, effectivePoint);
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
        this.centerPoint = null;
        this.centerSnap = null;
    }

    private createCircle(center: [number, number], pointOnRadius: [number, number], centerSnap: SnapPoint | null) {
        const dx = pointOnRadius[0] - center[0];
        const dy = pointOnRadius[1] - center[1];
        const radius = Math.sqrt(dx * dx + dy * dy);

        const newEntityId = crypto.randomUUID();
        const newEntity: SketchEntity = {
            id: newEntityId,
            geometry: {
                Circle: {
                    center: center,
                    radius: radius
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

        // Auto constraints - only for Center
        const autoConstraints = applyAutoConstraints(sketch, newEntityId, centerSnap, null);
        sketch.constraints = [...(sketch.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }

    private updatePreview(center: [number, number], pointOnRadius: [number, number]) {
        const dx = pointOnRadius[0] - center[0];
        const dy = pointOnRadius[1] - center[1];
        const radius = Math.sqrt(dx * dx + dy * dy);

        const previewEntity: SketchEntity = {
            id: this.previewId,
            geometry: {
                Circle: {
                    center: center,
                    radius: radius
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => e.id !== this.previewId);

        // Local update for preview
        this.context.setSketch({ ...sketch, entities: [...entities, previewEntity] });
    }
}
