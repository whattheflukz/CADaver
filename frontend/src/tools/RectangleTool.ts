import { BaseTool } from "./BaseTool";
import type { SketchEntity, SnapPoint } from "../types";
import { wrapConstraint } from "../types";
import { applyAutoConstraints } from "../snapUtils";

export class RectangleTool extends BaseTool {
    id = "rectangle";
    private startPoint: [number, number] | null = null;
    private startSnap: SnapPoint | null = null;
    private previewIds: string[] | null = null;

    onMouseDown(u: number, v: number, _e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];

        if (snap) {
            effectivePoint = snap.position;
        }

        if (!this.startPoint) {
            // Click 1: Start Corner
            this.startPoint = effectivePoint;
            this.startSnap = snap;
            // Generate stable UUIDs for the preview entities
            this.previewIds = [
                crypto.randomUUID(),
                crypto.randomUUID(),
                crypto.randomUUID(),
                crypto.randomUUID()
            ];
        } else {
            // Click 2: Opposite Corner
            this.createRectangle(this.startPoint, effectivePoint, this.startSnap, snap);
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

        // Update preview
        this.updatePreview(this.startPoint, effectivePoint);
    }

    onCancel(): void {
        this.reset();
        // Remove preview if exists
        const sketch = this.context.sketch;
        // Use a more robust check since we don't know the IDs if reset() was called
        // Ideally we shouldn't rely on prefix anymore, but since we are switching to UUIDs,
        // we can't filter by prefix.
        // However, onCancel is called to abort. The preview IDs are stored.
        if (this.previewIds) {
            const idsToRemove = new Set(this.previewIds);
            const entities = sketch.entities.filter(e => !idsToRemove.has(e.id));
            if (entities.length !== sketch.entities.length) {
                this.context.setSketch({ ...sketch, entities });
            }
        }
        this.reset();
    }

    private reset() {
        this.startPoint = null;
        this.startSnap = null;
        this.previewIds = null;
    }

    private createRectangle(p1: [number, number], p2: [number, number], startSnap: SnapPoint | null, endSnap: SnapPoint | null) {
        const v1 = [p1[0], p1[1]];
        const v2 = [p2[0], p1[1]];
        const v3 = [p2[0], p2[1]];
        const v4 = [p1[0], p2[1]];

        // Reuse preview IDs if available to prevent flickering, or generate new ones
        // Actually, for history/undo it's better to use the ones we already showed?
        // Or generate fresh ones for the final commit.
        // Let's generate fresh ones for the final commit to avoid any confusion with "preview" state.

        const l1_id = crypto.randomUUID();
        const l2_id = crypto.randomUUID();
        const l3_id = crypto.randomUUID();
        const l4_id = crypto.randomUUID();

        const construction = this.context.constructionMode;

        const l1: SketchEntity = { id: l1_id, geometry: { Line: { start: [v1[0], v1[1]], end: [v2[0], v2[1]] } }, is_construction: construction };
        const l2: SketchEntity = { id: l2_id, geometry: { Line: { start: [v2[0], v2[1]], end: [v3[0], v3[1]] } }, is_construction: construction };
        const l3: SketchEntity = { id: l3_id, geometry: { Line: { start: [v3[0], v3[1]], end: [v4[0], v4[1]] } }, is_construction: construction };
        const l4: SketchEntity = { id: l4_id, geometry: { Line: { start: [v4[0], v4[1]], end: [v1[0], v1[1]] } }, is_construction: construction };

        const constraints: any[] = [
            // Horizontal/Vertical
            { Horizontal: { entity: l1_id } },
            { Vertical: { entity: l2_id } },
            { Horizontal: { entity: l3_id } },
            { Vertical: { entity: l4_id } },

            // Coincident Corners
            { Coincident: { points: [{ id: l1_id, index: 1 }, { id: l2_id, index: 0 }] } },
            { Coincident: { points: [{ id: l2_id, index: 1 }, { id: l3_id, index: 0 }] } },
            { Coincident: { points: [{ id: l3_id, index: 1 }, { id: l4_id, index: 0 }] } },
            { Coincident: { points: [{ id: l4_id, index: 1 }, { id: l1_id, index: 0 }] } },
        ];

        const sketch = { ...this.context.sketch };

        // Remove preview entities by ID
        if (this.previewIds) {
            const idsToRemove = new Set(this.previewIds);
            sketch.entities = sketch.entities.filter(e => !idsToRemove.has(e.id));
        }

        // Add entities
        sketch.entities = [...sketch.entities, l1, l2, l3, l4];
        sketch.history = [
            ...(sketch.history || []),
            { AddGeometry: { id: l1.id, geometry: l1.geometry } },
            { AddGeometry: { id: l2.id, geometry: l2.geometry } },
            { AddGeometry: { id: l3.id, geometry: l3.geometry } },
            { AddGeometry: { id: l4.id, geometry: l4.geometry } }
        ];

        // Auto constraints
        const finalConstraints: any[] = [...constraints];

        // P1 -> l1 start
        if (startSnap) {
            const autoC = applyAutoConstraints(sketch, l1_id, startSnap, null);
            finalConstraints.push(...autoC);
        }

        // P2 -> l3 start
        if (endSnap) {
            const autoC = applyAutoConstraints(sketch, l3_id, endSnap, null);
            finalConstraints.push(...autoC);
        }

        sketch.constraints = [...(sketch.constraints || []), ...finalConstraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...finalConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }

    private updatePreview(p1: [number, number], p2: [number, number]) {
        if (!this.previewIds) return;

        const v1 = [p1[0], p1[1]];
        const v2 = [p2[0], p1[1]];
        const v3 = [p2[0], p2[1]];
        const v4 = [p1[0], p2[1]];

        const construction = this.context.constructionMode;

        // Use stored UUIDs
        const l1: SketchEntity = { id: this.previewIds[0], geometry: { Line: { start: [v1[0], v1[1]], end: [v2[0], v2[1]] } }, is_construction: construction };
        const l2: SketchEntity = { id: this.previewIds[1], geometry: { Line: { start: [v2[0], v2[1]], end: [v3[0], v3[1]] } }, is_construction: construction };
        const l3: SketchEntity = { id: this.previewIds[2], geometry: { Line: { start: [v3[0], v3[1]], end: [v4[0], v4[1]] } }, is_construction: construction };
        const l4: SketchEntity = { id: this.previewIds[3], geometry: { Line: { start: [v4[0], v4[1]], end: [v1[0], v1[1]] } }, is_construction: construction };

        const sketch = this.context.sketch;
        // Remove existing preview entities to update them
        const idsToRemove = new Set(this.previewIds);
        const entities = sketch.entities.filter(e => !idsToRemove.has(e.id));

        // Local update for preview
        this.context.setSketch({ ...sketch, entities: [...entities, l1, l2, l3, l4] });
    }
}
