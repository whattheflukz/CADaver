/**
 * PlaneHelperManager - Manages plane selection helper visualizations.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Creating XY/XZ/YZ plane helper meshes
 * - Updating plane helpers based on sketch setup mode
 * - Proper cleanup/disposal of plane helper geometry
 */

import * as THREE from 'three';

const PLANE_HELPER_NAME = "plane_selection_helpers";
const PLANE_SIZE = 10;
const PLANE_OPACITY = 0.2;

/**
 * Standard plane definitions for XY, XZ, YZ planes.
 */
const STANDARD_PLANES = [
    {
        name: "XY Plane",
        color: 0x0000ff,  // Blue
        rotation: null,   // No rotation needed
        plane: {
            origin: [0, 0, 0] as [number, number, number],
            normal: [0, 0, 1] as [number, number, number],
            x_axis: [1, 0, 0] as [number, number, number],
            y_axis: [0, 1, 0] as [number, number, number]
        }
    },
    {
        name: "XZ Plane",
        color: 0x00ff00,  // Green
        rotation: { axis: 'x', angle: -Math.PI / 2 },
        plane: {
            origin: [0, 0, 0] as [number, number, number],
            normal: [0, 1, 0] as [number, number, number],
            x_axis: [1, 0, 0] as [number, number, number],
            y_axis: [0, 0, -1] as [number, number, number]
        }
    },
    {
        name: "YZ Plane",
        color: 0xff0000,  // Red
        rotation: { axis: 'y', angle: Math.PI / 2 },
        plane: {
            origin: [0, 0, 0] as [number, number, number],
            normal: [1, 0, 0] as [number, number, number],
            x_axis: [0, 1, 0] as [number, number, number],
            y_axis: [0, 0, 1] as [number, number, number]
        }
    }
];

/**
 * Clears existing plane helpers from the scene.
 */
export function clearPlaneHelpers(scene: THREE.Scene): void {
    const group = scene.getObjectByName(PLANE_HELPER_NAME);
    if (group) {
        scene.remove(group);
        group.traverse((child) => {
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        });
    }
}

/**
 * Creates plane helper visualizations for sketch plane selection.
 */
export function createPlaneHelpers(scene: THREE.Scene): void {
    const group = new THREE.Group();
    group.name = PLANE_HELPER_NAME;

    for (const planeDef of STANDARD_PLANES) {
        const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
        const mat = new THREE.MeshBasicMaterial({
            color: planeDef.color,
            transparent: true,
            opacity: PLANE_OPACITY,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = planeDef.name;

        // Apply rotation if needed
        if (planeDef.rotation) {
            if (planeDef.rotation.axis === 'x') {
                mesh.rotateX(planeDef.rotation.angle);
            } else if (planeDef.rotation.axis === 'y') {
                mesh.rotateY(planeDef.rotation.angle);
            }
        }

        mesh.userData = {
            isPlaneHelper: true,
            plane: planeDef.plane
        };

        group.add(mesh);
    }

    scene.add(group);
}

/**
 * Updates plane helpers based on sketch setup mode.
 * Call this from a createEffect in the Viewport.
 */
export function updatePlaneHelpers(scene: THREE.Scene, sketchSetupMode: boolean): void {
    // Always clear first
    clearPlaneHelpers(scene);

    // Create new helpers if in setup mode
    if (sketchSetupMode) {
        createPlaneHelpers(scene);
    }
}
