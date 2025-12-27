
import { BaseTool } from "./BaseTool";
import type { SketchEntity } from "../types";

export class TrimTool extends BaseTool {
    id = "trim";

    onMouseDown(u: number, v: number, ___e?: MouseEvent): void {
        const clickX = u;
        const clickY = v;
        const sketch = this.context.sketch;

        const closestResult = this.findClosestLine(clickX, clickY);
        if (!closestResult) {
            console.log("Trim: No line found near click");
            return;
        }

        const { entity: closestEntity, dist } = closestResult;
        if (dist > 2.0) return; // Threshold

        const targetLine = closestEntity.geometry.Line!;
        const targetId = closestEntity.id;

        // Find all intersections
        const intersections: { point: [number, number], t: number }[] = [];

        for (const entity of sketch.entities) {
            if (entity.id === targetId) continue;
            if (entity.id.startsWith("preview_")) continue;
            if (!entity.geometry.Line) continue;

            const otherLine = entity.geometry.Line;

            // Line-line intersection
            const d1x = targetLine.end[0] - targetLine.start[0];
            const d1y = targetLine.end[1] - targetLine.start[1];
            const d2x = otherLine.end[0] - otherLine.start[0];
            const d2y = otherLine.end[1] - otherLine.start[1];

            const cross = d1x * d2y - d1y * d2x;
            if (Math.abs(cross) < 1e-10) continue; // Parallel

            const dx = otherLine.start[0] - targetLine.start[0];
            const dy = otherLine.start[1] - targetLine.start[1];

            const t = (dx * d2y - dy * d2x) / cross; // Param on target
            const s = (dx * d1y - dy * d1x) / cross; // Param on other

            // Intersection within segments
            if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
                const ix = targetLine.start[0] + t * d1x;
                const iy = targetLine.start[1] + t * d1y;
                intersections.push({ point: [ix, iy], t });
            }
        }

        // Determine click parameter t
        const dx = targetLine.end[0] - targetLine.start[0];
        const dy = targetLine.end[1] - targetLine.start[1];
        const lenSq = dx * dx + dy * dy;
        const clickT = lenSq > 0
            ? ((clickX - targetLine.start[0]) * dx + (clickY - targetLine.start[1]) * dy) / lenSq
            : 0;



        if (intersections.length === 0) {
            // Trim whole line? Or do nothing?
            // Usually trim tool deletes the segment. If no intersections, delete whole line.
            // Logic in useSketching:
            // "if intersections.length === 0 ... return"
            // So it only trims intersected lines?
            // Let's stick to original behavior.
            console.log("Trim: No intersections found for this line");
            // Actually many trim tools delete the object if no intersection.
            // But let's follow the extracted logic.
            return;
        }

        // Find nearest intersection on each side of click
        let leftT = 0; // Start of line
        let rightT = 1; // End of line

        for (const inter of intersections) {
            if (inter.t < clickT && inter.t > leftT) {
                leftT = inter.t;
            }
            if (inter.t > clickT && inter.t < rightT) {
                rightT = inter.t;
            }
        }

        // Trim logic from useSketching:
        // "if clickT < 0.5" ?? No, that was a simplification logic in previous code?
        // Ah, the code said:
        // if (clickT < 0.5) ...
        // Wait, line 1377 in prior view: `if (clickT < 0.5)`
        // This looks like a bug or simplification in the legacy code. It splits the line in half?
        // No, it's checking relative to the SEGMENT that was clicked?
        // But `clickT` is global parameter [0,1].
        // The legacy code seems to assume we clicked closer to start or end.
        // But what if we click in the middle of two intersections?
        // `leftT` and `rightT` bound the clicked segment.
        // We want to REMOVE [leftT, rightT].
        // This splits the line into [0, leftT] and [rightT, 1].
        // AND one of those might be empty if leftT=0 or rightT=1.
        // BUT `Line` entity can only be ONE segment. We can't split it into two disjoint lines easily without creating a new ID.
        // The legacy logic:
        // if click < 0.5 (closer to start): keep right side?
        // newStart = ... leftT ... (so removing start->leftT??)
        // This logic seems flawed if there are multiple segments.
        //
        // Correct Trim behavior:
        // The clicked segment [leftT, rightT] is deleted.
        // If leftT > 0 and rightT < 1, we are deleting the middle -> Creates 2 lines.
        // If leftT == 0, we keep [rightT, 1].
        // If rightT == 1, we keep [0, leftT].

        // Let's implement the simpler robust verification:
        // If we need to split (middle deletion), we modify existing line to be one side, and create new line for other side.

        const removeSegment = (t0: number, t1: number) => {
            // We are removing [t0, t1].
            // Remaining: [0, t0] and [t1, 1].

            // If t0 > epsilon, we have a start segment.
            // If t1 < 1-epsilon, we have an end segment.

            const hasStart = t0 > 0.001;
            const hasEnd = t1 < 0.999;

            if (hasStart && hasEnd) {
                // Split!
                // Modify targetLine to be [0, t0].
                const pSplit1 = [
                    targetLine.start[0] + t0 * dx,
                    targetLine.start[1] + t0 * dy
                ] as [number, number];

                const pSplit2 = [
                    targetLine.start[0] + t1 * dx,
                    targetLine.start[1] + t1 * dy
                ] as [number, number];

                // Update existing
                const updatedEntities = sketch.entities.map(e => {
                    if (e.id === targetId) {
                        return { ...e, geometry: { Line: { start: e.geometry.Line!.start, end: pSplit1 } } };
                    }
                    return e;
                });

                // Add new
                const newLine: SketchEntity = {
                    id: crypto.randomUUID(),
                    geometry: { Line: { start: pSplit2, end: targetLine.end } },
                    is_construction: closestEntity.is_construction
                };

                this.context.setSketch({ ...sketch, entities: [...updatedEntities, newLine] });
                this.context.sendUpdate({ ...sketch, entities: [...updatedEntities, newLine] }); // Send full update
            } else if (hasStart) {
                // Keep [0, t0]. Remove [t1, 1] (where t1 must be ~1? No, we remove [t0, t1].
                // If hasEnd is false, t1 is 1. Removing [t0, 1]. Keeping [0, t0].
                const pSplit = [
                    targetLine.start[0] + t0 * dx,
                    targetLine.start[1] + t0 * dy
                ] as [number, number];

                const updatedEntities = sketch.entities.map(e => {
                    if (e.id === targetId) {
                        return { ...e, geometry: { Line: { start: e.geometry.Line!.start, end: pSplit } } };
                    }
                    return e;
                });
                this.context.setSketch({ ...sketch, entities: updatedEntities });
                this.sendUpdate();
            } else if (hasEnd) {
                // Keep [t1, 1]. Removing [0, t1] (where t0 ~0).
                const pSplit = [
                    targetLine.start[0] + t1 * dx,
                    targetLine.start[1] + t1 * dy
                ] as [number, number];

                const updatedEntities = sketch.entities.map(e => {
                    if (e.id === targetId) {
                        return { ...e, geometry: { Line: { start: pSplit, end: e.geometry.Line!.end } } };
                    }
                    return e;
                });
                this.context.setSketch({ ...sketch, entities: updatedEntities });
                this.sendUpdate();
            } else {
                // Removing [0, 1] -> Delete line.
                const updatedEntities = sketch.entities.filter(e => e.id !== targetId);
                this.context.setSketch({ ...sketch, entities: updatedEntities });
                this.sendUpdate();
            }
        };

        removeSegment(leftT, rightT);
    }

    private findClosestLine(px: number, py: number): { entity: SketchEntity, dist: number } | null {
        const sketch = this.context.sketch;
        let closest: SketchEntity | null = null;
        let minDist = Infinity;

        for (const entity of sketch.entities) {
            if (entity.id.startsWith("preview_")) continue;
            if (entity.geometry.Line) {
                const { start, end } = entity.geometry.Line;
                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const len2 = dx * dx + dy * dy;
                let t = len2 > 0 ? ((px - start[0]) * dx + (py - start[1]) * dy) / len2 : 0;
                t = Math.max(0, Math.min(1, t));
                const closestX = start[0] + t * dx;
                const closestY = start[1] + t * dy;
                const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = entity;
                }
            }
        }
        return closest ? { entity: closest, dist: minDist } : null;
    }
}
