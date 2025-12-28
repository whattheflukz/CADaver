/**
 * ViewportClickHandler - Handles click events in the 3D viewport.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Plane selection during sketch setup
 * - Entity selection (sketch entities, faces, edges, vertices)
 * - Region click handling for extrude mode
 */

import * as THREE from 'three';
import type { Tessellation, SketchPlane, Sketch } from '../types';
import {
    getIntersects as doRaycastIntersects,
    getSketchPlaneIntersection as doSketchPlaneIntersection,
    getIntersectsWithPlanes as doIntersectsWithPlanes,
    type RaycastingContext,
    type SketchPlaneContext
} from './RaycastService';

// --- Types ---

export interface ClickHandlerContext {
    getRaycastContext: () => RaycastingContext;
    getSketchContext: () => SketchPlaneContext;
    mainMesh: THREE.Mesh | null;
}

export interface ClickHandlerProps {
    sketchSetupMode?: boolean;
    onSelectPlane?: (plane: SketchPlane) => void;
    onSelect?: (topoId: any, modifier: "replace" | "add" | "remove") => void;
    onRegionClick?: (point2d: [number, number]) => void;
    tessellation?: Tessellation | null;
    clientSketch?: Sketch;
}

// --- Main Click Handler ---

/**
 * Handles canvas click events for plane selection and entity selection.
 * 
 * @param event The mouse event
 * @param ctx Context containing raycast helpers and main mesh reference
 * @param props Props containing callbacks and mode flags
 */
export function handleCanvasClick(
    event: MouseEvent,
    ctx: ClickHandlerContext,
    props: ClickHandlerProps
): void {
    const { getRaycastContext, getSketchContext, mainMesh } = ctx;

    // --- SKETCH SETUP MODE: Plane Selection ---
    if (props.sketchSetupMode && props.onSelectPlane) {
        const intersects = doIntersectsWithPlanes(event.clientX, event.clientY, getRaycastContext());

        if (intersects.length > 0) {
            // Check for Plane Helper first
            const planeHelperHit = intersects.find(i => i.object.userData.isPlaneHelper);
            if (planeHelperHit) {
                props.onSelectPlane(planeHelperHit.object.userData.plane);
                return;
            }

            // Fallback to Face selection for custom planes
            const faceHit = intersects.find(i => i.faceIndex !== undefined && i.object === mainMesh);
            if (faceHit && faceHit.faceIndex !== undefined) {
                const normal = faceHit.face!.normal.clone();
                // Simple axis alignment
                let xAxis = new THREE.Vector3(0, 1, 0).cross(normal);
                if (xAxis.lengthSq() < 0.001) xAxis = new THREE.Vector3(1, 0, 0).cross(normal);
                xAxis.normalize();
                const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

                props.onSelectPlane({
                    origin: [faceHit.point.x, faceHit.point.y, faceHit.point.z],
                    normal: [normal.x, normal.y, normal.z],
                    x_axis: [xAxis.x, xAxis.y, xAxis.z],
                    y_axis: [yAxis.x, yAxis.y, yAxis.z]
                });
                return;
            }
        }
    }

    // --- NORMAL MODE: Entity Selection ---
    if (!props.onSelect) return;

    const intersects = doRaycastIntersects(event.clientX, event.clientY, getRaycastContext());

    // Determine modifier from keyboard state
    let modifier: "replace" | "add" | "remove" = "replace";
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
        modifier = "add";
    }

    if (intersects.length > 0) {
        const topoId = findTopoIdFromIntersects(intersects, mainMesh, props);

        if (topoId) {
            props.onSelect(topoId, modifier);
        } else {
            // No specific geometry clicked, try region click
            handleRegionClick(event, getRaycastContext, getSketchContext, props);
        }
    } else {
        // Clicked empty space
        if (!handleRegionClick(event, getRaycastContext, getSketchContext, props)) {
            props.onSelect(null, "replace");
        }
    }
}

// --- Helper: Find TopoId from Intersections ---

function findTopoIdFromIntersects(
    intersects: THREE.Intersection[],
    mainMesh: THREE.Mesh | null,
    props: ClickHandlerProps
): any {
    for (const hit of intersects) {
        // Skip highlight meshes
        if (hit.object.name.includes('highlight') || hit.object.name.includes('selection')) {
            continue;
        }

        // 1. SKETCH ENTITY SELECTION (has userData.idMap) - highest priority
        if (hit.object.userData?.idMap) {
            const idx = hit.index ?? hit.faceIndex;
            if (idx !== undefined && idx !== null && hit.object.userData.idMap[idx]) {
                const entId = hit.object.userData.idMap[idx];
                let type: "entity" | "point" | "origin" = "entity";

                // Check if it's a point entity
                if (props.clientSketch) {
                    const ent = props.clientSketch.entities.find((e: any) => e.id === entId);
                    if (ent && ent.geometry.Point) {
                        type = "point";
                    }
                }

                return { id: entId, type };
            }
            continue;
        }

        // 2. FACE SELECTION (mainMesh with faceIndex)
        if (hit.object === mainMesh && hit.faceIndex != null && props.tessellation?.triangle_ids) {
            const idx = hit.faceIndex;
            if (idx >= 0 && idx < props.tessellation.triangle_ids.length) {
                return props.tessellation.triangle_ids[idx];
            }
            continue;
        }

        // 3. EDGE SELECTION (LineSegments2 named "sketch_lines")
        if (hit.object.name === 'sketch_lines' && hit.faceIndex != null && props.tessellation?.line_ids) {
            const idx = hit.faceIndex;
            if (idx >= 0 && idx < props.tessellation.line_ids.length) {
                return props.tessellation.line_ids[idx];
            }
            continue;
        }

        // 4. VERTEX SELECTION (Points named "vertices")
        if (hit.object.name === 'vertices' && hit.index != null && props.tessellation?.point_ids) {
            const idx = hit.index;
            if (idx >= 0 && idx < props.tessellation.point_ids.length) {
                return props.tessellation.point_ids[idx];
            }
            continue;
        }
    }

    return null;
}

// --- Helper: Handle Region Click ---

function handleRegionClick(
    event: MouseEvent,
    getRaycastContext: () => RaycastingContext,
    getSketchContext: () => SketchPlaneContext,
    props: ClickHandlerProps
): boolean {
    if (props.onRegionClick && props.clientSketch?.plane) {
        const target = doSketchPlaneIntersection(
            event.clientX,
            event.clientY,
            getRaycastContext(),
            getSketchContext()
        );
        if (target) {
            console.log("ViewportClickHandler: Region Click Detected at", target, "Sketch Plane:", props.clientSketch?.plane);
            props.onRegionClick([target[0], target[1]]);
            return true;
        } else {
            console.warn("ViewportClickHandler: Region click failed - no intersection or no plane context");
        }
    }
    return false;
}
