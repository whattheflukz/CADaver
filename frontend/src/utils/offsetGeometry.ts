/**
 * Offset Geometry utilities for the offset tool.
 * Extracted from useSketching.ts for better organization.
 */

import { type Sketch, type SketchEntity, type SketchConstraint } from '../types';

/**
 * Calculate offset geometry for lines.
 * Creates parallel lines offset by a given distance with appropriate constraints.
 * 
 * @param sketch - The current sketch
 * @param selection - IDs of entities to offset
 * @param distance - Offset distance
 * @param flip - Whether to flip the offset direction
 * @returns New entities and constraints, or null if invalid
 */
export function calculateOffsetGeometry(
    sketch: Sketch,
    selection: string[],
    distance: number,
    flip: boolean
): { entities: SketchEntity[], constraints: SketchConstraint[] } | null {
    const lines = selection.map(id => sketch.entities.find(e => e.id === id))
        .filter(e => e && e.geometry.Line)
        .map(e => ({ id: e!.id, geometry: e!.geometry.Line! }));

    if (lines.length === 0) return null;

    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];
    const createdLines: { originalId: string, newId: string, start: [number, number], end: [number, number] }[] = [];

    const d = flip ? -distance : distance;

    lines.forEach(line => {
        const dx = line.geometry.end[0] - line.geometry.start[0];
        const dy = line.geometry.end[1] - line.geometry.start[1];
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len < 1e-9) return;

        // Calculate perpendicular offset
        const nx = -dy / len;
        const ny = dx / len;
        const ox = nx * d;
        const oy = ny * d;

        const newStart: [number, number] = [line.geometry.start[0] + ox, line.geometry.start[1] + oy];
        const newEnd: [number, number] = [line.geometry.end[0] + ox, line.geometry.end[1] + oy];
        const newId = crypto.randomUUID();

        newEntities.push({
            id: newId,
            geometry: { Line: { start: newStart, end: newEnd } },
            is_construction: false
        });

        createdLines.push({ originalId: line.id, newId, start: newStart, end: newEnd });

        // Add Parallel constraint
        newConstraints.push({ Parallel: { lines: [line.id, newId] } });

        // Add DistancePointLine constraint (distance from new line's start to original line)
        newConstraints.push({
            DistancePointLine: {
                point: { id: newId, index: 0 },
                line: line.id,
                value: Math.abs(distance),
                style: { driven: false, offset: [0, 0] }
            }
        });
    });

    // Add coincident constraints where original lines meet
    const tol = 1e-6;
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const l1 = lines[i];
            const l2 = lines[j];

            const startDiffStart = Math.hypot(l1.geometry.start[0] - l2.geometry.start[0], l1.geometry.start[1] - l2.geometry.start[1]);
            const startDiffEnd = Math.hypot(l1.geometry.start[0] - l2.geometry.end[0], l1.geometry.start[1] - l2.geometry.end[1]);
            const endDiffStart = Math.hypot(l1.geometry.end[0] - l2.geometry.start[0], l1.geometry.end[1] - l2.geometry.start[1]);
            const endDiffEnd = Math.hypot(l1.geometry.end[0] - l2.geometry.end[0], l1.geometry.end[1] - l2.geometry.end[1]);

            if (startDiffStart < tol) {
                const newL1 = createdLines[i];
                const newL2 = createdLines[j];
                newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 0 }, { id: newL2.newId, index: 0 }] } });
            } else if (startDiffEnd < tol) {
                const newL1 = createdLines[i];
                const newL2 = createdLines[j];
                newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 0 }, { id: newL2.newId, index: 1 }] } });
            } else if (endDiffStart < tol) {
                const newL1 = createdLines[i];
                const newL2 = createdLines[j];
                newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 1 }, { id: newL2.newId, index: 0 }] } });
            } else if (endDiffEnd < tol) {
                const newL1 = createdLines[i];
                const newL2 = createdLines[j];
                newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 1 }, { id: newL2.newId, index: 1 }] } });
            }
        }
    }

    return { entities: newEntities, constraints: newConstraints };
}
