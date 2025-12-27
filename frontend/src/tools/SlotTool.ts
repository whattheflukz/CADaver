
import { BaseTool } from "./BaseTool";
import type { SketchEntity } from "../types";
import { wrapConstraint } from "../types";

export class SlotTool extends BaseTool {
    id = "slot";
    private center1: [number, number] | null = null;
    private center2: [number, number] | null = null;
    private previewIdPrefix = "preview_slot";

    onMouseDown(u: number, v: number, __e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        if (!this.center1) {
            // Click 1: Center 1
            this.center1 = effectivePoint;
        } else if (!this.center2) {
            // Click 2: Center 2 (defines axis)
            this.center2 = effectivePoint;
        } else {
            // Click 3: Define radius and finish
            this.createSlot(this.center1, this.center2, effectivePoint);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, __e?: MouseEvent): void {
        if (!this.center1) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        this.updatePreview(this.center1, this.center2, effectivePoint);
    }

    onCancel(): void {
        this.reset();
        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => !e.id.startsWith(this.previewIdPrefix));
        if (entities.length !== sketch.entities.length) {
            this.context.setSketch({ ...sketch, entities });
        }
    }

    private reset() {
        this.center1 = null;
        this.center2 = null;
    }

    private updatePreview(c1: [number, number], c2: [number, number] | null, cursor: [number, number]) {
        // ... (Preview logic similar to createSlot but with fixed IDs and no constraints)
        // For brevity and time, I'll implement reduced preview or reuse calc logic
        // I'll implement full preview because it's required for UX.

        let p1 = c1;
        let p2 = c2 || cursor;
        let radius = 1.0;

        if (!c2) {
            // Dragging C2
            p2 = cursor;
            // Default radius
            radius = 1.0;
        } else {
            // Dragging Radius
            // Calc radius from centerline (p1-p2) to cursor
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.001) { radius = 1.0; }
            else {
                const nx = -dy / len;
                const ny = dx / len;
                const dist = Math.abs((cursor[0] - p1[0]) * nx + (cursor[1] - p1[1]) * ny);
                radius = dist > 0.001 ? dist : 0.1;
            }
        }

        // Generate Geometry
        const geo = this.calculateSlotGeometry(p1, p2, radius, true);

        const sketch = this.context.sketch;
        const entities = sketch.entities.filter(e => !e.id.startsWith(this.previewIdPrefix));
        this.context.setSketch({ ...sketch, entities: [...entities, ...geo.entities] });
    }

    private createSlot(c1: [number, number], c2: [number, number], cursor: [number, number]) {
        // Calc radius
        const dx = c2[0] - c1[0];
        const dy = c2[1] - c1[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        let radius = 1.0;

        if (len > 0.001) {
            const nx = -dy / len;
            const ny = dx / len;
            const dist = Math.abs((cursor[0] - c1[0]) * nx + (cursor[1] - c1[1]) * ny);
            radius = dist > 0.001 ? dist : 0.1;
        }

        const geo = this.calculateSlotGeometry(c1, c2, radius, false);

        const sketch = { ...this.context.sketch };
        // Remove preview
        sketch.entities = sketch.entities.filter(e => !e.id.startsWith(this.previewIdPrefix));
        // Add new
        sketch.entities = [...sketch.entities, ...geo.entities];
        // Add constraints
        sketch.constraints = [...(sketch.constraints || []), ...geo.constraints.map(c => wrapConstraint(c))];

        // History? 
        // We really should add history for robustness, but Slot is a macro. 
        // We'll append constraints to history individually.
        // And entities.
        const history = sketch.history || [];
        geo.entities.forEach(e => history.push({ AddGeometry: { id: e.id, geometry: e.geometry } }));
        geo.constraints.forEach(c => history.push({ AddConstraint: { constraint: c } }));
        sketch.history = history;

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
        console.log("Added sketch slot");
    }

    private calculateSlotGeometry(c1: [number, number], c2: [number, number], radius: number, isPreview: boolean): { entities: SketchEntity[], constraints: any[] } {
        const dx = c2[0] - c1[0];
        const dy = c2[1] - c1[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = len > 0.001 ? -dy / len : 0;
        const ny = len > 0.001 ? dx / len : 1;

        const angle = Math.atan2(dy, dx);

        const a1_start = angle + Math.PI / 2;
        const a1_end = angle + Math.PI / 2 + Math.PI;
        const a2_start = angle - Math.PI / 2;
        const a2_end = angle + Math.PI / 2;


        const prefix = isPreview ? this.previewIdPrefix : crypto.randomUUID();

        // IDs
        const a1_id = isPreview ? prefix + "_a1" : crypto.randomUUID();
        const a2_id = isPreview ? prefix + "_a2" : crypto.randomUUID();
        const l1_id = isPreview ? prefix + "_l1" : crypto.randomUUID();
        const l2_id = isPreview ? prefix + "_l2" : crypto.randomUUID();
        const axis_id = isPreview ? prefix + "_axis" : crypto.randomUUID();

        const a1: SketchEntity = { id: a1_id, geometry: { Arc: { center: c1, radius, start_angle: a1_start, end_angle: a1_end } }, is_construction: this.context.constructionMode };
        const a2: SketchEntity = { id: a2_id, geometry: { Arc: { center: c2, radius, start_angle: a2_start, end_angle: a2_end } }, is_construction: this.context.constructionMode };

        const p_a1_top = [c1[0] + radius * nx, c1[1] + radius * ny] as [number, number];
        const p_a1_btm = [c1[0] - radius * nx, c1[1] - radius * ny] as [number, number];
        const p_a2_top = [c2[0] + radius * nx, c2[1] + radius * ny] as [number, number];
        const p_a2_btm = [c2[0] - radius * nx, c2[1] - radius * ny] as [number, number];

        const l1: SketchEntity = { id: l1_id, geometry: { Line: { start: p_a1_top, end: p_a2_top } }, is_construction: this.context.constructionMode };
        const l2: SketchEntity = { id: l2_id, geometry: { Line: { start: p_a1_btm, end: p_a2_btm } }, is_construction: this.context.constructionMode };

        const axisLine: SketchEntity = { id: axis_id, geometry: { Line: { start: c1, end: c2 } }, is_construction: true };

        const entities = [axisLine, a1, a2, l1, l2];
        const constraints: any[] = [];

        if (!isPreview) {
            // Axis Connectivity
            constraints.push({ Coincident: { points: [{ id: axis_id, index: 0 }, { id: a1_id, index: 0 }] } });
            constraints.push({ Coincident: { points: [{ id: axis_id, index: 1 }, { id: a2_id, index: 0 }] } });

            // Parallel Sides to Axis
            constraints.push({ Parallel: { lines: [l1_id, axis_id] } });
            constraints.push({ Parallel: { lines: [l2_id, axis_id] } });

            // Equal Radii
            constraints.push({ Equal: { entities: [a1_id, a2_id] } });

            // Tangency / Connectivity
            // L1 Start -> A1 Start (or End depending on direction)
            // L1 End -> A2 End
            // L2 Start -> A1 End
            // L2 End -> A2 Start

            // For A1 (C1), Sweep 90 to 270. Top is Start. Bottom is End.
            // Line 1 connects Top A1 -> Top A2.
            // Line 2 connects Bottom A1 -> Bottom A2.

            // Connectivity constraints
            constraints.push({ Coincident: { points: [{ id: l1_id, index: 0 }, { id: a1_id, index: 1 }] } }); // L1 Start - A1 Start (Top)
            constraints.push({ Coincident: { points: [{ id: l2_id, index: 0 }, { id: a1_id, index: 2 }] } }); // L2 Start - A1 End (Bottom)

            // For A2 (C2), Sweep -90 to 90. Bottom is Start. Top is End.
            // Top is A2 End. Bottom is A2 Start.
            constraints.push({ Coincident: { points: [{ id: l1_id, index: 1 }, { id: a2_id, index: 2 }] } }); // L1 End - A2 End (Top)
            constraints.push({ Coincident: { points: [{ id: l2_id, index: 1 }, { id: a2_id, index: 1 }] } }); // L2 End - A2 Start (Bottom)

            // Tangency
            constraints.push({ Tangent: { points: [{ id: l1_id, index: 0 }, { id: a1_id, index: 1 }] } });
            constraints.push({ Tangent: { points: [{ id: l1_id, index: 1 }, { id: a2_id, index: 2 }] } });
            constraints.push({ Tangent: { points: [{ id: l2_id, index: 0 }, { id: a1_id, index: 2 }] } });
            constraints.push({ Tangent: { points: [{ id: l2_id, index: 1 }, { id: a2_id, index: 1 }] } });
        }

        return { entities, constraints };
    }
}
