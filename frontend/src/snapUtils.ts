/**
 * Client-side snap detection for sketch mode.
 * Mirrors the backend snap.rs logic for responsive client-side snapping.
 */

import { type Sketch, type SnapPoint, type SnapConfig, type SnapType } from './types';

/** Calculate distance between two 2D points */
function distance(a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/** Line-line segment intersection */
function lineLineIntersection(
    l1s: [number, number], l1e: [number, number],
    l2s: [number, number], l2e: [number, number]
): [number, number] | null {
    const d1x = l1e[0] - l1s[0];
    const d1y = l1e[1] - l1s[1];
    const d2x = l2e[0] - l2s[0];
    const d2y = l2e[1] - l2s[1];

    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return null;

    const dx = l2s[0] - l1s[0];
    const dy = l2s[1] - l1s[1];

    const t = (dx * d2y - dy * d2x) / cross;
    const s = (dx * d1y - dy * d1x) / cross;

    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
        return [l1s[0] + t * d1x, l1s[1] + t * d1y];
    }
    return null;
}

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
