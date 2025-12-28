/**
 * Selection highlight mesh management utilities.
 * Extracted from Viewport.tsx for cleaner architecture.
 * 
 * Responsibilities:
 * - Creating/updating hover highlight meshes
 * - Creating/updating selection highlight meshes
 * - Managing face, edge, and vertex selection highlights
 */

import * as THREE from 'three';
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';

// --- Types ---

interface HighlightConfig {
    indices: number[];
    color: number;
    opacity: number;
    name: string;
}

/**
 * Tessellation data structure for selection matching.
 */
export interface SelectionTessellation {
    vertices: number[];
    indices: number[];
    triangle_ids: any[];
    line_ids?: any[];
    line_indices?: number[];
    point_ids?: any[];
    point_indices?: number[];
}

// --- Constants ---

const SEL_FACE_NAME = "selection_highlight";
const SEL_EDGE_NAME = "selection_edge_highlight";
const SEL_VERTEX_NAME = "selection_vertex_highlight";

// --- Helper: Compare TopoIds robustly ---

function topoIdMatches(a: any, b: any): boolean {
    if (typeof a === 'object' && typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return a === b;
}

// --- Hover Highlight Functions ---

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

// --- Selection Highlight Functions ---

/**
 * Clears all selection highlight meshes from mainMesh.
 */
export function clearSelectionHighlights(mainMesh: THREE.Mesh | null): void {
    if (!mainMesh) return;

    const highlightNames = [SEL_FACE_NAME, SEL_EDGE_NAME, SEL_VERTEX_NAME, 'hover_highlight'];
    highlightNames.forEach(name => {
        const mesh = mainMesh.getObjectByName(name);
        if (mesh) {
            mainMesh.remove(mesh);
            mesh.traverse((child) => {
                if ((child as any).geometry) (child as any).geometry.dispose();
                if ((child as any).material) (child as any).material.dispose();
            });
        }
    });
}

/**
 * Applies selection highlights for faces, edges, and vertices.
 * This is the main function called from the Viewport createEffect.
 * 
 * @param mainMesh The main 3D mesh to add highlights to
 * @param tessellation Tessellation data with triangle/line/point IDs
 * @param selection Array of selected topology IDs
 */
export function applySelectionHighlights(
    mainMesh: THREE.Mesh | null,
    tessellation: SelectionTessellation | null,
    selection: any[] | undefined
): void {
    if (!mainMesh || !tessellation) return;

    const data = tessellation;

    // --- Clear existing highlights ---
    const existingFaceHighlight = mainMesh.getObjectByName(SEL_FACE_NAME);
    if (existingFaceHighlight) {
        mainMesh.remove(existingFaceHighlight);
        (existingFaceHighlight as THREE.Mesh).geometry?.dispose();
        ((existingFaceHighlight as THREE.Mesh).material as THREE.Material)?.dispose();
    }

    const existingEdgeHighlight = mainMesh.getObjectByName(SEL_EDGE_NAME);
    if (existingEdgeHighlight) {
        mainMesh.remove(existingEdgeHighlight);
        existingEdgeHighlight.traverse((child) => {
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        });
    }

    const existingVertexHighlight = mainMesh.getObjectByName(SEL_VERTEX_NAME);
    if (existingVertexHighlight) {
        mainMesh.remove(existingVertexHighlight);
        const mat = (existingVertexHighlight as THREE.Points).material as THREE.Material;
        mat?.dispose();
    }

    // --- Early return if no selection ---
    if (!selection || selection.length === 0) {
        return;
    }

    // --- FACE SELECTION (triangles → orange highlight) ---
    const faceIndices: number[] = [];
    data.triangle_ids.forEach((tid, triIdx) => {
        const isSelected = selection.some(s => topoIdMatches(s, tid));
        if (isSelected) {
            faceIndices.push(data.indices[triIdx * 3]);
            faceIndices.push(data.indices[triIdx * 3 + 1]);
            faceIndices.push(data.indices[triIdx * 3 + 2]);
        }
    });

    if (faceIndices.length > 0) {
        console.log("[SelectionHighlight] Highlighting", faceIndices.length / 3, "triangles (faces)");

        const highlightGeo = new THREE.BufferGeometry();
        highlightGeo.setAttribute('position', mainMesh.geometry.getAttribute('position'));
        highlightGeo.setIndex(faceIndices);

        const highlightMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        const mesh = new THREE.Mesh(highlightGeo, highlightMat);
        mesh.name = SEL_FACE_NAME;
        mesh.renderOrder = 1001;
        mainMesh.add(mesh);
    }

    // --- EDGE SELECTION (line segments → cyan highlight) ---
    const edgeSegments: number[] = [];

    if (data.line_ids && data.line_indices) {
        const edgeSelections = selection.filter(s => s.rank === "Edge");
        if (edgeSelections.length > 0) {
            console.log("[SelectionHighlight] Looking for edges:", edgeSelections.length, "edge selections");
        }

        data.line_ids.forEach((tid, lineIdx) => {
            const isSelected = selection.some(s => topoIdMatches(s, tid));
            if (isSelected) {
                const idx1 = data.line_indices![lineIdx * 2];
                const idx2 = data.line_indices![lineIdx * 2 + 1];
                edgeSegments.push(
                    data.vertices[idx1 * 3], data.vertices[idx1 * 3 + 1], data.vertices[idx1 * 3 + 2],
                    data.vertices[idx2 * 3], data.vertices[idx2 * 3 + 1], data.vertices[idx2 * 3 + 2]
                );
            }
        });
    }

    if (edgeSegments.length > 0) {
        const lineGeo = new LineSegmentsGeometry();
        lineGeo.setPositions(edgeSegments);

        const lineMat = new LineMaterial({
            color: 0x00ffff, // CYAN for edges
            linewidth: 8,
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
            depthTest: true
        });

        const edgeHighlight = new LineSegments2(lineGeo, lineMat);
        edgeHighlight.name = SEL_EDGE_NAME;
        edgeHighlight.renderOrder = 1002;
        edgeHighlight.computeLineDistances();
        mainMesh.add(edgeHighlight);
    }

    // --- VERTEX SELECTION (points → green highlight) ---
    const vertexPositions: number[] = [];
    const vertexSelections = selection.filter(s => s.rank === "Vertex");

    if (vertexSelections.length > 0 && data.point_ids && data.point_indices) {
        console.log("[SelectionHighlight] Looking for vertices:", vertexSelections.length, "vertex selections");

        data.point_ids.forEach((tid, ptIdx) => {
            const isSelected = selection.some(s => topoIdMatches(s, tid));
            if (isSelected) {
                const idx = data.point_indices![ptIdx];
                vertexPositions.push(
                    data.vertices[idx * 3],
                    data.vertices[idx * 3 + 1],
                    data.vertices[idx * 3 + 2]
                );
            }
        });
    }

    if (vertexPositions.length > 0) {
        console.log("[SelectionHighlight] Highlighting", vertexPositions.length / 3, "vertices");

        const pointGeo = new THREE.BufferGeometry();
        pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertexPositions, 3));

        const pointMat = new THREE.PointsMaterial({
            color: 0x00ff00, // GREEN for vertices
            size: 16,
            sizeAttenuation: false,
            depthTest: false
        });

        const vertexHighlight = new THREE.Points(pointGeo, pointMat);
        vertexHighlight.name = SEL_VERTEX_NAME;
        vertexHighlight.renderOrder = 1003;
        mainMesh.add(vertexHighlight);
    }
}

// Legacy exports for backwards compatibility
export function updateSelectionHighlight(
    mainMesh: THREE.Mesh | null,
    indices: number[]
): void {
    updateHighlightMesh(mainMesh, {
        indices,
        color: 0x00ff88,
        opacity: 0.5,
        name: 'selection_highlight'
    });
}

export function clearAllHighlights(mainMesh: THREE.Mesh | null): void {
    clearSelectionHighlights(mainMesh);
}
