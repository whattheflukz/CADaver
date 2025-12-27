/**
 * Raycasting utilities for viewport intersection detection.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Solid geometry picking (faces, edges, vertices)
 * - Sketch plane intersection
 * - Plane helper picking
 * - Priority-based intersection sorting
 */

import * as THREE from 'three';
import type { SketchPlane } from '../types';

export interface RaycastingContext {
    containerRef: HTMLDivElement | null;
    camera: THREE.Camera | null;
    scene: THREE.Scene;
    mainMesh: THREE.Mesh | null;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
}

export interface SketchPlaneContext {
    plane: SketchPlane | null;
}

/**
 * Calculate intersection point with sketch plane in local coordinates.
 */
export function getSketchPlaneIntersection(
    clientX: number,
    clientY: number,
    ctx: RaycastingContext,
    sketchCtx: SketchPlaneContext
): [number, number, number] | null {
    if (!sketchCtx.plane || !ctx.camera || !ctx.containerRef) return null;

    const p = sketchCtx.plane;
    const origin = new THREE.Vector3().fromArray(p.origin);
    const xAxis = new THREE.Vector3().fromArray(p.x_axis);
    const yAxis = new THREE.Vector3().fromArray(p.y_axis);
    const normal = new THREE.Vector3().fromArray(p.normal || [0, 0, 1]);

    const constant = -origin.dot(normal);
    const plane = new THREE.Plane(normal, constant);

    const rect = ctx.containerRef.getBoundingClientRect();
    ctx.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ctx.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);

    const targetWorld = new THREE.Vector3();
    const hit = ctx.raycaster.ray.intersectPlane(plane, targetWorld);

    if (!hit) return null;

    const diff = new THREE.Vector3().subVectors(targetWorld, origin);
    const u = diff.dot(xAxis);
    const v = diff.dot(yAxis);

    return [u, v, 0];
}

/**
 * Priority scoring for intersection sorting.
 * Lower scores = higher priority.
 */
function typeScore(obj: THREE.Object3D): number {
    // Highest priority: Dimension Hitboxes / Controls
    if (obj.userData && obj.userData.isDimensionHitbox) return -3;

    // High priority: Sketch Elements (Lines/Points)
    let parent = obj.parent;
    while (parent) {
        if (parent.name === "sketch_renderer_group") return -2;
        if (parent.name === "snap_markers_group") return -1;
        parent = parent.parent;
    }

    if (obj.type === 'Points') return -1;
    if (obj.type === 'LineSegments') return 0;
    return 2; // Mesh (Faces) - lowest priority
}

/**
 * Perform raycasting against scene objects.
 * Returns intersections sorted by distance and type priority.
 */
export function getIntersects(
    clientX: number,
    clientY: number,
    ctx: RaycastingContext
): THREE.Intersection[] {
    if (!ctx.containerRef || !ctx.camera) return [];

    const rect = ctx.containerRef.getBoundingClientRect();
    ctx.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ctx.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);

    // Set thresholds for easier picking
    ctx.raycaster.params.Points.threshold = 10;
    ctx.raycaster.params.Line.threshold = 4.0;

    // Collect targets
    const targets: THREE.Object3D[] = [];

    // 1. Tessellation (Main Mesh)
    if (ctx.mainMesh) {
        targets.push(ctx.mainMesh);
        if (ctx.mainMesh.children.length > 0) {
            ctx.mainMesh.children.forEach(c => targets.push(c));
        }
    }

    // 2. Sketch Renderer Group
    const sketchGroup = ctx.scene.getObjectByName("sketch_renderer_group");
    if (sketchGroup) targets.push(sketchGroup);

    // 3. Dimension Renderer Group (for hitboxes)
    const dimGroup = ctx.scene.getObjectByName("dimension_renderer_group");
    if (dimGroup) targets.push(dimGroup);

    // 4. Snap Markers
    const snapGroup = ctx.scene.getObjectByName("snap_markers_group");
    if (snapGroup) targets.push(snapGroup);

    // Recursive intersect for groups
    const intersects = ctx.raycaster.intersectObjects(targets, true);

    // Sort by priority
    intersects.sort((a, b) => {
        const distDiff = a.distance - b.distance;
        if (Math.abs(distDiff) > 0.0001) {
            return distDiff;
        }
        return typeScore(a.object) - typeScore(b.object);
    });

    return intersects;
}

/**
 * Raycast against plane selection helpers.
 * Used for sketch plane selection mode.
 */
export function getIntersectsWithPlanes(
    clientX: number,
    clientY: number,
    ctx: RaycastingContext
): THREE.Intersection[] {
    if (!ctx.containerRef || !ctx.camera) return [];

    const rect = ctx.containerRef.getBoundingClientRect();
    ctx.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ctx.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);

    const targets: THREE.Object3D[] = [];

    // Add Plane Helpers
    const planeGroup = ctx.scene.getObjectByName("plane_selection_helpers");
    if (planeGroup) {
        targets.push(...planeGroup.children);
    }

    // Add Geometry Faces
    if (ctx.mainMesh) {
        targets.push(ctx.mainMesh);
    }

    return ctx.raycaster.intersectObjects(targets, false);
}

/**
 * Transform world coordinates to local sketch coordinates.
 */
export function worldToSketchLocal(
    worldPos: THREE.Vector3,
    sketchCtx: SketchPlaneContext
): { x: number; y: number } {
    if (!sketchCtx.plane) return { x: worldPos.x, y: worldPos.y };

    const p = sketchCtx.plane;
    const origin = new THREE.Vector3(p.origin[0], p.origin[1], p.origin[2]);
    const xAxis = new THREE.Vector3(p.x_axis[0], p.x_axis[1], p.x_axis[2]);
    const yAxis = new THREE.Vector3(p.y_axis[0], p.y_axis[1], p.y_axis[2]);

    const diff = worldPos.clone().sub(origin);
    return {
        x: diff.dot(xAxis),
        y: diff.dot(yAxis)
    };
}

/**
 * Helper: compare TopoIds robustly (handles large numbers as strings)
 */
export function topoIdMatches(a: any, b: any): boolean {
    if (!a || !b) return false;
    // Compare feature_id as string, local_id as string, rank as string
    return String(a.feature_id) === String(b.feature_id)
        && String(a.local_id) === String(b.local_id)
        && String(a.rank) === String(b.rank);
}
