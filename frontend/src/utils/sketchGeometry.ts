/**
 * Sketch-specific geometry utilities for coordinate transforms and entity queries.
 * 
 * Used for:
 * - Transforming 2D sketch coordinates to 3D world space
 * - Querying entity positions from sketch data
 * - Working with constraint points
 */

import * as THREE from 'three';
import type { SketchPlane, SketchEntity, Sketch } from '../types';

/**
 * Transform a 2D sketch coordinate to 3D world space.
 * 
 * @param x X coordinate in sketch space
 * @param y Y coordinate in sketch space
 * @param plane The sketch plane defining the transform
 * @returns THREE.Vector3 in world space
 */
export function sketchToWorld(x: number, y: number, plane: SketchPlane): THREE.Vector3 {
    const origin = new THREE.Vector3().fromArray(plane.origin);
    const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
    const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
    return origin.clone().add(xAxis.clone().multiplyScalar(x)).add(yAxis.clone().multiplyScalar(y));
}

/**
 * Create a 4x4 transformation matrix for a sketch plane.
 * Useful for positioning groups of objects on the sketch plane.
 */
export function createSketchPlaneMatrix(plane: SketchPlane): THREE.Matrix4 {
    const origin = new THREE.Vector3().fromArray(plane.origin);
    const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
    const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
    const normal = new THREE.Vector3().fromArray(plane.normal || [0, 0, 1]);

    const matrix = new THREE.Matrix4();
    matrix.set(
        xAxis.x, yAxis.x, normal.x, origin.x,
        xAxis.y, yAxis.y, normal.y, origin.y,
        xAxis.z, yAxis.z, normal.z, origin.z,
        0, 0, 0, 1
    );
    return matrix;
}

// Origin entity ID used for origin-referenced constraints
const ORIGIN_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Get an entity by ID from a sketch.
 */
export function getEntityById(sketch: Sketch, id: string): SketchEntity | undefined {
    return sketch.entities.find(e => e.id === id);
}

/**
 * Get the position of a constraint point.
 * A constraint point references an entity + index (for endpoints).
 * 
 * @param sketch The sketch containing the entities
 * @param cp Constraint point with id and index
 * @returns 2D position or null if not found
 */
export function getConstraintPointPosition(
    sketch: Sketch,
    cp: { id: string; index: number }
): [number, number] | null {
    // Origin point
    if (cp.id === ORIGIN_ENTITY_ID || cp.id === "origin") return [0, 0];

    const entity = getEntityById(sketch, cp.id);
    if (!entity) return null;

    const geom = entity.geometry;

    if (geom.Line) {
        return cp.index === 0 ? geom.Line.start : geom.Line.end;
    }
    if (geom.Circle) {
        return geom.Circle.center;
    }
    if (geom.Arc) {
        const { center, radius, start_angle, end_angle } = geom.Arc;
        if (cp.index === 0) return center;
        const angle = cp.index === 1 ? start_angle : end_angle;
        return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
    }
    if (geom.Point) {
        return geom.Point.pos;
    }
    if (geom.Ellipse) {
        return geom.Ellipse.center;
    }

    return null;
}

/**
 * Get the midpoint of a line entity.
 */
export function getLineMidpoint(sketch: Sketch, entityId: string): [number, number] | null {
    const entity = getEntityById(sketch, entityId);
    if (!entity?.geometry.Line) return null;

    const { start, end } = entity.geometry.Line;
    return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

/**
 * Get line geometry by entity ID.
 */
export function getLineGeometry(
    sketch: Sketch,
    entityId: string
): { start: [number, number]; end: [number, number] } | null {
    const entity = getEntityById(sketch, entityId);
    if (!entity?.geometry.Line) return null;
    return entity.geometry.Line;
}

/**
 * Get circle geometry by entity ID.
 */
export function getCircleGeometry(
    sketch: Sketch,
    entityId: string
): { center: [number, number]; radius: number } | null {
    const entity = getEntityById(sketch, entityId);
    if (!entity?.geometry.Circle) return null;
    return entity.geometry.Circle;
}

/**
 * Get arc geometry by entity ID.
 */
export function getArcGeometry(
    sketch: Sketch,
    entityId: string
): { center: [number, number]; radius: number; start_angle: number; end_angle: number } | null {
    const entity = getEntityById(sketch, entityId);
    if (!entity?.geometry.Arc) return null;
    return entity.geometry.Arc;
}

/**
 * Calculate the direction vector of a line entity.
 * Returns normalized direction from start to end.
 */
export function getLineDirection(sketch: Sketch, entityId: string): [number, number] | null {
    const line = getLineGeometry(sketch, entityId);
    if (!line) return null;

    const dx = line.end[0] - line.start[0];
    const dy = line.end[1] - line.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 1e-10) return null;
    return [dx / len, dy / len];
}

/**
 * Calculate the length of a line entity.
 */
export function getLineLength(sketch: Sketch, entityId: string): number | null {
    const line = getLineGeometry(sketch, entityId);
    if (!line) return null;

    const dx = line.end[0] - line.start[0];
    const dy = line.end[1] - line.start[1];
    return Math.sqrt(dx * dx + dy * dy);
}
