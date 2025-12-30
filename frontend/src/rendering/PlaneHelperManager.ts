/**
 * PlaneHelperManager - Manages plane selection helper visualizations.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Creating XY/XZ/YZ plane helper meshes
 * - Creating custom plane helper meshes from feature graph
 * - Updating plane helpers based on sketch setup mode
 * - Proper cleanup/disposal of plane helper geometry
 */

import * as THREE from 'three';

const PLANE_HELPER_NAME = "plane_selection_helpers";
const PLANE_SIZE = 10;
const PLANE_OPACITY = 0.2;

/**
 * Custom plane data from feature graph
 */
export interface CustomPlane {
    id: string;
    name: string;
    plane: {
        origin: [number, number, number];
        normal: [number, number, number];
        x_axis: [number, number, number];
        y_axis: [number, number, number];
    };
}

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
 * Creates a single plane mesh with given properties.
 */
function createPlaneMesh(
    name: string,
    color: number,
    plane: CustomPlane['plane']
): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: PLANE_OPACITY,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;

    // Position and orient the mesh based on plane data
    mesh.position.set(plane.origin[0], plane.origin[1], plane.origin[2]);

    // Create rotation matrix from axes
    const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
    const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
    const normal = new THREE.Vector3().fromArray(plane.normal);

    const matrix = new THREE.Matrix4();
    matrix.makeBasis(xAxis, yAxis, normal);
    mesh.setRotationFromMatrix(matrix);

    mesh.userData = {
        isPlaneHelper: true,
        plane: plane
    };

    return mesh;
}

/**
 * Creates plane helper visualizations for sketch plane selection.
 */
export function createPlaneHelpers(scene: THREE.Scene, customPlanes: CustomPlane[] = []): void {
    const group = new THREE.Group();
    group.name = PLANE_HELPER_NAME;

    // Add standard XY/XZ/YZ planes
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

    // Add custom planes from feature graph
    for (const custom of customPlanes) {
        const mesh = createPlaneMesh(
            custom.name,
            0xff00ff,  // Magenta for custom planes
            custom.plane
        );
        mesh.userData.featureId = custom.id;  // Store feature ID for reference
        group.add(mesh);
    }

    scene.add(group);
}

/**
 * Updates plane helpers based on sketch setup mode.
 * Call this from a createEffect in the Viewport.
 */
export function updatePlaneHelpers(
    scene: THREE.Scene,
    sketchSetupMode: boolean,
    customPlanes: CustomPlane[] = []
): void {
    // Always clear first
    clearPlaneHelpers(scene);

    // Create new helpers if in setup mode
    if (sketchSetupMode) {
        createPlaneHelpers(scene, customPlanes);
    }
}

// ============ PERSISTENT PLANE DISPLAY ============

const PERSISTENT_PLANE_GROUP_NAME = "persistent_plane_display";
const PERSISTENT_PLANE_SIZE = 20;
const PERSISTENT_PLANE_OPACITY = 0.1;

/**
 * Clears persistent plane display from scene.
 */
export function clearPersistentPlanes(scene: THREE.Scene): void {
    const group = scene.getObjectByName(PERSISTENT_PLANE_GROUP_NAME);
    if (group) {
        scene.remove(group);
        group.traverse((child) => {
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        });
    }
}

/**
 * Creates a persistent plane mesh (always visible, with edge outline).
 */
function createPersistentPlaneMesh(
    name: string,
    color: number,
    planeData: CustomPlane['plane']
): THREE.Group {
    const planeGroup = new THREE.Group();
    planeGroup.name = name;

    // Semi-transparent fill
    const geo = new THREE.PlaneGeometry(PERSISTENT_PLANE_SIZE, PERSISTENT_PLANE_SIZE);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: PERSISTENT_PLANE_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Edge outline
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color, opacity: 0.5, transparent: true });
    const lineSegments = new THREE.LineSegments(edges, lineMat);

    // Position at origin
    const origin = new THREE.Vector3().fromArray(planeData.origin);
    planeGroup.position.copy(origin);

    // Orient using quaternion from normal
    // PlaneGeometry default normal is +Z (0,0,1)
    // We need to rotate so that +Z aligns with our plane's normal
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const targetNormal = new THREE.Vector3().fromArray(planeData.normal).normalize();

    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    planeGroup.quaternion.copy(quaternion);

    planeGroup.add(mesh);
    planeGroup.add(lineSegments);

    planeGroup.userData = {
        isPersistentPlane: true,
        plane: planeData
    };

    return planeGroup;
}

/**
 * Updates persistent plane display (always visible).
 * Shows standard XY/XZ/YZ planes and custom planes from feature graph.
 */
export function updatePersistentPlanes(
    scene: THREE.Scene,
    customPlanes: CustomPlane[] = [],
    planeVisibility: { XY: boolean; XZ: boolean; YZ: boolean } = { XY: true, XZ: true, YZ: true }
): void {
    // Clear existing
    clearPersistentPlanes(scene);

    const group = new THREE.Group();
    group.name = PERSISTENT_PLANE_GROUP_NAME;
    group.renderOrder = -1; // Render behind other objects

    // Add standard XY/XZ/YZ planes based on visibility
    for (const planeDef of STANDARD_PLANES) {
        // Check visibility by plane name
        let isVisible = true;
        if (planeDef.name === "XY Plane") isVisible = planeVisibility.XY;
        else if (planeDef.name === "XZ Plane") isVisible = planeVisibility.XZ;
        else if (planeDef.name === "YZ Plane") isVisible = planeVisibility.YZ;

        if (isVisible) {
            const planeGroup = createPersistentPlaneMesh(
                planeDef.name,
                planeDef.color,
                planeDef.plane
            );
            group.add(planeGroup);
        }
    }

    // Add custom planes
    for (const custom of customPlanes) {
        const planeGroup = createPersistentPlaneMesh(
            custom.name,
            0xff00ff,
            custom.plane
        );
        planeGroup.userData.featureId = custom.id;
        group.add(planeGroup);
    }

    scene.add(group);
}
