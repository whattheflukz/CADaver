import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints, applyAngularSnapping, applyGeometricSnapping } from "../snapUtils";

export class LineTool extends BaseTool {
    id = "line";
    private startPoint: [number, number] | null = null;
    private startSnap: SnapPoint | null = null;
    private previewId = "preview_line";

    onMouseDown(u: number, v: number, _e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];

        if (snap) {
            effectivePoint = snap.position;
        }

        // Apply angular snapping if start point exists
        // Apply constraint snapping if start point exists
        let constraintSnapType: "horizontal" | "vertical" | "parallel" | "perpendicular" | null = null;
        let constraintEntityId: string | null = null;

        if (this.startPoint) {
            const res = this.checkConstraintSnap(this.startPoint, effectivePoint, snap);
            effectivePoint = res.position;
            constraintSnapType = res.snapType;
            constraintEntityId = res.entityId;
        }

        if (!this.startPoint) {
            // Click 1: Start
            this.startPoint = effectivePoint;
            this.startSnap = snap;
            this.context.setTempPoint?.(this.startPoint); // Update global state for inference
        } else {
            // Click 2: End
            this.createLine(this.startPoint, effectivePoint, this.startSnap, snap, constraintSnapType, constraintEntityId);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, _e?: MouseEvent): void {
        if (!this.startPoint) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        const res = this.checkConstraintSnap(this.startPoint, effectivePoint, snap);
        effectivePoint = res.position;

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
        this.context.setTempPoint?.(null);
    }

    private createLine(
        start: [number, number],
        end: [number, number],
        startSnap: SnapPoint | null,
        endSnap: SnapPoint | null,
        snapType: "horizontal" | "vertical" | "parallel" | "perpendicular" | null,
        snapEntityId: string | null
    ) {
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

        // Add Constraint Snap
        if (snapType === "horizontal") {
            autoConstraints.push({ Horizontal: { entity: newEntityId } });
        } else if (snapType === "vertical") {
            autoConstraints.push({ Vertical: { entity: newEntityId } });
        } else if (snapType === "parallel" && snapEntityId) {
            autoConstraints.push({ Parallel: { lines: [newEntityId, snapEntityId] } });
        } else if (snapType === "perpendicular" && snapEntityId) {
            autoConstraints.push({ Perpendicular: { lines: [newEntityId, snapEntityId] } });
        }

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

    private checkConstraintSnap(start: [number, number], current: [number, number], snap: SnapPoint | null): { position: [number, number]; snapType: "horizontal" | "vertical" | "parallel" | "perpendicular" | null; entityId: string | null } {
        // If hard snap exists, respect it (unless grid snap? usually element snap > angular snap)
        if (snap && snap.snap_type !== "Grid") return { position: current, snapType: null, entityId: null };

        // 1. Check H/V
        const angRes = applyAngularSnapping(start, current);
        if (angRes.snapped) {
            return { position: angRes.position, snapType: angRes.snapType, entityId: null };
        }

        // 2. Check Parallel/Perp
        const geomRes = applyGeometricSnapping(start, current, this.context.sketch);
        if (geomRes.snapped) {
            return { position: geomRes.position, snapType: geomRes.snapType, entityId: geomRes.entityId };
        }

        return { position: current, snapType: null, entityId: null };
    }
}
