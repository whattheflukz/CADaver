/**
 * Selection highlight mesh management utilities.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Creating/updating hover highlight meshes
 * - Creating/updating selection highlight meshes
 * - Managing highlight geometry sharing
 */

import * as THREE from 'three';

interface HighlightConfig {
    indices: number[];
    color: number;
    opacity: number;
    name: string;
}

/**
 * Updates or creates a highlight mesh on the main geometry.
 * Shares position attribute with mainMesh for efficiency.
 * 
 * @param mainMesh The main geometry mesh to add highlights to
 * @param config Highlight configuration
 */
export function updateHighlightMesh(
    mainMesh: THREE.Mesh | null,
    config: HighlightConfig
): void {
    if (!mainMesh) return;

    const { indices, color, opacity, name } = config;
    let mesh = mainMesh.getObjectByName(name) as THREE.Mesh;

    if (indices.length === 0) {
        if (mesh) {
            mainMesh.remove(mesh);
            // Don't dispose geometry - it references mainMesh's position attribute
            // Just dispose the material
            (mesh.material as THREE.Material).dispose();
        }
        return;
    }

    if (!mesh) {
        const highlightGeo = new THREE.BufferGeometry();
        // Share the position attribute (no need to clone since we're only changing indices)
        highlightGeo.setAttribute('position', mainMesh.geometry.getAttribute('position'));
        highlightGeo.setIndex(indices);

        const highlightMat = new THREE.MeshBasicMaterial({
            color: color,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        mesh = new THREE.Mesh(highlightGeo, highlightMat);
        mesh.name = name;
        mesh.renderOrder = 998; // Hover is below selection (1001)
        mainMesh.add(mesh);
    } else {
        mesh.geometry.setIndex(indices);
        // Update material properties in case they changed
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(color);
        mat.opacity = opacity;
    }
}

/**
 * Updates the hover highlight based on intersection results.
 */
export function updateHoverHighlight(
    mainMesh: THREE.Mesh | null,
    indices: number[]
): void {
    updateHighlightMesh(mainMesh, {
        indices,
        color: 0x00ccff,  // Cyan for hover
        opacity: 0.3,
        name: 'hover_highlight'
    });
}

/**
 * Updates the selection highlight.
 */
export function updateSelectionHighlight(
    mainMesh: THREE.Mesh | null,
    indices: number[]
): void {
    updateHighlightMesh(mainMesh, {
        indices,
        color: 0x00ff88,  // Green for selection
        opacity: 0.5,
        name: 'selection_highlight'
    });
}

/**
 * Clears all highlight meshes from mainMesh.
 */
export function clearAllHighlights(mainMesh: THREE.Mesh | null): void {
    if (!mainMesh) return;

    const highlightNames = ['hover_highlight', 'selection_highlight'];
    highlightNames.forEach(name => {
        const mesh = mainMesh.getObjectByName(name) as THREE.Mesh;
        if (mesh) {
            mainMesh.remove(mesh);
            (mesh.material as THREE.Material).dispose();
        }
    });
}
