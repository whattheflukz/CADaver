/**
 * Sketch region utilities for computing closed regions from sketch entities.
 * 
 * Used for:
 * - Extrusion profile selection
 * - Region detection for boolean operations
 */

import type { SketchEntity, SketchRegion } from '../types';
import { pointsEqual, polygonArea, polygonCentroid, pointInPolygon, pointKey } from './geometryUtils';

/**
 * Compute regions from sketch entities using frontend logic.
 * Handles: circles, ellipses, and closed line loops (rectangles, triangles, etc.)
 * 
 * NOTE: This does NOT handle regions formed by intersecting entities (like the lens
 * between two overlapping circles). That requires the full planar graph algorithm
 * which is implemented in the backend regions.rs module.
 */
export function computeRegionsFromEntities(entities: SketchEntity[]): SketchRegion[] {
    const regions: SketchRegion[] = [];

    // 1. Collect self-contained regions (circles, ellipses)
    for (const entity of entities) {
        if (entity.is_construction) continue;

        if (entity.geometry.Circle) {
            const { center, radius } = entity.geometry.Circle;
            const segments = 32;
            const points: [number, number][] = [];
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * 2 * Math.PI;
                points.push([
                    center[0] + radius * Math.cos(angle),
                    center[1] + radius * Math.sin(angle)
                ]);
            }
            regions.push({
                id: `region_${entity.id}`,
                boundary_entity_ids: [entity.id],
                boundary_points: points,
                voids: [],
                centroid: center,
                area: Math.PI * radius * radius
            });
        } else if (entity.geometry.Ellipse) {
            const { center, semi_major, semi_minor, rotation } = entity.geometry.Ellipse;
            const segments = 32;
            const points: [number, number][] = [];
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            for (let i = 0; i < segments; i++) {
                const t = (i / segments) * 2 * Math.PI;
                const xLocal = semi_major * Math.cos(t);
                const yLocal = semi_minor * Math.sin(t);
                points.push([
                    center[0] + xLocal * cosR - yLocal * sinR,
                    center[1] + xLocal * sinR + yLocal * cosR
                ]);
            }
            regions.push({
                id: `region_${entity.id}`,
                boundary_entity_ids: [entity.id],
                boundary_points: points,
                voids: [],
                centroid: center,
                area: Math.PI * semi_major * semi_minor
            });
        }
    }

    // 2. Find closed loops formed by connected lines
    const lines = entities.filter(e => !e.is_construction && e.geometry.Line);
    const endpointMap = new Map<string, { entity: SketchEntity; isStart: boolean }[]>();

    for (const line of lines) {
        const { start, end } = line.geometry.Line!;
        const startKey = pointKey(start);
        const endKey = pointKey(end);

        if (!endpointMap.has(startKey)) endpointMap.set(startKey, []);
        if (!endpointMap.has(endKey)) endpointMap.set(endKey, []);

        endpointMap.get(startKey)!.push({ entity: line, isStart: true });
        endpointMap.get(endKey)!.push({ entity: line, isStart: false });
    }

    // Find closed loops by traversing
    const usedLines = new Set<string>();

    for (const line of lines) {
        if (usedLines.has(line.id)) continue;

        // Try to trace a loop starting from this line
        const loopEntities: SketchEntity[] = [line];
        const loopPoints: [number, number][] = [];

        const { start, end } = line.geometry.Line!;
        loopPoints.push(start);
        let currentEnd = end;
        let foundLoop = false;

        const visited = new Set<string>([line.id]);

        while (loopEntities.length < lines.length) {
            const currentKey = pointKey(currentEnd);
            const neighbors = endpointMap.get(currentKey) || [];

            // Find next unvisited connected line
            let nextLine: { entity: SketchEntity; isStart: boolean } | null = null;
            for (const n of neighbors) {
                if (!visited.has(n.entity.id)) {
                    nextLine = n;
                    break;
                }
            }

            if (!nextLine) break;

            visited.add(nextLine.entity.id);
            loopEntities.push(nextLine.entity);
            loopPoints.push(currentEnd);

            const { start: nStart, end: nEnd } = nextLine.entity.geometry.Line!;
            currentEnd = nextLine.isStart ? nEnd : nStart;

            // Check if we've completed the loop
            if (pointsEqual(currentEnd, start)) {
                foundLoop = true;
                break;
            }
        }

        if (foundLoop && loopEntities.length >= 3) {
            // Mark all lines in loop as used
            loopEntities.forEach(e => usedLines.add(e.id));

            // Compute centroid and area
            const centroid = polygonCentroid(loopPoints);
            const area = polygonArea(loopPoints);

            regions.push({
                id: `region_loop_${loopEntities.map(e => e.id).join('_').substring(0, 20)}`,
                boundary_entity_ids: loopEntities.map(e => e.id),
                boundary_points: loopPoints,
                voids: [],
                centroid: centroid,
                area: area
            });
        }
    }

    return regions;
}

/**
 * Test if a point is inside a region using winding number algorithm.
 * Wrapper around pointInPolygon that works with SketchRegion type.
 */
export function pointInRegion(point: [number, number], region: SketchRegion): boolean {
    return pointInPolygon(point, region.boundary_points);
}
