/**
 * Client-side snap detection for sketch mode.
 * Mirrors the backend snap.rs logic for responsive client-side snapping.
 */

import { type Sketch, type SnapPoint, type SnapConfig, type SnapType, type ConstraintPoint, type SketchConstraint } from './types';
import { distance, lineLineIntersection } from './utils/geometryUtils';

const SNAP_PRIORITY: Record<SnapType, number> = {
    Endpoint: 1,
    Center: 2,
    Intersection: 3,
    Midpoint: 4,
    Origin: 5,
    AxisX: 6,
    AxisY: 6,
    Grid: 10,
};

/**
 * Find all snap points near the cursor
 */

export function findSnapPoints(
    cursor: [number, number],
    sketch: Sketch,
    config: SnapConfig
): SnapPoint[] {
    const snaps: SnapPoint[] = [];

    // Collect from entities
    for (const entity of sketch.entities) {
        if (entity.id.startsWith("preview_")) continue;

        const geom = entity.geometry;

        if (geom.Line) {
            const { start, end } = geom.Line;

            // Endpoint snapping
            if (config.enable_endpoint) {
                let d = distance(cursor, start);
                if (d <= config.snap_radius) {
                    snaps.push({ position: start, snap_type: "Endpoint", entity_id: entity.id, distance: d });
                }
                d = distance(cursor, end);
                if (d <= config.snap_radius) {
                    snaps.push({ position: end, snap_type: "Endpoint", entity_id: entity.id, distance: d });
                }
            }

            // Midpoint snapping
            if (config.enable_midpoint) {
                const mid: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
                const d = distance(cursor, mid);
                if (d <= config.snap_radius) {
                    snaps.push({ position: mid, snap_type: "Midpoint", entity_id: entity.id, distance: d });
                }
            }
        }

        if (geom.Circle) {
            const { center } = geom.Circle;
            if (config.enable_center) {
                const d = distance(cursor, center);
                if (d <= config.snap_radius) {
                    snaps.push({ position: center, snap_type: "Center", entity_id: entity.id, distance: d });
                }
            }
        }

        if (geom.Arc) {
            const { center, radius, start_angle, end_angle } = geom.Arc;

            // Center snapping
            if (config.enable_center) {
                const d = distance(cursor, center);
                if (d <= config.snap_radius) {
                    snaps.push({ position: center, snap_type: "Center", entity_id: entity.id, distance: d });
                }
            }

            // Arc endpoints
            if (config.enable_endpoint) {
                const startPt: [number, number] = [
                    center[0] + radius * Math.cos(start_angle),
                    center[1] + radius * Math.sin(start_angle)
                ];
                const endPt: [number, number] = [
                    center[0] + radius * Math.cos(end_angle),
                    center[1] + radius * Math.sin(end_angle)
                ];

                let d = distance(cursor, startPt);
                if (d <= config.snap_radius) {
                    snaps.push({ position: startPt, snap_type: "Endpoint", entity_id: entity.id, distance: d });
                }
                d = distance(cursor, endPt);
                if (d <= config.snap_radius) {
                    snaps.push({ position: endPt, snap_type: "Endpoint", entity_id: entity.id, distance: d });
                }
            }
        }

        if (geom.Point) {
            if (config.enable_endpoint) {
                const d = distance(cursor, geom.Point.pos);
                if (d <= config.snap_radius) {
                    snaps.push({ position: geom.Point.pos, snap_type: "Endpoint", entity_id: entity.id, distance: d });
                }
            }
        }
    }

    // Intersection snapping (line-line)
    if (config.enable_intersection) {
        const lines: Array<{ id: string; start: [number, number]; end: [number, number] }> = [];
        for (const e of sketch.entities) {
            if (e.id.startsWith("preview_")) continue;
            if (e.geometry.Line) {
                lines.push({ id: e.id, start: e.geometry.Line.start, end: e.geometry.Line.end });
            }
        }

        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const int = lineLineIntersection(lines[i].start, lines[i].end, lines[j].start, lines[j].end);
                if (int) {
                    const d = distance(cursor, int);
                    if (d <= config.snap_radius) {
                        snaps.push({ position: int, snap_type: "Intersection", entity_id: null, distance: d });
                    }
                }
            }
        }
    }

    // Origin snapping
    if (config.enable_origin) {
        const origin: [number, number] = [0, 0];
        const d = distance(cursor, origin);
        if (d <= config.snap_radius) {
            snaps.push({ position: origin, snap_type: "Origin", entity_id: null, distance: d });
        }
    }

    // Grid snapping
    if (config.enable_grid && config.grid_spacing > 0) {
        const gridX = Math.round(cursor[0] / config.grid_spacing) * config.grid_spacing;
        const gridY = Math.round(cursor[1] / config.grid_spacing) * config.grid_spacing;
        const gridPt: [number, number] = [gridX, gridY];
        const d = distance(cursor, gridPt);
        if (d <= config.snap_radius) {
            snaps.push({ position: gridPt, snap_type: "Grid", entity_id: null, distance: d });
        }
    }

    // Axis snapping (X=0 line and Y=0 line)
    // Snap to X axis (Y=0 line) when cursor is close
    if (Math.abs(cursor[1]) <= config.snap_radius) {
        const axisPoint: [number, number] = [cursor[0], 0];
        const d = Math.abs(cursor[1]);
        snaps.push({ position: axisPoint, snap_type: "AxisX", entity_id: null, distance: d });
    }
    // Snap to Y axis (X=0 line) when cursor is close
    if (Math.abs(cursor[0]) <= config.snap_radius) {
        const axisPoint: [number, number] = [0, cursor[1]];
        const d = Math.abs(cursor[0]);
        snaps.push({ position: axisPoint, snap_type: "AxisY", entity_id: null, distance: d });
    }

    return snaps;
}

/**
 * Find the best snap point for cursor
 */
export function snapCursor(
    cursor: [number, number],
    sketch: Sketch,
    config: SnapConfig
): SnapPoint | null {
    const snaps = findSnapPoints(cursor, sketch, config);
    if (snaps.length === 0) return null;

    // Sort by priority, then distance
    snaps.sort((a, b) => {
        const priCmp = SNAP_PRIORITY[a.snap_type] - SNAP_PRIORITY[b.snap_type];
        if (priCmp !== 0) return priCmp;
        return a.distance - b.distance;
    });

    return snaps[0];
}

/**
 * Apply snapping to a point, returning the snapped position and snap info
 */
export function applySnapping(
    cursor: [number, number],
    sketch: Sketch,
    config: SnapConfig
): { position: [number, number]; snap: SnapPoint | null } {
    const snap = snapCursor(cursor, sketch, config);
    if (snap) {
        return { position: snap.position, snap };
    }
    return { position: cursor, snap: null };
}

/**
 * Angular snapping for line creation - snaps to horizontal/vertical angles
 * Returns the snapped cursor position and whether snapping occurred
 * @param startPoint The fixed start point of the line being drawn
 * @param cursor The current cursor position
 * @param angleTolerance Tolerance in radians for angle snapping (default ~5 degrees)
 */
export function applyAngularSnapping(
    startPoint: [number, number],
    cursor: [number, number],
    angleTolerance: number = 0.087 // ~5 degrees in radians
): { position: [number, number]; snapped: boolean; snapType: "horizontal" | "vertical" | null } {
    const dx = cursor[0] - startPoint[0];
    const dy = cursor[1] - startPoint[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) {
        return { position: cursor, snapped: false, snapType: null };
    }

    // Calculate angle from start to cursor
    const angle = Math.atan2(dy, dx);

    // Check proximity to horizontal (0 or π)
    const absAngle = Math.abs(angle);
    if (absAngle < angleTolerance || Math.abs(absAngle - Math.PI) < angleTolerance) {
        // Snap to horizontal - maintain same X direction, zero Y
        const dir = dx >= 0 ? 1 : -1;
        return {
            position: [startPoint[0] + dir * dist, startPoint[1]],
            snapped: true,
            snapType: "horizontal"
        };
    }

    // Check proximity to vertical (π/2 or -π/2)
    const halfPi = Math.PI / 2;
    if (Math.abs(absAngle - halfPi) < angleTolerance) {
        // Snap to vertical - maintain same Y direction, zero X
        const dir = dy >= 0 ? 1 : -1;
        return {
            position: [startPoint[0], startPoint[1] + dir * dist],
            snapped: true,
            snapType: "vertical"
        };
    }

    return { position: cursor, snapped: false, snapType: null };
}
/**
 * Generate auto-constraints based on snap points for a new entity.
 */
export function applyAutoConstraints(
    sketch: Sketch,
    newEntityId: string,
    startSnap: SnapPoint | null,
    endSnap: SnapPoint | null
): SketchConstraint[] {
    const constraints: SketchConstraint[] = [];

    // Helper to convert snap to constraint point
    const snapToCP = (snap: SnapPoint): ConstraintPoint | null => {
        if (!snap.entity_id) return null;

        const entity = sketch.entities.find(e => e.id === snap.entity_id);
        if (!entity) return null;

        if (entity.geometry.Line) {
            const dStart = distance(entity.geometry.Line.start, snap.position);
            const dEnd = distance(entity.geometry.Line.end, snap.position);
            return { id: snap.entity_id, index: dStart < dEnd ? 0 : 1 };
        } else if (entity.geometry.Circle) {
            return { id: snap.entity_id, index: 0 }; // Center
        } else if (entity.geometry.Arc) {
            const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
            const dCenter = distance(center, snap.position);
            if (dCenter < 0.1) return { id: snap.entity_id, index: 0 };

            const pStart: [number, number] = [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)];
            const pEnd: [number, number] = [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)];

            const dStart = distance(pStart, snap.position);
            const dEnd = distance(pEnd, snap.position);

            if (dStart < dEnd) return { id: snap.entity_id, index: 1 };
            return { id: snap.entity_id, index: 2 };
        }
        return null;
    };

    const processSnap = (snap: SnapPoint, newEntityIndex: number) => {
        if (snap.snap_type === "Endpoint" || snap.snap_type === "Center" || snap.snap_type === "Intersection") {
            // Create Coincident
            const cp = snapToCP(snap);
            if (cp) {
                // Prevent self-constraint if snapping to self (unlikely during creation but possible)
                if (cp.id !== newEntityId) {
                    constraints.push({
                        Coincident: {
                            points: [
                                cp,
                                { id: newEntityId, index: newEntityIndex }
                            ]
                        }
                    });
                    // console.log("Auto-Constraint: Coincident to", snap.snap_type, cp.id);
                }
            }
        } else if (snap.snap_type === "Midpoint") {
            // "Midpoint" snap implies the point is on the line. 
            // Ideally it implies "Midpoint", but for now we constrain it "On Line" (Distance 0).
            const entity = sketch.entities.find(e => e.id === snap.entity_id);
            if (entity && entity.geometry.Line) {
                constraints.push({
                    DistancePointLine: {
                        point: { id: newEntityId, index: newEntityIndex },
                        line: snap.entity_id!,
                        value: 0
                    }
                });
            }
        } else if (snap.snap_type === "Origin") {
            // Create Fix at 0,0
            constraints.push({
                Fix: {
                    point: { id: newEntityId, index: newEntityIndex },
                    position: [0, 0]
                }
            });
            // console.log("Auto-Constraint: Fix to Origin");
        }
    };

    if (startSnap) processSnap(startSnap, 0); // Start/Center of new entity
    if (endSnap) processSnap(endSnap, 1);     // End of new entity (if applicable)

    return constraints;
}

/**
 * Find the closest entity to the cursor position within a threshold.
 */
export function findClosestEntity(
    cursor: [number, number],
    sketch: Sketch,
    threshold: number = 0.5
): { id: string; type: "entity" | "point"; distance: number } | null {
    let bestDist = threshold;
    let bestMatch: { id: string; type: "entity" | "point"; distance: number } | null = null;

    for (const entity of sketch.entities) {
        if (entity.is_construction) continue; // Optional: decide if construction geometry is selectable. Usually yes.
        // Actually, construction geometry SHOULD be selectable. Removing that check or making it optional.
    }

    // Re-looping properly
    for (const entity of sketch.entities) {
        let dist = Infinity;
        let type: "entity" | "point" = "entity";

        if (entity.geometry.Point) {
            dist = distance(cursor, entity.geometry.Point.pos);
            type = "point";
        } else if (entity.geometry.Line) {
            // Point to line segment distance
            const { start, end } = entity.geometry.Line;
            const l2 = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
            if (l2 === 0) {
                dist = distance(cursor, start);
            } else {
                let t = ((cursor[0] - start[0]) * (end[0] - start[0]) + (cursor[1] - start[1]) * (end[1] - start[1])) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = start[0] + t * (end[0] - start[0]);
                const projY = start[1] + t * (end[1] - start[1]);
                dist = distance(cursor, [projX, projY]);
            }
        } else if (entity.geometry.Circle) {
            const { center, radius } = entity.geometry.Circle;
            const dCenter = distance(cursor, center);
            dist = Math.abs(dCenter - radius);
        } else if (entity.geometry.Arc) {
            const { center, radius } = entity.geometry.Arc;
            const dCenter = distance(cursor, center);
            const distRadius = Math.abs(dCenter - radius);

            // Allow selecting if near the arc curve
            if (distRadius < threshold) {
                // Check angle (TODO: Verify angle within start/end)
                dist = distRadius;
            }
        }

        if (dist < bestDist) {
            bestDist = dist;
            bestMatch = { id: entity.id, type, distance: dist };
        }
    }

    return bestMatch;
}

/**
 * Geometric snapping for line creation - snaps to Parallel/Perpendicular of existing lines.
 * Returns the snapped cursor position and snap info.
 */
export function applyGeometricSnapping(
    startPoint: [number, number],
    cursor: [number, number],
    sketch: Sketch,
    tolerance: number = 0.087 // ~5 degrees
): { position: [number, number]; snapped: boolean; snapType: "parallel" | "perpendicular" | null; entityId: string | null } {
    const dx = cursor[0] - startPoint[0];
    const dy = cursor[1] - startPoint[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) {
        return { position: cursor, snapped: false, snapType: null, entityId: null };
    }

    const currentAngle = Math.atan2(dy, dx);
    let bestMatch: { type: "parallel" | "perpendicular"; entityId: string; diff: number } | null = null;
    let minDiff = tolerance;

    for (const entity of sketch.entities) {
        if (entity.id.startsWith("preview_")) continue;
        if (entity.geometry.Line) {
            const { start, end } = entity.geometry.Line;
            const lDx = end[0] - start[0];
            const lDy = end[1] - start[1];
            const lineAngle = Math.atan2(lDy, lDx);

            // Parallel Check
            let angleDiff = Math.abs(currentAngle - lineAngle);
            // Normalize to [0, π]
            while (angleDiff > Math.PI) angleDiff -= Math.PI;
            if (angleDiff > Math.PI / 2) angleDiff = Math.PI - angleDiff;

            if (angleDiff < minDiff) {
                minDiff = angleDiff;
                bestMatch = { type: "parallel", entityId: entity.id, diff: angleDiff };
            }

            // Perpendicular Check
            // Angle between lines is alpha. We want alpha ~ 90.
            let relAngle = Math.abs(currentAngle - lineAngle);
            while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
            relAngle = Math.abs(relAngle);

            const pDiff = Math.abs(relAngle - Math.PI / 2);
            if (pDiff < minDiff) {
                minDiff = pDiff;
                bestMatch = { type: "perpendicular", entityId: entity.id, diff: pDiff };
            }
        }
    }

    if (bestMatch) {
        // Calculate snapped position
        let targetAngle = currentAngle; // Placeholder

        const entity = sketch.entities.find(e => e.id === bestMatch!.entityId);
        if (entity && entity.geometry.Line) {
            const { start, end } = entity.geometry.Line;
            const lineAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);

            if (bestMatch.type === "parallel") {
                // Snap to lineAngle (or lineAngle + PI)
                // Check dot product to see direction
                // cos(theta) > 0 -> same dir.
                const dot = Math.cos(currentAngle - lineAngle);
                targetAngle = dot >= 0 ? lineAngle : lineAngle + Math.PI;

            } else {
                // Perpendicular: lineAngle + 90 or -90
                const normAngle = lineAngle + Math.PI / 2;
                // Check dot product with Normal
                const dot = Math.cos(currentAngle - normAngle);
                targetAngle = dot >= 0 ? normAngle : normAngle + Math.PI;
            }

            return {
                position: [
                    startPoint[0] + dist * Math.cos(targetAngle),
                    startPoint[1] + dist * Math.sin(targetAngle)
                ],
                snapped: true,
                snapType: bestMatch.type,
                entityId: bestMatch.entityId
            };
        }
    }

    return { position: cursor, snapped: false, snapType: null, entityId: null };
}
