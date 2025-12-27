
import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints } from "../snapUtils";

export class EllipseTool extends BaseTool {
    id = "ellipse";
    private center: [number, number] | null = null;
    private majorEnd: [number, number] | null = null;
    private startSnap: SnapPoint | null = null;
    private previewId = "preview_ellipse";

    onMouseDown(u: number, v: number, __e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        if (!this.center) {
            // Click 1: Center
            this.center = effectivePoint;
            this.startSnap = snap;
            // Optionally update global temp point for inference
            this.context.setTempPoint?.(this.center);
        } else if (!this.majorEnd) {
            // Click 2: Major Axis End
            this.majorEnd = effectivePoint;
        } else {
            // Click 3: Minor Axis (width) and Finish
            this.createEllipse(this.center, this.majorEnd, effectivePoint);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, __e?: MouseEvent): void {
        if (!this.center) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        this.updatePreview(this.center, this.majorEnd, effectivePoint);
    }

    onCancel(): void {
        this.reset();
        // Remove preview
        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => e.id !== this.previewId);
        if (entities.length !== sketch.entities.length) {
            this.context.setSketch({ ...sketch, entities });
        }
    }

    private reset() {
        this.center = null;
        this.majorEnd = null;
        this.startSnap = null;
        this.context.setTempPoint?.(null);
    }

    private updatePreview(center: [number, number], majorEnd: [number, number] | null, cursor: [number, number]) {
        let semi_major = 1.0;
        let semi_minor = 0.5;
        let rotation = 0.0;

        if (!majorEnd) {
            // Defining Major Axis
            const dx = cursor[0] - center[0];
            const dy = cursor[1] - center[1];
            semi_major = Math.sqrt(dx * dx + dy * dy);
            rotation = Math.atan2(dy, dx);
            semi_minor = semi_major * 0.5;
        } else {
            // Defining Minor Axis
            const dx = majorEnd[0] - center[0];
            const dy = majorEnd[1] - center[1];
            semi_major = Math.sqrt(dx * dx + dy * dy);
            rotation = Math.atan2(dy, dx);

            const len = semi_major > 1e-6 ? semi_major : 1.0;
            const ux = dx / len;
            const uy = dy / len;

            const vx = cursor[0] - center[0];
            const vy = cursor[1] - center[1];

            const minor_dist = Math.abs(vx * (-uy) + vy * ux);
            semi_minor = minor_dist > 1e-6 ? minor_dist : 0.1;
        }

        const previewEntity: SketchEntity = {
            id: this.previewId,
            geometry: {
                Ellipse: {
                    center,
                    semi_major,
                    semi_minor,
                    rotation
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => e.id !== this.previewId);
        // Local update only
        this.context.setSketch({ ...sketch, entities: [...entities, previewEntity] });
    }

    private createEllipse(center: [number, number], majorEnd: [number, number], cursor: [number, number]) {
        const dx = majorEnd[0] - center[0];
        const dy = majorEnd[1] - center[1];
        const semi_major = Math.sqrt(dx * dx + dy * dy);
        const rotation = Math.atan2(dy, dx);

        const len = semi_major > 1e-6 ? semi_major : 1.0;
        const ux = dx / len;
        const uy = dy / len;

        const vx = cursor[0] - center[0];
        const vy = cursor[1] - center[1];

        const minor_dist = Math.abs(vx * (-uy) + vy * ux);
        const semi_minor = minor_dist > 1e-6 ? minor_dist : 0.1;

        const newEntity: SketchEntity = {
            id: crypto.randomUUID(),
            geometry: {
                Ellipse: {
                    center,
                    semi_major,
                    semi_minor,
                    rotation
                }
            },
            is_construction: this.context.constructionMode
        };

        const sketch = { ...this.context.sketch };
        // Remove preview
        sketch.entities = sketch.entities.filter(e => e.id !== this.previewId);

        sketch.entities = [...sketch.entities, newEntity];
        sketch.history = [...(sketch.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

        // Auto-constraints (Center snap)
        const autoConstraints = applyAutoConstraints(sketch, newEntity.id, this.startSnap, null);
        sketch.constraints = [...(sketch.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }
}
