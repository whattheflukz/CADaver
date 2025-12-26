import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints } from "../snapUtils";

export class ArcTool extends BaseTool {
    id = "arc";
    private centerPoint: [number, number] | null = null;
    private startPoint: [number, number] | null = null;
    private centerSnap: SnapPoint | null = null;
    private previewId = "preview_arc";

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
        } else if (!this.startPoint) {
            // Click 2: Start Point (Radius + Start Angle)
            this.startPoint = effectivePoint;
            // Note: We could capture startSnap here if we wanted to constrain the start point
        } else {
            // Click 3: End Point (End Angle)
            this.createArc(this.centerPoint, this.startPoint, effectivePoint, this.centerSnap);
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
        this.updatePreview(this.centerPoint, this.startPoint, effectivePoint);
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
        this.startPoint = null;
        this.centerSnap = null;
    }

    private createArc(center: [number, number], start: [number, number], end: [number, number], centerSnap: SnapPoint | null) {
        const radius = Math.sqrt(Math.pow(start[0] - center[0], 2) + Math.pow(start[1] - center[1], 2));
        const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
        const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);

        const newEntityId = crypto.randomUUID();
        const newEntity: SketchEntity = {
            id: newEntityId,
            geometry: {
                Arc: {
                    center: center,
                    radius: radius,
                    start_angle: startAngle,
                    end_angle: endAngle
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

        // Auto constraints - Center only for now
        const autoConstraints = applyAutoConstraints(sketch, newEntityId, centerSnap, null);
        sketch.constraints = [...(sketch.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }

    private updatePreview(center: [number, number], start: [number, number] | null, cursor: [number, number]) {
        let radius = 1.0;
        let startAngle = 0.0;
        let endAngle = 0.0;

        if (!start) {
            // Moving to determine start point
            const dx = cursor[0] - center[0];
            const dy = cursor[1] - center[1];
            radius = Math.sqrt(dx * dx + dy * dy);
            startAngle = Math.atan2(dy, dx);
            endAngle = startAngle;
        } else {
            // Center and Start fixed, moving for End Angle
            radius = Math.sqrt(Math.pow(start[0] - center[0], 2) + Math.pow(start[1] - center[1], 2));
            startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
            endAngle = Math.atan2(cursor[1] - center[1], cursor[0] - center[0]);
        }

        const previewEntity: SketchEntity = {
            id: this.previewId,
            geometry: {
                Arc: {
                    center: center,
                    radius: radius,
                    start_angle: startAngle,
                    end_angle: endAngle
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
