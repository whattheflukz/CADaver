/**
 * PatternToolInput - Handles input for pattern tools (mirror, linear/circular pattern).
 * Extracted from useSketching.ts handleSketchInput to reduce file size.
 */

import type { Sketch, SnapPoint } from '../types';
import type { MirrorState, LinearPatternState, CircularPatternStateExtended } from './usePatternTools';

/**
 * Find the nearest entity hit by a point with optional snap override.
 * Shared hit-test logic for pattern tools.
 */
export function findHitEntity(
    point: [number, number],
    snap: SnapPoint | null,
    sketch: Sketch,
    threshold: number = 0.5
): string | null {
    // Priority to snap entity
    if (snap?.entity_id) return snap.entity_id;

    let minDist = threshold;
    let foundId: string | null = null;

    for (const ent of sketch.entities) {
        let dist = Infinity;

        if (ent.geometry.Point) {
            const ep = ent.geometry.Point.pos;
            dist = Math.sqrt((point[0] - ep[0]) ** 2 + (point[1] - ep[1]) ** 2);
        } else if (ent.geometry.Line) {
            dist = pointToLineDistance(point, ent.geometry.Line.start, ent.geometry.Line.end);
        } else if (ent.geometry.Circle) {
            const c = ent.geometry.Circle;
            const dCenter = Math.sqrt((point[0] - c.center[0]) ** 2 + (point[1] - c.center[1]) ** 2);
            dist = Math.abs(dCenter - c.radius);
        } else if (ent.geometry.Arc) {
            const a = ent.geometry.Arc;
            const dCenter = Math.sqrt((point[0] - a.center[0]) ** 2 + (point[1] - a.center[1]) ** 2);
            dist = Math.abs(dCenter - a.radius);
        }

        if (dist < minDist) {
            minDist = dist;
            foundId = ent.id;
        }
    }

    return foundId;
}

/**
 * Calculate distance from point to line segment.
 */
function pointToLineDistance(
    point: [number, number],
    start: [number, number],
    end: [number, number]
): number {
    const v = [end[0] - start[0], end[1] - start[1]];
    const w = [point[0] - start[0], point[1] - start[1]];
    const c1 = w[0] * v[0] + w[1] * v[1];
    const c2 = v[0] * v[0] + v[1] * v[1];
    let b = c2 > 0 ? c1 / c2 : 0;
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    const pb = [start[0] + b * v[0], start[1] + b * v[1]];
    return Math.sqrt((point[0] - pb[0]) ** 2 + (point[1] - pb[1]) ** 2);
}

/**
 * Handle mirror tool input (axis and entity selection).
 */
export function handleMirrorInput(
    point: [number, number],
    snap: SnapPoint | null,
    sketch: Sketch,
    state: MirrorState,
    setState: (s: MirrorState) => void
): void {
    if (state.activeField === 'axis') {
        // Select axis - only accept lines
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId) {
            const ent = sketch.entities.find(e => e.id === targetId);
            if (ent?.geometry.Line) {
                setState({ ...state, axis: ent.id, activeField: 'entities' });
            }
        }
    } else {
        // Toggle entity selection
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId && targetId !== state.axis) {
            const current = state.entities;
            if (current.includes(targetId)) {
                setState({ ...state, entities: current.filter(id => id !== targetId) });
            } else {
                setState({ ...state, entities: [...current, targetId] });
            }
        }
    }
}

/**
 * Handle linear pattern tool input (direction and entity selection).
 */
export function handleLinearPatternInput(
    point: [number, number],
    snap: SnapPoint | null,
    sketch: Sketch,
    state: LinearPatternState,
    setState: (s: LinearPatternState) => void
): void {
    if (state.activeField === 'direction') {
        // Select direction line
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId) {
            const ent = sketch.entities.find(e => e.id === targetId);
            if (ent?.geometry.Line) {
                setState({ ...state, direction: ent.id, activeField: 'entities' });
            }
        }
    } else {
        // Toggle entity selection
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId && targetId !== state.direction) {
            const current = state.entities;
            if (current.includes(targetId)) {
                setState({ ...state, entities: current.filter(id => id !== targetId) });
            } else {
                setState({ ...state, entities: [...current, targetId] });
            }
        }
    }
}

/**
 * Handle circular pattern tool input (center and entity selection).
 */
export function handleCircularPatternInput(
    point: [number, number],
    snap: SnapPoint | null,
    sketch: Sketch,
    state: CircularPatternStateExtended,
    setState: (s: CircularPatternStateExtended) => void
): void {
    if (state.activeField === 'center' && state.centerType === 'point') {
        // Select center point
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId) {
            setState({ ...state, centerId: targetId, activeField: 'entities' });
        }
    } else if (state.activeField === 'entities' || state.centerType === 'origin') {
        // Toggle entity selection
        const targetId = findHitEntity(point, snap, sketch);
        if (targetId && targetId !== state.centerId) {
            const currentEntities = state.entities;
            if (currentEntities.includes(targetId)) {
                setState({ ...state, entities: currentEntities.filter(id => id !== targetId), activeField: 'entities' });
            } else {
                setState({ ...state, entities: [...currentEntities, targetId], activeField: 'entities' });
            }
        }
    }
}
