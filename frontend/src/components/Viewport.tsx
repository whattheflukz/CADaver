import { onCleanup, onMount, createEffect, createSignal, type Component } from "solid-js";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import type { Tessellation, SnapPoint, SketchPlane, SolveResult, SketchEntity } from "../types";
import { SketchRenderer } from "../rendering/SketchRenderer";
import { DimensionRenderer } from "../rendering/DimensionRenderer";
import { SnapMarkers } from "../rendering/SnapMarkers";
import { SceneManager } from "../rendering/SceneManager";
import { sketchToWorld } from "../utils/sketchGeometry";
import { createPointMarkerTexture } from "../utils/threeHelpers";
import {
    getIntersects as doRaycastIntersects,
    getSketchPlaneIntersection as doSketchPlaneIntersection,
    getIntersectsWithPlanes as doIntersectsWithPlanes,
    intersectObjectsFromClient as doIntersectObjectsFromClient,
    getPointerPos2D as doGetPointerPos2D,
    getSketchPlaneMatrix as doGetSketchPlaneMatrix,
    worldToSketchLocal,
    topoIdMatches
} from "../services/RaycastService";
import { updateHighlightMesh as doUpdateHighlightMesh, applySelectionHighlights } from "../hooks/useSelectionHighlight";
import { renderDimensionPreview, cleanupPreviewDimension } from "../rendering/DimensionPreviewRenderer";
import { useDimensionDrag } from "../hooks/useDimensionDrag";
import { handleCanvasClick } from "../services/ViewportClickHandler";
import { updatePlaneHelpers, updatePersistentPlanes, type CustomPlane } from "../rendering/PlaneHelperManager";

interface ViewportProps {
    tessellation: Tessellation | null;
    onSelect?: (topoId: any, modifier: "replace" | "add" | "remove") => void;
    selection?: any[];
    clientSketch?: any; // Type 'Sketch' from types.ts, but loose for now to avoid import cycles or just use 'any'
    onCanvasClick?: (type: "click" | "move" | "dblclick", point: [number, number, number], event?: MouseEvent) => void;
    activeSnap?: SnapPoint | null; // Current snap point for visual indicator
    onDimensionDrag?: (constraintIndex: number, newOffset: [number, number]) => void;
    onDimensionEdit?: (constraintIndex: number, type: string) => void;
    // New props for sketch setup
    sketchSetupMode?: boolean;
    customPlanes?: CustomPlane[];
    standardPlaneVisibility?: { XY: boolean; XZ: boolean; YZ: boolean };
    onSelectPlane?: (plane: SketchPlane) => void;
    previewDimension?: {
        type: "Distance" | "Angle" | "Radius" | "Length" | "DistancePointLine" | "DistanceParallelLines" | "HorizontalDistance" | "VerticalDistance" | "Unsupported";
        value: number;
        selections: any[];
    };
    // Solve result for DOF-based entity coloring
    solveResult?: SolveResult | null;
    // Trigger camera alignment to sketch plane
    // Trigger camera alignment to sketch plane
    alignToPlane?: SketchPlane | null;
    previewGeometry?: SketchEntity[];
    // Callback for region click (extrude mode profile selection)
    onRegionClick?: (point2d: [number, number]) => void;
    // Callback for dimension mouse position (Onshape-style dynamic dimension mode)
    onDimensionMouseMove?: (point2d: [number, number]) => void;
    // Active measurements (temporary, non-driving)
    activeMeasurements?: any[];
    // Inferred constraints for live preview during drawing
    inferredConstraints?: any[];
}

const Viewport: Component<ViewportProps> = (props) => {
    let containerRef: HTMLDivElement | undefined;

    // SceneManager handles scene, camera, renderer, controls, lights, helpers, resize, and animation
    let sceneManager: SceneManager | null = null;

    // Local references to SceneManager internals for compatibility with existing code
    let renderer: THREE.WebGLRenderer;
    let camera: THREE.PerspectiveCamera;
    let scene: THREE.Scene;
    let controls: OrbitControls;

    let mainMesh: THREE.Mesh | null = null;
    let _selectionMesh: THREE.Mesh | null = null; // Highlighting for selected items
    let hoverMesh: THREE.Mesh | null = null; // Highlighting for hovered items
    let planeHighlightMesh: THREE.Mesh | null = null; // Highlighting for potential sketch planes

    // Renderers
    let sketchRenderer: SketchRenderer;
    let dimensionRenderer: DimensionRenderer;
    let snapMarkers: SnapMarkers;

    // Raycaster reused (kept separate from SceneManager for custom thresholds)
    const raycaster = new THREE.Raycaster();
    // Increase threshold for easier line/point selection
    raycaster.params.Line = { threshold: 4.0 };  // Large hitbox for edges
    raycaster.params.Points = { threshold: 5.0 }; // Larger hitbox for vertices
    const mouse = new THREE.Vector2();

    const [ready, setReady] = createSignal(false);

    const init = () => {
        if (!containerRef) return;

        // Create SceneManager - handles scene, camera, renderer, controls, lights, helpers, resize, animation
        sceneManager = new SceneManager({
            container: containerRef,
            backgroundColor: 0x1e1e1e,
            cameraPosition: [20, 20, 20],
            gridSize: 50,
            gridDivisions: 50
        });

        // Extract references for compatibility with existing code
        const ctx = sceneManager.getContext();
        scene = ctx.scene;
        camera = ctx.camera;
        renderer = ctx.renderer;
        controls = ctx.controls;

        // Initialize Renderers (these need the scene)
        sketchRenderer = new SketchRenderer(scene);
        dimensionRenderer = new DimensionRenderer(scene);
        snapMarkers = new SnapMarkers(scene);

        // Start the animation loop
        sceneManager.start();

        setReady(true);
    };

    onMount(() => {
        init();
        if (containerRef) {
            containerRef.addEventListener('click', onCanvasClick);
            containerRef.addEventListener('dblclick', (e) => {
                if (!camera) return;

                // Check for Dimension Edit (Hitbox) - using Raycasting
                const intersects = getIntersects(e.clientX, e.clientY);
                // Filter for dimension hitbox
                const dimHit = intersects.find(h => h.object.userData && h.object.userData.isDimensionHitbox);

                if (dimHit && props.onDimensionEdit) {
                    props.onDimensionEdit(
                        dimHit.object.userData.index,
                        dimHit.object.userData.type
                    );
                    return;
                }

                if (!props.onCanvasClick) return;
                const target = getSketchPlaneIntersection(e.clientX, e.clientY);
                if (target) {
                    props.onCanvasClick("dblclick", target);
                }
            });
            containerRef.addEventListener('pointermove', onCanvasMouseMove);
            containerRef.addEventListener('mousedown', onCanvasMouseDown);
        }
    });

    onCleanup(() => {
        // SceneManager handles animation, resize observer, renderer disposal
        if (sceneManager) {
            sceneManager.dispose();
        }
        if (containerRef) {
            containerRef.removeEventListener('click', onCanvasClick);
            containerRef.removeEventListener('dblclick', () => { }); // specific handler ref lost, but bounded functional won't matter for GC usually
            containerRef.removeEventListener('pointermove', onCanvasMouseMove);
            containerRef.removeEventListener('mousedown', onCanvasMouseDown);
        }
    });

    // React to tessellation updates
    createEffect(() => {
        if (!ready() || !scene) return;

        // Skip tessellation when in sketch mode - frontend handles sketch rendering via clientSketch
        if (props.clientSketch) {
            // Remove old mesh if present since we're in sketch mode
            if (mainMesh) {
                scene.remove(mainMesh);
                mainMesh.geometry.dispose();
                (mainMesh.material as THREE.Material).dispose();
                mainMesh = null;
                _selectionMesh = null;
                hoverMesh = null;
            }
            return;
        }

        const data = props.tessellation;

        // Remove old mesh
        if (mainMesh) {
            scene.remove(mainMesh);
            mainMesh.geometry.dispose();
            (mainMesh.material as THREE.Material).dispose();
            mainMesh = null;
            _selectionMesh = null;
            hoverMesh = null;
        }

        if (data && data.vertices.length > 0) {
            const geometry = new THREE.BufferGeometry();

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
            geometry.setIndex(data.indices);

            const material = new THREE.MeshStandardMaterial({
                color: 0x888888, // Neutral grey base
                roughness: 0.5,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            mainMesh = new THREE.Mesh(geometry, material);
            scene.add(mainMesh);

            // Lines for Sketches / Edges
            if (data.line_indices && data.line_indices.length > 0) {
                // Convert indexed geometry to segment soup for LineSegmentsGeometry
                const segmentPositions: number[] = [];
                for (let i = 0; i < data.line_indices.length; i++) {
                    const idx = data.line_indices[i];
                    segmentPositions.push(
                        data.vertices[idx * 3],
                        data.vertices[idx * 3 + 1],
                        data.vertices[idx * 3 + 2]
                    );
                }

                const lineGeo = new LineSegmentsGeometry();
                lineGeo.setPositions(segmentPositions);

                const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);

                // Edge lines - subtle gray for 3D body edges
                const lineMat = new LineMaterial({
                    color: 0x444444, // Dark gray - subtle
                    linewidth: 10, // Wide enough to click easily
                    resolution: resolution,
                    depthTest: true
                });

                const lineMesh = new LineSegments2(lineGeo, lineMat);
                lineMesh.name = "sketch_lines";
                lineMesh.computeLineDistances();
                mainMesh.add(lineMesh);
            }

            // Points for Vertices
            if (data.point_indices && data.point_indices.length > 0) {
                const pointGeo = new THREE.BufferGeometry();
                pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
                pointGeo.setIndex(data.point_indices);

                // Vertex points - orange circles with plus sign
                const pointTexture = createPointMarkerTexture('#ffaa00', 64);
                const pointMat = new THREE.PointsMaterial({
                    map: pointTexture,
                    size: 12, // Slightly larger to accommodate the detail
                    sizeAttenuation: false,
                    depthTest: false, // Always on top
                    transparent: true, // Required for texture alpha
                    alphaTest: 0.1, // Clip pixels with low alpha
                });

                const pointMesh = new THREE.Points(pointGeo, pointMat);
                pointMesh.name = "vertices";
                pointMesh.renderOrder = 999;
                mainMesh.add(pointMesh);
            }
        }
    });

    // Camera alignment to sketch plane effect
    createEffect(() => {
        const plane = props.alignToPlane;
        if (!plane || !camera || !controls) return;

        const normal = new THREE.Vector3(plane.normal[0], plane.normal[1], plane.normal[2]);
        const origin = new THREE.Vector3(plane.origin[0], plane.origin[1], plane.origin[2]);

        // Position camera along plane normal, looking at origin
        const distance = 30;
        const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));

        camera.position.copy(newPos);
        camera.lookAt(origin);
        controls.target.copy(origin);
        controls.update();

        console.log("Camera aligned to sketch plane:", plane);
    });

    // Helper functions - thin wrappers around extracted modules
    const getRaycastContext = () => ({
        containerRef: containerRef || null,
        camera,
        scene,
        mainMesh,
        raycaster,
        mouse
    });

    const getSketchContext = () => ({
        plane: props.clientSketch?.plane || null
    });

    const getSketchPlaneIntersection = (clientX: number, clientY: number): [number, number, number] | null => {
        if (!props.clientSketch?.plane) return null;
        return doSketchPlaneIntersection(clientX, clientY, getRaycastContext(), getSketchContext());
    };

    const getIntersects = (clientX: number, clientY: number) => {
        return doRaycastIntersects(clientX, clientY, getRaycastContext());
    };

    const updateHighlightMesh = (
        _targetMeshRef: { current: THREE.Mesh | null },
        indices: number[],
        color: number,
        opacity: number,
        name: string
    ) => {
        doUpdateHighlightMesh(mainMesh, { indices, color, opacity, name });
    };

    // Plane Selection Helpers - logic extracted to PlaneHelperManager.ts
    createEffect(() => {
        if (!ready() || !scene) return;
        updatePlaneHelpers(scene, !!props.sketchSetupMode, props.customPlanes || []);
    });

    // Persistent Plane Display - always visible XY/XZ/YZ and custom planes
    createEffect(() => {
        if (!ready() || !scene) return;
        updatePersistentPlanes(scene, props.customPlanes || [], props.standardPlaneVisibility || { XY: true, XZ: true, YZ: true });
    });

    // Helper: Raycast including Plane Helpers
    const getIntersectsWithPlanes = (clientX: number, clientY: number) => {
        return doIntersectsWithPlanes(clientX, clientY, getRaycastContext());
    };

    // Click handling extracted to ViewportClickHandler.ts for cleaner architecture
    const onCanvasClick = (event: MouseEvent) => {
        handleCanvasClick(event, {
            getRaycastContext,
            getSketchContext,
            mainMesh
        }, {
            sketchSetupMode: props.sketchSetupMode,
            onSelectPlane: props.onSelectPlane,
            onSelect: props.onSelect,
            onRegionClick: props.onRegionClick,
            tessellation: props.tessellation,
            clientSketch: props.clientSketch
        });
    };

    // Sketch Drawing Input
    const onCanvasMouseDown = (event: MouseEvent) => {
        // Prevent drawing while selecting planes
        if (props.sketchSetupMode) return;

        if (!props.onCanvasClick || !camera) return;

        // Correctly intersect the active sketch plane
        const target = getSketchPlaneIntersection(event.clientX, event.clientY);
        if (target) {
            // alert("Viewport MouseDown"); // Uncomment to debug
            props.onCanvasClick("click", target, event);
        }
    };

    // Client-side Sketch Rendering (Preview)
    createEffect(() => {
        if (!ready() || !scene) return;

        const SKETCH_PREVIEW_NAME = "client_sketch_preview";
        const CONSTRUCTION_PREVIEW_NAME = "client_sketch_preview_construction";
        const DEFINING_POINTS_NAME = "sketch_defining_points";
        const CONSTRAINT_INDICATOR_NAME = "constraint_indicators";

        // Clean up previous meshes
        const namesToClean = [CONSTRUCTION_PREVIEW_NAME, DEFINING_POINTS_NAME, CONSTRAINT_INDICATOR_NAME, "sketch_selection_highlight", "client_sketch_hitbox"];
        namesToClean.forEach(name => {
            let mesh = scene.getObjectByName(name) as THREE.Mesh | THREE.LineSegments | THREE.Points | THREE.Group;
            if (mesh) {
                scene.remove(mesh);
                if ((mesh as any).geometry) (mesh as any).geometry.dispose();
                if ((mesh as any).material) (mesh as any).material.dispose();
                // For Groups (like indicators), traverse and dispose
                if (mesh.type === 'Group') {
                    mesh.traverse((child) => {
                        if ((child as any).geometry) (child as any).geometry.dispose();
                        if ((child as any).material) (child as any).material.dispose();
                    });
                }
            }
        });

        // Clean up all sketch preview meshes (legacy cleanup)
        const toRemove: THREE.Object3D[] = [];
        scene.traverse((child) => {
            if (child.name.startsWith(SKETCH_PREVIEW_NAME) || child.name === CONSTRAINT_INDICATOR_NAME || child.name === CONSTRUCTION_PREVIEW_NAME) {
                toRemove.push(child);
            }
        });
        toRemove.forEach((obj) => {
            scene.remove(obj);
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) (obj as any).material.dispose();
        });

        if (props.clientSketch) {
            // Update Renderers
            sketchRenderer.update(props.clientSketch, props.selection || [], props.solveResult);
            const res = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);
            dimensionRenderer.update(props.clientSketch, res);
            // Render temporary measurements (non-driving)
            if (props.activeMeasurements && props.activeMeasurements.length > 0) {
                dimensionRenderer.renderMeasurements(props.clientSketch, props.activeMeasurements);
            }
            // Render inferred constraint previews
            console.log('[Viewport Render] inferredConstraints:', props.inferredConstraints?.length || 0);
            if (props.inferredConstraints && props.inferredConstraints.length > 0) {
                console.log('[Viewport Render] Calling renderInferredConstraints with', props.inferredConstraints);
                dimensionRenderer.renderInferredConstraints(props.clientSketch, props.inferredConstraints);
            }
            snapMarkers.update(props.activeSnap || null, props.clientSketch);

            // Hide main mesh when in sketch mode? 
            // The original logic did this implicitly by overlaying or handling it in the tessellation effect.
            // But we should ensure we coordinate.
            // Original code: Line 162 handles hiding mainMesh if clientSketch is present.
        } else {
            // Clear renderers if no sketch
            sketchRenderer.clear();
            dimensionRenderer.clear();
            snapMarkers.clear();
        }
        // ... (rest of code)

    });

    // Separate effect for inference rendering - runs on every inferredConstraints change
    // TEMPORARILY DISABLED - causes sketch mode issues, need to debug
    createEffect(() => {
        // DISABLED: Early return to investigate sketch mode regression
        return;
    });
    // Log every time the effect runs

    // Dimension drag handling - extracted to useDimensionDrag hook
    useDimensionDrag({
        scene: () => scene,
        camera: () => camera,
        containerRef: () => containerRef || null,
        controls: () => controls,
        ready,
        clientSketch: () => props.clientSketch,
        raycaster,
        mouse,
        onDimensionDrag: props.onDimensionDrag
    });

    const onPointerMove = (event: MouseEvent) => {
        const pointerPos = doGetPointerPos2D(
            event.clientX,
            event.clientY,
            getRaycastContext(),
            getSketchContext()
        );
        if (!pointerPos) return;

        const matrix = (props.clientSketch && props.clientSketch.plane)
            ? doGetSketchPlaneMatrix(props.clientSketch.plane)
            : null;

        // Report mouse position for dynamic dimension mode switching (Onshape-style)
        if (props.onDimensionMouseMove) {
            props.onDimensionMouseMove([pointerPos.x, pointerPos.y]);
        }

        // Render dimension preview using extracted function
        if (props.previewDimension) {
            renderDimensionPreview(
                scene,
                props.previewDimension,
                pointerPos,
                props.clientSketch || null,
                matrix
            );
        } else {
            cleanupPreviewDimension(scene);
        }

        const intersects = getIntersects(event.clientX, event.clientY);

        const indices: number[] = [];
        if (intersects.length > 0 && props.tessellation) {
            const hit = intersects[0];
            if (hit.faceIndex !== undefined) {
                const hoveredId = props.tessellation.triangle_ids[hit.faceIndex!];

                // Find all triangles with this ID (inefficient linear scan, OK for small models)
                props.tessellation.triangle_ids.forEach((tid, triIdx) => {
                    if (JSON.stringify(tid) === JSON.stringify(hoveredId)) {
                        indices.push(props.tessellation!.indices[triIdx * 3]);
                        indices.push(props.tessellation!.indices[triIdx * 3 + 1]);
                        indices.push(props.tessellation!.indices[triIdx * 3 + 2]);
                    }
                });
            }
        }

        // Update Hover Mesh
        // Color 0x44aaff (Light Blue), Opacity 0.3
        updateHighlightMesh({ current: hoverMesh }, indices, 0x44aaff, 0.3, "hover_highlight");
    };


    // React to selection updates - highlight faces, edges, and vertices
    // Logic extracted to useSelectionHighlight.ts for cleaner architecture
    createEffect(() => {
        // CRITICAL: Access reactive signals FIRST so SolidJS tracks them as dependencies
        const currentSelection = props.selection;
        const currentTessellation = props.tessellation;

        // Delegate to extracted function
        applySelectionHighlights(mainMesh, currentTessellation, currentSelection);
    });

    // ... init/cleanup ... 

    // Removed duplicate onMount/onCleanup block

    const onCanvasMouseMove = (event: MouseEvent) => {
        // 1. Handle Face Highlighting for Sketch Setup
        if (props.sketchSetupMode && mainMesh) {
            const intersects = getIntersects(event.clientX, event.clientY);
            const faceHit = intersects.find(i => i.faceIndex != null && i.object.type !== 'Points' && i.object.type !== 'LineSegments');

            if (faceHit && faceHit.faceIndex != null && faceHit.object === mainMesh) {
                // Highlight the face
                const index = mainMesh.geometry.getIndex();
                if (index) {
                    const fIdx = faceHit.faceIndex;
                    const a = index.getX(fIdx * 3);
                    const b = index.getX(fIdx * 3 + 1);
                    const c = index.getX(fIdx * 3 + 2);

                    updateHighlightMesh(
                        { current: planeHighlightMesh },
                        [a, b, c],
                        0x00ffff, // Cyan highlight for planes
                        0.5,
                        "plane_highlight"
                    );
                }
            } else {
                // Clear highlight
                updateHighlightMesh({ current: planeHighlightMesh }, [], 0, 0, "plane_highlight");
            }
        } else {
            // Clear highlight if not in setup mode
            updateHighlightMesh({ current: planeHighlightMesh }, [], 0, 0, "plane_highlight");
            // Call generic hover highlight logic
            onPointerMove(event);
        }

        // 2. Midpoint Hover Logic for Sketches
        // [REMOVED] - Consolidating logic into app.ts/snapUtils.ts "activeSnap" system to prevent duplicates.
        // The Viewport now relies solely on props.activeSnap (line 1115) to render snap indicators (including midpoints).

        // 3. Handle generic "move" event for sketches (e.g. dragging preview)
        if (props.onCanvasClick && camera && containerRef) {
            const target = getSketchPlaneIntersection(event.clientX, event.clientY);
            if (target) {
                props.onCanvasClick("move", target, event);
            }
        }
    };


    return (
        <div
            ref={containerRef}
            style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}
            id="viewport-canvas"
        />
    );
};

export default Viewport;
