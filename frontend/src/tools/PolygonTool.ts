
import { BaseTool } from "./BaseTool";
import type { SketchEntity } from "../types";
import { wrapConstraint } from "../types";

export class PolygonTool extends BaseTool {
    id = "polygon";
    private center: [number, number] | null = null;
    private previewIdPrefix = "preview_poly";

    onMouseDown(u: number, v: number, _e?: MouseEvent): void {
        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        if (!this.center) {
            // Click 1: Center
            this.center = effectivePoint;
            this.context.setTempPoint?.(this.center);
        } else {
            // Click 2: Vertex (defines radius and orientation)
            this.createPolygon(this.center, effectivePoint);
            this.reset();
        }
    }

    onMouseMove(u: number, v: number, _e?: MouseEvent): void {
        if (!this.center) return;

        const snap = this.context.snapPoint;
        let effectivePoint: [number, number] = [u, v];
        if (snap) {
            effectivePoint = snap.position;
        }

        this.updatePreview(this.center, effectivePoint);
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
        this.center = null;
        this.context.setTempPoint?.(null);
    }

    private updatePreview(center: [number, number], vertex: [number, number]) {
        const radius = Math.sqrt(Math.pow(vertex[0] - center[0], 2) + Math.pow(vertex[1] - center[1], 2));
        const startAngle = Math.atan2(vertex[1] - center[1], vertex[0] - center[0]);

        if (radius <= 0.001) return;

        const numSides = 6;
        const vertices: [number, number][] = [];
        for (let i = 0; i < numSides; i++) {
            const angle = startAngle + (i * 2 * Math.PI / numSides);
            vertices.push([
                center[0] + radius * Math.cos(angle),
                center[1] + radius * Math.sin(angle)
            ]);
        }

        const entities: SketchEntity[] = [];

        // Spokes
        for (let i = 0; i < numSides; i++) {
            entities.push({
                id: `${this.previewIdPrefix}_s_${i}`,
                geometry: { Line: { start: center, end: vertices[i] } },
                is_construction: true
            });
        }

        // Perimeter
        for (let i = 0; i < numSides; i++) {
            const next = (i + 1) % numSides;
            entities.push({
                id: `${this.previewIdPrefix}_p_${i}`,
                geometry: { Line: { start: vertices[i], end: vertices[next] } },
                is_construction: this.context.constructionMode
            });
        }

        const sketch = this.context.sketch;
        const existing = sketch.entities.filter(e => !e.id.startsWith(this.previewIdPrefix));
        this.context.setSketch({ ...sketch, entities: [...existing, ...entities] });
    }

    private createPolygon(center: [number, number], vertex: [number, number]) {
        const radius = Math.sqrt(Math.pow(vertex[0] - center[0], 2) + Math.pow(vertex[1] - center[1], 2));
        const startAngle = Math.atan2(vertex[1] - center[1], vertex[0] - center[0]);

        if (radius <= 0.001) return;

        const numSides = 6;
        const perimeterIds: string[] = [];
        const spokeIds: string[] = [];
        const entities: SketchEntity[] = [];
        const constraints: any[] = [];
        const history: any[] = [];

        const vertices: [number, number][] = [];

        for (let i = 0; i < numSides; i++) {
            const angle = startAngle + (i * 2 * Math.PI / numSides);
            vertices.push([
                center[0] + radius * Math.cos(angle),
                center[1] + radius * Math.sin(angle)
            ]);
        }

        // Generate Spokes (Center -> Vertex)
        for (let i = 0; i < numSides; i++) {
            const id = crypto.randomUUID();
            spokeIds.push(id);
            const ent: SketchEntity = {
                id: id,
                geometry: { Line: { start: center, end: vertices[i] } },
                is_construction: true
            };
            entities.push(ent);
            history.push({ AddGeometry: { id: ent.id, geometry: ent.geometry } });
        }

        // Generate Perimeter (Vertex -> Vertex)
        for (let i = 0; i < numSides; i++) {
            const id = crypto.randomUUID();
            perimeterIds.push(id);
            const next = (i + 1) % numSides;
            const ent: SketchEntity = {
                id: id,
                geometry: { Line: { start: vertices[i], end: vertices[next] } },
                is_construction: this.context.constructionMode
            };
            entities.push(ent);
            history.push({ AddGeometry: { id: ent.id, geometry: ent.geometry } });
        }

        // Constraints
        // 1. Equal length for all spokes
        for (let i = 1; i < numSides; i++) {
            constraints.push({ Equal: { entities: [spokeIds[0], spokeIds[i]] } });
        }

        // 2. Equal length for all perimeter lines
        for (let i = 1; i < numSides; i++) {
            constraints.push({ Equal: { entities: [perimeterIds[0], perimeterIds[i]] } });
        }

        // 3. Coincident connections
        // Center is coincident for all spokes starts
        for (let i = 1; i < numSides; i++) {
            constraints.push({ Coincident: { points: [{ id: spokeIds[0], index: 0 }, { id: spokeIds[i], index: 0 }] } });
        }

        // Vertices
        for (let i = 0; i < numSides; i++) {
            const spokeId = spokeIds[i];
            const permId = perimeterIds[i];
            const prevPermId = perimeterIds[(i - 1 + numSides) % numSides];

            // Spoke End -> Perimeter Start
            constraints.push({ Coincident: { points: [{ id: spokeId, index: 1 }, { id: permId, index: 0 }] } });

            // Prev Perimeter End -> Perimeter Start
            constraints.push({ Coincident: { points: [{ id: prevPermId, index: 1 }, { id: permId, index: 0 }] } });
        }

        constraints.forEach(c => history.push({ AddConstraint: { constraint: c } }));

        const sketch = { ...this.context.sketch };
        // Remove preview
        sketch.entities = sketch.entities.filter(e => !e.id.startsWith(this.previewIdPrefix));
        // Add new
        sketch.entities = [...sketch.entities, ...entities];
        sketch.constraints = [...(sketch.constraints || []), ...constraints.map(c => wrapConstraint(c))];
        sketch.history = [...(sketch.history || []), ...history];

        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
        console.log("Added sketch polygon");
    }
}
