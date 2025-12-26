/**
 * Shared geometry utility functions for 2D operations.
 * 
 * These functions are used across the codebase for:
 * - Snap detection
 * - Region computation
 * - Hit testing
 * - General geometry calculations
 */

/**
 * Calculate Euclidean distance between two 2D points.
 */
export function distance(a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance between two 2D points.
 * Use this when you only need to compare distances (avoids sqrt).
 */
export function distanceSquared(a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return dx * dx + dy * dy;
}

/**
 * Line-line segment intersection.
 * Returns the intersection point if the two line segments intersect, null otherwise.
 * 
 * @param l1s Start point of first line segment
 * @param l1e End point of first line segment
 * @param l2s Start point of second line segment
 * @param l2e End point of second line segment
 * @returns Intersection point or null if no intersection
 */
export function lineLineIntersection(
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

/**
 * Test if two 2D points are approximately equal within epsilon tolerance.
 */
export function pointsEqual(
    a: [number, number],
    b: [number, number],
    epsilon: number = 1e-6
): boolean {
    return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

/**
 * Calculate the midpoint between two 2D points.
 */
export function midpoint(a: [number, number], b: [number, number]): [number, number] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Compute signed area of a polygon using the Shoelace formula.
 * Positive values indicate counter-clockwise winding.
 */
export function signedPolygonArea(points: [number, number][]): number {
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }
    return area / 2;
}

/**
 * Compute polygon area (absolute value).
 */
export function polygonArea(points: [number, number][]): number {
    return Math.abs(signedPolygonArea(points));
}

/**
 * Compute centroid of a polygon.
 */
export function polygonCentroid(points: [number, number][]): [number, number] {
    if (points.length === 0) return [0, 0];
    if (points.length < 3) {
        // For degenerate cases, return average
        let cx = 0, cy = 0;
        for (const p of points) {
            cx += p[0];
            cy += p[1];
        }
        return [cx / points.length, cy / points.length];
    }

    const area6 = signedPolygonArea(points) * 6;
    if (Math.abs(area6) < 1e-10) {
        // Degenerate polygon - return simple average
        let cx = 0, cy = 0;
        for (const p of points) {
            cx += p[0];
            cy += p[1];
        }
        return [cx / points.length, cy / points.length];
    }

    let cx = 0, cy = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const cross = points[i][0] * points[j][1] - points[j][0] * points[i][1];
        cx += (points[i][0] + points[j][0]) * cross;
        cy += (points[i][1] + points[j][1]) * cross;
    }

    return [cx / area6, cy / area6];
}

/**
 * Test if a point is inside a polygon using the winding number algorithm.
 * Works correctly for concave polygons.
 * 
 * @param point The point to test
 * @param polygon Array of vertices forming the polygon boundary
 * @returns true if point is inside the polygon
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    if (polygon.length < 3) return false;

    let winding = 0;
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % n];

        if (p1[1] <= point[1]) {
            if (p2[1] > point[1]) {
                const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
                if (cross > 0) winding++;
            }
        } else {
            if (p2[1] <= point[1]) {
                const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
                if (cross < 0) winding--;
            }
        }
    }

    return winding !== 0;
}

/**
 * Normalize an angle to the range [0, 2π).
 */
export function normalizeAngle(angle: number): number {
    const twoPi = 2 * Math.PI;
    return ((angle % twoPi) + twoPi) % twoPi;
}

/**
 * Calculate angle from point a to point b (in radians).
 */
export function angleBetweenPoints(a: [number, number], b: [number, number]): number {
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/**
 * Rotate a point around the origin by the given angle.
 */
export function rotatePoint(point: [number, number], angle: number): [number, number] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        point[0] * cos - point[1] * sin,
        point[0] * sin + point[1] * cos
    ];
}

/**
 * Rotate a point around a center by the given angle.
 */
export function rotatePointAround(
    point: [number, number],
    center: [number, number],
    angle: number
): [number, number] {
    const translated: [number, number] = [point[0] - center[0], point[1] - center[1]];
    const rotated = rotatePoint(translated, angle);
    return [rotated[0] + center[0], rotated[1] + center[1]];
}

/**
 * Create a unique string key for a 2D point (for Map/Set usage).
 */
export function pointKey(p: [number, number], precision: number = 6): string {
    return `${p[0].toFixed(precision)},${p[1].toFixed(precision)}`;
}
