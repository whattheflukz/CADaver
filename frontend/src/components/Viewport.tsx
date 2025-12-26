import { onCleanup, onMount, createEffect, createSignal, type Component } from "solid-js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import type { Tessellation, SnapPoint, SketchPlane, SolveResult, EntityConstraintStatus, SketchEntity } from "../types";
import { SketchRenderer } from "../rendering/SketchRenderer";
import { DimensionRenderer } from "../rendering/DimensionRenderer";
import { SnapMarkers } from "../rendering/SnapMarkers";
import { sketchToWorld } from "../utils/sketchGeometry";
import { createPointMarkerTexture } from "../utils/threeHelpers";

interface ViewportProps {
    tessellation: Tessellation | null;
    onSelect?: (topoId: any, modifier: "replace" | "add" | "remove") => void;
    selection?: any[];
    clientSketch?: any; // Type 'Sketch' from types.ts, but loose for now to avoid import cycles or just use 'any'
    onCanvasClick?: (type: "click" | "move" | "dblclick", point: [number, number, number], event?: MouseEvent) => void;
    activeSnap?: SnapPoint | null; // Current snap point for visual indicator
    onDimensionDrag?: (constraintIndex: number, newOffset: [number, number]) => void;
    // New props for sketch setup
    sketchSetupMode?: boolean;
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
}


const Viewport: Component<ViewportProps> = (props) => {
    let containerRef: HTMLDivElement | undefined;
    let renderer: THREE.WebGLRenderer;
    let camera: THREE.PerspectiveCamera;
    let scene: THREE.Scene;
    let controls: OrbitControls;
    let animationId: number;
    let mainMesh: THREE.Mesh | null = null;
    let selectionMesh: THREE.Mesh | null = null; // Highlighting for selected items
    let hoverMesh: THREE.Mesh | null = null; // Highlighting for hovered items
    let planeHighlightMesh: THREE.Mesh | null = null; // Highlighting for potential sketch planes

    // Renderers
    let sketchRenderer: SketchRenderer;
    let dimensionRenderer: DimensionRenderer;
    let snapMarkers: SnapMarkers;

    // Raycaster reused
    const raycaster = new THREE.Raycaster();
    // Increase threshold for easier line/point selection
    raycaster.params.Line = { threshold: 4.0 };  // Large hitbox for edges
    raycaster.params.Points = { threshold: 5.0 }; // Larger hitbox for vertices
    const mouse = new THREE.Vector2();

    const [ready, setReady] = createSignal(false);

    let resizeObserver: ResizeObserver;

    const init = () => {
        if (!containerRef) return;

        // SCENE
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e);

        // Resolution for LineMaterial
        const width = containerRef.clientWidth;
        const height = containerRef.clientHeight;
        const resolution = new THREE.Vector2(width, height);
        (window as any).viewportLineResolution = resolution; // Hack/Store to access in resize

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(20, 20, 20);
        camera.lookAt(0, 0, 0);

        // RENDERER
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.appendChild(renderer.domElement);

        // CONTROLS
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // HELPERS
        const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
        scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);

        // LIGHTS
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        // Initialize Renderers
        sketchRenderer = new SketchRenderer(scene);
        dimensionRenderer = new DimensionRenderer(scene);
        snapMarkers = new SnapMarkers(scene);

        // RESIZE OBSERVER
        resizeObserver = new ResizeObserver(() => {
            if (!containerRef) return;
            const newWidth = containerRef.clientWidth;
            const newHeight = containerRef.clientHeight;
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
            if ((window as any).viewportLineResolution) {
                (window as any).viewportLineResolution.set(newWidth, newHeight);
            }
        });
        resizeObserver.observe(containerRef);

        // ANIMATION LOOP
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        setReady(true);
    };

    onMount(() => {
        init();
        if (containerRef) {
            containerRef.addEventListener('click', onCanvasClick);
            containerRef.addEventListener('dblclick', (e) => {
                if (!props.onCanvasClick || !camera) return;
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
        if (animationId) cancelAnimationFrame(animationId);
        if (resizeObserver) resizeObserver.disconnect();
        if (containerRef) {
            containerRef.removeEventListener('click', onCanvasClick);
            containerRef.removeEventListener('dblclick', () => { }); // specific handler ref lost, but bounded functional won't matter for GC usually
            containerRef.removeEventListener('pointermove', onCanvasMouseMove);
            containerRef.removeEventListener('mousedown', onCanvasMouseDown);
            if (renderer) {
                // containerRef.removeChild(renderer.domElement); // SolidJS might have cleared it
                renderer.dispose();
            }
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
                selectionMesh = null;
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
            selectionMesh = null;
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

    // Helper functions
    const getSketchPlaneIntersection = (clientX: number, clientY: number): [number, number, number] | null => {
        if (!props.clientSketch || !props.clientSketch.plane || !camera || !containerRef) return null;

        // 1. Construct Sketch Plane
        const p = props.clientSketch.plane;
        const origin = new THREE.Vector3().fromArray(p.origin);
        const xAxis = new THREE.Vector3().fromArray(p.x_axis);
        const yAxis = new THREE.Vector3().fromArray(p.y_axis);
        const normal = new THREE.Vector3().fromArray(p.normal || [0, 0, 1]); // Fallback if normal missing

        // Plane constant w = -dot(Origin, Normal)
        const constant = -origin.dot(normal);
        const plane = new THREE.Plane(normal, constant);

        // 2. Raycast
        const rect = containerRef.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const targetWorld = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(plane, targetWorld);

        if (!hit) return null;

        // 3. Project to Local Coordinates
        // P_local = P_world - Origin
        // local_x = dot(P_local, xAxis)
        // local_y = dot(P_local, yAxis)
        const diff = new THREE.Vector3().subVectors(targetWorld, origin);
        const u = diff.dot(xAxis);
        const v = diff.dot(yAxis);

        return [u, v, 0];
    };

    const getIntersects = (clientX: number, clientY: number) => {
        if (!containerRef || !camera) return [];
        // Note: mainMesh and tessellation can be null in sketch mode - don't require them
        const rect = containerRef.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Set thresholds for easier picking
        raycaster.params.Points.threshold = 10; // Pixels
        raycaster.params.Line.threshold = 4.0; // World units (Aggressive pick tolerance) - bumped from 1.0

        // Raycast against mainMesh (faces) and Sketch Groups
        let targets: THREE.Object3D[] = [];

        // 1. Tessellation (Main Mesh)
        if (mainMesh) {
            targets.push(mainMesh);
            // Also children (lines/points)
            if (mainMesh.children.length > 0) {
                mainMesh.children.forEach(c => targets.push(c));
            }
        }

        // 2. Sketch Renderer Group
        const sketchGroup = scene.getObjectByName("sketch_renderer_group");
        if (sketchGroup) targets.push(sketchGroup);

        // 3. Dimension Renderer Group (for hitboxes)
        const dimGroup = scene.getObjectByName("dimension_renderer_group");
        if (dimGroup) targets.push(dimGroup);

        // 4. Snap Markers (optional, usually not selectable but good for debug)
        const snapGroup = scene.getObjectByName("snap_markers_group");
        if (snapGroup) targets.push(snapGroup);


        // Recursive intersect for groups
        const intersects = raycaster.intersectObjects(targets, true);

        // Sort by priority
        intersects.sort((a, b) => {
            const distDiff = a.distance - b.distance;
            // If distances are significantly different, closest object wins
            if (Math.abs(distDiff) > 0.0001) {
                return distDiff;
            }

            const typeScore = (obj: THREE.Object3D) => {
                // Highest priority: Dimension Hitboxes / Controls
                if (obj.userData && obj.userData.isDimensionHitbox) return -3;

                // High priority: Sketch Elements (Lines/Points)
                // Check if it belongs to sketch group
                let parent = obj.parent;
                while (parent) {
                    if (parent.name === "sketch_renderer_group") return -2;
                    if (parent.name === "snap_markers_group") return -1;
                    parent = parent.parent;
                }

                if (obj.type === 'Points') return -1; // Sketch points
                if (obj.type === 'LineSegments') return 0; // Sketch lines
                return 2; // Mesh (Faces) - lowest priority
            };

            const scoreA = typeScore(a.object);
            const scoreB = typeScore(b.object);

            return scoreA - scoreB;
        });

        return intersects;
    };

    const updateHighlightMesh = (
        _targetMeshRef: { current: THREE.Mesh | null },
        indices: number[],
        color: number,
        opacity: number,
        name: string
    ) => {
        if (!mainMesh) return;

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
                depthTest: true, // Enable depth test but use polygon offset
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
    };

    // Plane Selection Helpers (Visuals)
    createEffect(() => {
        if (!ready() || !scene) return;

        console.log("Viewport Effect: sketchSetupMode changed to:", props.sketchSetupMode);

        const PLANE_HELPER_NAME = "plane_selection_helpers";
        let group = scene.getObjectByName(PLANE_HELPER_NAME);
        if (group) {
            scene.remove(group);
            // Dispose children
            group.traverse((child) => {
                if ((child as any).geometry) (child as any).geometry.dispose();
                if ((child as any).material) (child as any).material.dispose();
            });
        }

        if (props.sketchSetupMode) {
            group = new THREE.Group();
            group.name = PLANE_HELPER_NAME;

            const planeSize = 10;
            const planeOpacity = 0.2;
            // const planeColor = 0xffff00; // unused

            // XY Plane
            const xyGeo = new THREE.PlaneGeometry(planeSize, planeSize);
            const xyMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: planeOpacity, side: THREE.DoubleSide });
            const xyMesh = new THREE.Mesh(xyGeo, xyMat);
            xyMesh.name = "XY Plane";
            xyMesh.userData = {
                isPlaneHelper: true,
                plane: {
                    origin: [0, 0, 0],
                    normal: [0, 0, 1],
                    x_axis: [1, 0, 0],
                    y_axis: [0, 1, 0]
                }
            };
            group.add(xyMesh);

            // XZ Plane
            const xzGeo = new THREE.PlaneGeometry(planeSize, planeSize);
            const xzMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: planeOpacity, side: THREE.DoubleSide });
            const xzMesh = new THREE.Mesh(xzGeo, xzMat);
            xzMesh.rotateX(-Math.PI / 2);
            xzMesh.name = "XZ Plane";
            xzMesh.userData = {
                isPlaneHelper: true,
                plane: {
                    origin: [0, 0, 0],
                    normal: [0, 1, 0],
                    x_axis: [1, 0, 0],
                    y_axis: [0, 0, -1]
                }
            };
            group.add(xzMesh);

            // YZ Plane
            const yzGeo = new THREE.PlaneGeometry(planeSize, planeSize);
            const yzMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: planeOpacity, side: THREE.DoubleSide });
            const yzMesh = new THREE.Mesh(yzGeo, yzMat);
            yzMesh.rotateY(Math.PI / 2);
            yzMesh.name = "YZ Plane";
            yzMesh.userData = {
                isPlaneHelper: true,
                plane: {
                    origin: [0, 0, 0],
                    normal: [1, 0, 0],
                    x_axis: [0, 1, 0],
                    y_axis: [0, 0, 1]
                }
            };
            group.add(yzMesh);

            scene.add(group);
        }
    });

    // Helper: Raycast including Plane Helpers
    const getIntersectsWithPlanes = (clientX: number, clientY: number) => {
        if (!containerRef || !camera || !scene) return [];

        const rect = containerRef.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const targets: THREE.Object3D[] = [];

        // Add Plane Helpers
        const planeGroup = scene.getObjectByName("plane_selection_helpers");
        if (planeGroup) {
            targets.push(...planeGroup.children);
        }

        // Add Geometry Faces
        if (mainMesh) {
            targets.push(mainMesh);
        }

        return raycaster.intersectObjects(targets, false);
    };

    const onCanvasClick = (event: MouseEvent) => {
        // If in sketch setup mode, prioritize plane selection
        if (props.sketchSetupMode && props.onSelectPlane) {
            const intersects = getIntersectsWithPlanes(event.clientX, event.clientY);

            if (intersects.length > 0) {
                // Check for Plane Helper first
                const planeHelperHit = intersects.find(i => i.object.userData.isPlaneHelper);
                if (planeHelperHit) {
                    props.onSelectPlane(planeHelperHit.object.userData.plane);
                    return;
                }

                // Fallback to Face selection
                const faceHit = intersects.find(i => i.faceIndex !== undefined && i.object === mainMesh);
                if (faceHit && faceHit.faceIndex !== undefined) {
                    const normal = faceHit.face!.normal.clone();
                    // Simple axis alignment for now
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

        if (!props.onSelect) return;

        // Normal Selection Logic
        const intersects = getIntersects(event.clientX, event.clientY);

        let modifier: "replace" | "add" | "remove" = "replace";
        if (event.ctrlKey || event.metaKey) {
            modifier = "add";
        } else if (event.shiftKey) {
            modifier = "add";
        }

        if (intersects.length > 0) {
            let topoId = null;

            // Iterate through intersections to find the right one based on filter
            for (const hit of intersects) {

                // Skip highlight meshes
                if (hit.object.name.includes('highlight') || hit.object.name.includes('selection')) {
                    continue;
                }

                // 1. SKETCH ENTITY SELECTION (has userData.idMap) - highest priority
                if (hit.object.userData && hit.object.userData.idMap) {
                    let idx = hit.index ?? hit.faceIndex;
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

                        topoId = { id: entId, type: type };
                        break;
                    }
                    continue;
                }

                // 2. FACE SELECTION (mainMesh with faceIndex) - most common 3D selection
                if (hit.object === mainMesh && hit.faceIndex != null && props.tessellation?.triangle_ids) {
                    const idx = hit.faceIndex;
                    if (idx != null && idx >= 0 && idx < props.tessellation.triangle_ids.length) {
                        topoId = props.tessellation.triangle_ids[idx];
                        break;
                    }
                    continue;
                }

                // 3. EDGE SELECTION (LineSegments2 named "sketch_lines")
                if (hit.object.name === 'sketch_lines' && hit.faceIndex != null && props.tessellation?.line_ids) {
                    // LineSegments2 uses faceIndex as segment index
                    const idx = hit.faceIndex;
                    if (idx != null && idx >= 0 && idx < props.tessellation.line_ids.length) {
                        topoId = props.tessellation.line_ids[idx];
                        break;
                    }
                    continue;
                }

                // 4. VERTEX SELECTION (Points geometry named "vertices") - last priority
                if (hit.object.name === 'vertices' && hit.index != null && props.tessellation?.point_ids) {
                    const idx = hit.index;
                    if (idx != null && idx >= 0 && idx < props.tessellation.point_ids.length) {
                        topoId = props.tessellation.point_ids[idx];
                        break;
                    }
                    continue;
                }
            }

            if (topoId) {
                props.onSelect(topoId, modifier);
            } else {
                // No specific geometry clicked, try region click for extrude mode
                if (props.onRegionClick && props.clientSketch?.plane) {
                    const target = getSketchPlaneIntersection(event.clientX, event.clientY);
                    if (target) {
                        props.onRegionClick([target[0], target[1]]);
                        return;
                    }
                }
            }
        } else {
            // Clicked empty space
            if (props.onRegionClick && props.clientSketch?.plane) {
                const target = getSketchPlaneIntersection(event.clientX, event.clientY);
                if (target) {
                    props.onRegionClick([target[0], target[1]]);
                    return;
                }
            }
            if (props.onSelect) {
                props.onSelect(null, "replace");
            }
        }
    };

    // Sketch Drawing Input
    const onCanvasMouseDown = (event: MouseEvent) => {
        // Prevent drawing while selecting planes
        if (props.sketchSetupMode) return;

        if (!props.onCanvasClick || !camera) return;

        // Correctly intersect the active sketch plane
        const target = getSketchPlaneIntersection(event.clientX, event.clientY);
        if (target) {
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



    // State must be outside effect to persist across sketch updates
    let isDragging = false;
    let dragIndex = -1;
    let dragType: "Distance" | "Angle" | "Radius" | "DistanceParallelLines" | "HorizontalDistance" | "VerticalDistance" | "DistancePointLine" | null = null;
    let startOffset = [0, 0];
    let dragUserData: any = null;
    let dragStartPoint = new THREE.Vector3(); // World
    let dragStartLocal = { x: 0, y: 0 }; // Local

    createEffect(() => {
        // Setup listeners ONLY when ready. Dependencies: container, scene, camera.
        if (!ready() || !containerRef || !scene || !camera) return;

        // Helper: Transform World Point to Local Sketch Space
        // This is CRITICAL for correct dragging on rotated planes
        const getLocalPos = (worldPos: THREE.Vector3) => {
            if (!props.clientSketch || !props.clientSketch.plane) return { x: worldPos.x, y: worldPos.y };
            const p = props.clientSketch.plane;
            // Origin and Axis in World Space
            const origin = new THREE.Vector3(p.origin[0], p.origin[1], p.origin[2]);
            const xAxis = new THREE.Vector3(p.x_axis[0], p.x_axis[1], p.x_axis[2]);
            const yAxis = new THREE.Vector3(p.y_axis[0], p.y_axis[1], p.y_axis[2]);

            const diff = worldPos.clone().sub(origin);
            return {
                x: diff.dot(xAxis),
                y: diff.dot(yAxis)
            };
        };

        const onPointerDown = (e: PointerEvent) => {
            if (!containerRef || !props.clientSketch) return;
            const rect = containerRef.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            // Raycast against indicator group children (hitboxes)
            const CONSTRAINT_INDICATOR_NAME = "constraint_indicators";
            const DIMENSION_RENDERER_NAME = "dimension_renderer_group";

            const indicatorGroup = scene.getObjectByName(CONSTRAINT_INDICATOR_NAME);
            const dimensionGroup = scene.getObjectByName(DIMENSION_RENDERER_NAME);

            let targets: THREE.Object3D[] = [];
            if (indicatorGroup) targets = targets.concat(indicatorGroup.children);
            if (dimensionGroup) targets = targets.concat(dimensionGroup.children);

            console.log('[Viewport] Raycast targets:', targets.length, 'from dimension group:', dimensionGroup?.children.length);
            if (targets.length === 0) return;

            // Enable recursive raycasting to catch nested hitboxes
            const hits = raycaster.intersectObjects(targets, true);
            console.log('[Viewport] Raycast hits:', hits.length, hits.map(h => h.object.userData));

            for (const hit of hits) {
                if (hit.object.userData && hit.object.userData.isDimensionHitbox) {
                    // Start dragging
                    console.log('[Viewport] Dimension hitbox clicked:', hit.object.userData);
                    e.stopPropagation(); // Prevent orbit controls or other clicks
                    isDragging = true;
                    dragIndex = hit.object.userData.index;
                    dragType = hit.object.userData.type;
                    dragUserData = hit.object.userData;
                    dragStartPoint.copy(hit.point);
                    dragStartLocal = getLocalPos(hit.point); // Cache start in local space

                    const entry = props.clientSketch.constraints[dragIndex];
                    console.log('[Viewport] Constraint at index', dragIndex, ':', entry);
                    // Unwrap SketchConstraintEntry to get the actual constraint (same as rendering code)
                    const constraint = (entry as any).constraint || entry;
                    console.log('[Viewport] Unwrapped constraint:', constraint, 'dragType:', dragType);
                    if (dragType === "Distance" && constraint.Distance && constraint.Distance.style) {
                        startOffset = [...constraint.Distance.style.offset];
                    } else if (dragType === "Angle" && constraint.Angle && constraint.Angle.style) {
                        startOffset = [...constraint.Angle.style.offset];
                    } else if (dragType === "Radius" && constraint.Radius && constraint.Radius.style) {
                        startOffset = [...constraint.Radius.style.offset];
                    } else if (dragType === "DistanceParallelLines" && constraint.DistanceParallelLines && constraint.DistanceParallelLines.style) {
                        startOffset = [...constraint.DistanceParallelLines.style.offset];
                    } else if (dragType === "HorizontalDistance" && constraint.HorizontalDistance && constraint.HorizontalDistance.style) {
                        startOffset = [...constraint.HorizontalDistance.style.offset];
                    } else if (dragType === "VerticalDistance" && constraint.VerticalDistance && constraint.VerticalDistance.style) {
                        startOffset = [...constraint.VerticalDistance.style.offset];
                    } else if (dragType === "DistancePointLine" && constraint.DistancePointLine) {
                        // style may be absent; default to [0, 0]
                        startOffset = constraint.DistancePointLine.style?.offset
                            ? [...constraint.DistancePointLine.style.offset]
                            : [0, 0];
                    }

                    // Disable orbit controls
                    if (controls) controls.enabled = false;
                    return;
                }
            }
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging || !containerRef) return;

            const rect = containerRef.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // Project mouse to world plane Z=0 (technically Camera plane, then pushed to Z=0 if we assume standard Viewport)
            // Ideally we should intersect with the Sketch Plane itself, but Unproject+Raycast is safer generic approach.
            // For now, unprojecting to "some point in front of camera" is sufficient if we then map relative motion?
            // "worldPos" calculation below projects to Z=0. If sketch is at Z=100, this is wrong.
            // BETTER: Intersect the actual sketch plane logic.

            const vec = new THREE.Vector3(x, y, 0.5);
            vec.unproject(camera);
            const dir = vec.sub(camera.position).normalize();

            // Intersect with the Sketch Plane properly
            let worldPos: THREE.Vector3;
            if (props.clientSketch && props.clientSketch.plane) {
                const p = props.clientSketch.plane;
                const planeNormal = new THREE.Vector3().fromArray(p.normal);
                const planeOrigin = new THREE.Vector3().fromArray(p.origin);

                // Ray-Plane Intersection: dist = (planeOrigin - rayOrigin) . planeNormal / (rayDir . planeNormal)
                const rayOrigin = camera.position;
                const denom = dir.dot(planeNormal);
                if (Math.abs(denom) < 1e-6) return; // Parallel, no hit

                const t = planeOrigin.clone().sub(rayOrigin).dot(planeNormal) / denom;
                worldPos = rayOrigin.clone().add(dir.multiplyScalar(t));
            } else {
                // Fallback to Z=0
                const distance = -camera.position.z / dir.z;
                worldPos = camera.position.clone().add(dir.multiplyScalar(distance));
            }

            const currentLocal = getLocalPos(worldPos);

            if (dragType === "Distance") {
                const dx = currentLocal.x - dragStartLocal.x;
                const dy = currentLocal.y - dragStartLocal.y;

                // Project delta onto direction (for slide) and normal (for dist)
                const { dirX, dirY } = dragUserData; // dirX, dirY are Local
                const normalX = -dirY;
                const normalY = dirX;

                const deltaPara = dx * dirX + dy * dirY;
                const deltaPerp = dx * normalX + dy * normalY;

                const newOffset: [number, number] = [
                    startOffset[0] + deltaPara,
                    startOffset[1] + deltaPerp
                ];

                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "Angle") {
                // For Angle, offset[1] is radius change
                // Center is in LOCAL coordinates (it comes from geometry)
                const center = dragUserData.center;

                // Calculate distances in LOCAL space
                const currentDist = Math.sqrt((currentLocal.x - center[0]) ** 2 + (currentLocal.y - center[1]) ** 2);
                const startDistLocal = Math.sqrt((dragStartLocal.x - center[0]) ** 2 + (dragStartLocal.y - center[1]) ** 2);

                const deltaRadius = currentDist - startDistLocal;

                const newOffset: [number, number] = [
                    startOffset[0],
                    startOffset[1] + deltaRadius
                ];
                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "Radius") {
                // For Radius, offset[1] is angle
                const center = dragUserData.center;
                const startAngle = Math.atan2(dragStartLocal.y - center[1], dragStartLocal.x - center[0]);
                const currentAngle = Math.atan2(currentLocal.y - center[1], currentLocal.x - center[0]);

                let deltaAngle = currentAngle - startAngle;

                const newOffset: [number, number] = [
                    startOffset[0],
                    startOffset[1] + deltaAngle
                ];
                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "DistanceParallelLines") {
                // For DistanceParallelLines, use similar logic to Distance
                // The offset controls perpendicular position of the dimension line
                const dx = currentLocal.x - dragStartLocal.x;
                const dy = currentLocal.y - dragStartLocal.y;

                // Use dirX, dirY if available, otherwise use delta directly for offset[1]
                const { dirX, dirY } = dragUserData || { dirX: 1, dirY: 0 };
                const normalX = -dirY;
                const normalY = dirX;

                const deltaPara = dx * dirX + dy * dirY;
                const deltaPerp = dx * normalX + dy * normalY;

                const newOffset: [number, number] = [
                    startOffset[0] + deltaPara,
                    startOffset[1] + deltaPerp
                ];

                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "HorizontalDistance") {
                // For HorizontalDistance, only Y movement affects offset[1] (vertical position of horizontal dim line)
                const dy = currentLocal.y - dragStartLocal.y;

                const newOffset: [number, number] = [
                    startOffset[0],
                    startOffset[1] + dy
                ];

                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "VerticalDistance") {
                // For VerticalDistance, only X movement affects offset[0] (horizontal position of vertical dim line)
                const dx = currentLocal.x - dragStartLocal.x;

                const newOffset: [number, number] = [
                    startOffset[0] + dx,
                    startOffset[1]
                ];

                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            } else if (dragType === "DistancePointLine") {
                // Reuse DistanceParallelLines logic (same vector math)
                const dx = currentLocal.x - dragStartLocal.x;
                const dy = currentLocal.y - dragStartLocal.y;

                const { dirX, dirY } = dragUserData || { dirX: 1, dirY: 0 };
                const normalX = -dirY;
                const normalY = dirX;

                const deltaPara = dx * dirX + dy * dirY;
                const deltaPerp = dx * normalX + dy * normalY;

                const newOffset: [number, number] = [
                    startOffset[0] + deltaPara,
                    startOffset[1] + deltaPerp
                ];

                if (props.onDimensionDrag) props.onDimensionDrag(dragIndex, newOffset);
            }
        };

        const onPointerUp = () => {
            isDragging = false;
            dragIndex = -1;
            dragType = null;
            if (controls) controls.enabled = true;
        };

        containerRef.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove); // Listen on window for smooth drag
        window.addEventListener("pointerup", onPointerUp);

        onCleanup(() => {
            containerRef.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        });
    });

    const onPointerMove = (event: MouseEvent) => {
        // Define helper locally
        const createTextSprite = (text: string, color: string, size: number): THREE.Sprite => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            const fontSize = 32;
            ctx.font = `bold ${fontSize}px Arial`;
            const textWidth = ctx.measureText(text).width;
            canvas.width = Math.max(128, Math.ceil(textWidth + 20));
            canvas.height = 48;
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(canvas.width / 100 * size, canvas.height / 100 * size, 1);
            return sprite;
        };

        // Hover logic
        // Hover logic
        // if (!props.tessellation || !mainMesh) return; // Moved check down


        // Project mouse to world for preview
        const rect = containerRef!.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0.5);
        vec.unproject(camera);
        const dir = vec.sub(camera.position).normalize();

        // Calculate intersection with sketch plane or default z=0
        let worldPos = new THREE.Vector3();
        const matrix = new THREE.Matrix4();

        if (props.clientSketch && props.clientSketch.plane) {
            const plane = props.clientSketch.plane;
            const origin = new THREE.Vector3().fromArray(plane.origin);
            const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
            const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
            const zAxis = new THREE.Vector3().fromArray(plane.normal);

            matrix.makeBasis(xAxis, yAxis, zAxis);
            matrix.setPosition(origin);

            const normal = zAxis.clone();
            const denom = dir.dot(normal);
            if (Math.abs(denom) > 0.0001) {
                const t = origin.clone().sub(camera.position).dot(normal) / denom;
                const hit = camera.position.clone().add(dir.clone().multiplyScalar(t));
                // Transform Hit to Local Sketch Space
                worldPos = hit.clone().applyMatrix4(matrix.clone().invert());
            }
        } else {
            const distance = -camera.position.z / dir.z;
            worldPos = camera.position.clone().add(dir.multiplyScalar(distance));
        }

        // Update Preview Dimension
        const PREVIEW_DIMENSION_NAME = "preview_dimension";
        let previewGroup = scene.getObjectByName(PREVIEW_DIMENSION_NAME) as THREE.Group;
        if (previewGroup) {
            scene.remove(previewGroup);
            previewGroup.traverse((child) => {
                if ((child as any).geometry) (child as any).geometry.dispose();
                if ((child as any).material) (child as any).material.dispose();
            });
        }

        console.log("[Viewport onPointerMove] previewDimension:", props.previewDimension);

        // Report mouse position for dynamic dimension mode switching (Onshape-style)
        // Always report when callback exists, not just when previewDimension exists,
        // so the mode can be calculated correctly based on current mouse position
        if (props.onDimensionMouseMove) {
            props.onDimensionMouseMove([worldPos.x, worldPos.y]);
        }

        if (props.previewDimension && props.previewDimension.selections.length > 0) {
            console.log("[Viewport] Rendering preview dimension:", props.previewDimension);
            let textPos: [number, number] | null = null;
            previewGroup = new THREE.Group();
            previewGroup.name = PREVIEW_DIMENSION_NAME;

            // Apply Sketch Plane Transform
            if (props.clientSketch && props.clientSketch.plane) {
                previewGroup.matrixAutoUpdate = false;
                previewGroup.matrix.copy(matrix);
            }

            const selections = props.previewDimension.selections;

            // Simplified Helper to get positions
            const getPos = (c: any): [number, number] | null => {
                console.log("[getPos] Input:", c);
                if (c.type === "origin") return [0, 0];
                if (c.type === "point") {
                    // First check if position is directly on the candidate
                    if (c.position) {
                        console.log("[getPos] point with position:", c.position);
                        return c.position;
                    }
                    // Otherwise, look up by entity ID (for Point entities selected as "point" type)
                    if (c.id) {
                        const sk = props.clientSketch;
                        if (sk) {
                            const ent = sk.entities.find((e: any) => e.id === c.id);
                            if (ent?.geometry.Point) {
                                console.log("[getPos] point entity lookup:", ent.geometry.Point.pos);
                                return ent.geometry.Point.pos;
                            }
                        }
                    }
                }
                if (c.type === "entity") {
                    const sk = props.clientSketch;
                    if (!sk) return null;
                    const ent = sk.entities.find((e: any) => e.id === c.id);
                    if (ent?.geometry.Point) return ent.geometry.Point.pos;
                    if (ent?.geometry.Line) return ent.geometry.Line.start;
                    if (ent?.geometry.Circle) return ent.geometry.Circle.center;
                    if (ent?.geometry.Arc) return ent.geometry.Arc.center;
                }
                console.log("[getPos] returning null for:", c);
                return null;
            };

            const type = props.previewDimension.type;

            if ((type === "Distance" || type === "HorizontalDistance" || type === "VerticalDistance" || type === "Length") && selections.length >= 1) {
                let p1 = getPos(selections[0]);
                let p2 = selections.length > 1 ? getPos(selections[1]) : null;

                // Handle Line-Point case where we only have 2 points internally
                if (selections.length === 2 && !p2 && selections[1].type === "point") {
                    p2 = selections[1].position;
                }

                // If only 1 entity (Length), start/end
                if (selections.length === 1 && selections[0].type === "entity") {
                    const sk = props.clientSketch;
                    const ent = sk?.entities.find((e: any) => e.id === selections[0].id);
                    if (ent?.geometry.Line) {
                        p1 = ent.geometry.Line.start;
                        p2 = ent.geometry.Line.end;
                    }
                }

                if (p1 && p2) {
                    const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });

                    if (type === "HorizontalDistance") {
                        // Horizontal Dimension: Extension lines vertical, Dim line horizontal
                        const y = worldPos.y;
                        // Ext lines: (p1.x, p1.y) -> (p1.x, y)
                        const ext1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], p1[1], 0), new THREE.Vector3(p1[0], y, 0)]);
                        const ext2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p2[0], p2[1], 0), new THREE.Vector3(p2[0], y, 0)]);
                        // Dim Line: (p1.x, y) -> (p2.x, y)
                        const dimLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], y, 0), new THREE.Vector3(p2[0], y, 0)]);

                        previewGroup.add(new THREE.Line(ext1, dimMat));
                        previewGroup.add(new THREE.Line(ext2, dimMat));
                        previewGroup.add(new THREE.Line(dimLine, dimMat));

                        // Text Position
                        const midX = (p1[0] + p2[0]) / 2;
                        textPos = [midX, y];

                    } else if (type === "VerticalDistance") {
                        // Vertical Dimension: Extension lines horizontal, Dim line vertical
                        const x = worldPos.x;
                        // Ext lines: (p1.x, p1.y) -> (x, p1.y)
                        const ext1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], p1[1], 0), new THREE.Vector3(x, p1[1], 0)]);
                        const ext2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p2[0], p2[1], 0), new THREE.Vector3(x, p2[1], 0)]);
                        // Dim Line: (x, p1.y) -> (x, p2.y)
                        const dimLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, p1[1], 0), new THREE.Vector3(x, p2[1], 0)]);

                        previewGroup.add(new THREE.Line(ext1, dimMat));
                        previewGroup.add(new THREE.Line(ext2, dimMat));
                        previewGroup.add(new THREE.Line(dimLine, dimMat));

                        // Text Position
                        const midY = (p1[1] + p2[1]) / 2;
                        textPos = [x, midY];

                    } else {
                        // Aligned Distance
                        let dx = p2[0] - p1[0];
                        let dy = p2[1] - p1[1];
                        let len = Math.sqrt(dx * dx + dy * dy);
                        if (len < 0.001) { dx = 1; dy = 0; len = 1; }
                        const nx = dx / len;
                        const ny = dy / len;

                        // Project mouse to find offset
                        const vx = worldPos.x - p1[0];
                        const vy = worldPos.y - p1[1];
                        const perp = vx * -ny + vy * nx; // Perpendicular distance

                        const p1_ext = [p1[0] - ny * perp, p1[1] + nx * perp];
                        const p2_ext = [p2[0] - ny * perp, p2[1] + nx * perp];

                        // Extension lines
                        const ext1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], p1[1], 0), new THREE.Vector3(p1_ext[0], p1_ext[1], 0)]);
                        previewGroup.add(new THREE.Line(ext1, dimMat));
                        const ext2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p2[0], p2[1], 0), new THREE.Vector3(p2_ext[0], p2_ext[1], 0)]);
                        previewGroup.add(new THREE.Line(ext2, dimMat)); // Fixed typo here (was ext1)

                        // Dimension Line
                        const dimLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1_ext[0], p1_ext[1], 0), new THREE.Vector3(p2_ext[0], p2_ext[1], 0)]);
                        previewGroup.add(new THREE.Line(dimLine, dimMat));

                        // Text Position
                        textPos = [(p1_ext[0] + p2_ext[0]) / 2, (p1_ext[1] + p2_ext[1]) / 2];
                    }
                }
                if (textPos) {
                    const textSprite = createTextSprite(props.previewDimension.value.toFixed(2), "#00dddd", 0.03);
                    textSprite.position.set(textPos[0], textPos[1], 0.02);
                    previewGroup.add(textSprite);
                }


            } else if (type === "DistancePointLine" && selections.length === 2 && props.clientSketch) {
                const sk = props.clientSketch;
                const c1 = selections[0];
                const c2 = selections[1];

                const isLine = (c: any) => c.type === "entity" && sk.entities.find((e: any) => e.id === c.id)?.geometry.Line;
                const getLine = (c: any) => sk.entities.find((e: any) => e.id === c.id)?.geometry.Line;

                const lineC = isLine(c1) ? c1 : c2;
                const pointC = isLine(c1) ? c2 : c1;

                const line = getLine(lineC);
                // getPos logic helper is inside updating loop, but we can reuse it if captured? 
                // It is defined in scope above at line 1113.
                const p = getPos(pointC);

                if (line && p) {
                    const dx = line.end[0] - line.start[0];
                    const dy = line.end[1] - line.start[1];
                    const len = Math.sqrt(dx * dx + dy * dy);

                    if (len > 0.0001) {
                        const nx = dx / len;
                        const ny = dy / len;

                        // Project point onto line
                        const vx = p[0] - line.start[0];
                        const vy = p[1] - line.start[1];
                        const t = vx * nx + vy * ny;

                        const projX = line.start[0] + nx * t;
                        const projY = line.start[1] + ny * t;

                        const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });

                        // Draw dimension line in World Space
                        const pWorld = sketchToWorld(p[0], p[1], props.clientSketch.plane);
                        const projWorld = sketchToWorld(projX, projY, props.clientSketch.plane);

                        const dimLine = new THREE.BufferGeometry().setFromPoints([
                            pWorld,
                            projWorld
                        ]);
                        previewGroup.add(new THREE.Line(dimLine, dimMat));

                        // Text
                        const midX = (p[0] + projX) / 2;
                        const midY = (p[1] + projY) / 2;

                        // direction for perpendicular offset
                        const distDx = p[0] - projX;
                        const distDy = p[1] - projY;
                        const distLen = Math.sqrt(distDx * distDx + distDy * distDy);
                        const nDx = distLen > 0.001 ? distDx / distLen : -ny;
                        const nDy = distLen > 0.001 ? distDy / distLen : nx;

                        // Perpendicular offset in sketch space
                        const offsetX = nDy * 0.1;
                        const offsetY = -nDx * 0.1;

                        const textSketchX = midX + offsetX;
                        const textSketchY = midY + offsetY;

                        // Transform to world space for sprite position
                        // NOTE: using getLocalPos inverse logic or assuming Z-up world matches logic?
                        // Viewport lines are drawn with (x, y, 0).
                        // If viewport camera is looking at this plane, then Z=0.02 is correct relative to the lines.
                        // BUT if sketch plane is rotated, (x, y, 0) is wrong for lines too. 
                        // However, solving ONE problem: the TEXT visibility.

                        const val = (props.previewDimension.value !== undefined && props.previewDimension.value !== null && !isNaN(props.previewDimension.value))
                            ? props.previewDimension.value
                            : 0;

                        const textSprite = createTextSprite(val.toFixed(2), "#00dddd", 0.03);

                        // Ensure sprite is slightly above lines
                        textSprite.position.set(textSketchX, textSketchY, 0.02);
                        previewGroup.add(textSprite);
                    }
                }

            } else if (type === "Radius" && selections.length === 1) {
                const center = getPos(selections[0]);
                if (center) {
                    const radius = props.previewDimension.value;





                    const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });

                    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(center[0], center[1], 0), new THREE.Vector3(worldPos.x, worldPos.y, 0)]);
                    previewGroup.add(new THREE.Line(lineGeo, dimMat));

                    const textSprite = createTextSprite("R " + radius.toFixed(2), "#00dddd", 0.03);
                    textSprite.position.set(worldPos.x, worldPos.y, 0.02);
                    previewGroup.add(textSprite);
                }
            } else if (type === "Angle") {
                // Simplified angle preview 
                // TODO: fully implement
                const textSprite = createTextSprite("Angle " + (props.previewDimension.value * 180 / Math.PI).toFixed(1), "#00dddd", 0.03);
                textSprite.position.set(worldPos.x, worldPos.y, 0.02);
                previewGroup.add(textSprite);
            }

            scene.add(previewGroup);
        } else {
            // Cleanup if no valid preview
            const existing = scene.getObjectByName(PREVIEW_DIMENSION_NAME);
            if (existing) scene.remove(existing);
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
    createEffect(() => {
        // CRITICAL: Access reactive signals FIRST so SolidJS tracks them as dependencies
        // If we return early before accessing them, they won't trigger re-runs
        const currentSelection = props.selection;
        const currentTessellation = props.tessellation;

        // Now we can safely check non-reactive conditions
        if (!mainMesh || !currentTessellation) return;

        const data = currentTessellation;
        const SEL_EDGE_NAME = "selection_edge_highlight";
        const SEL_FACE_NAME = "selection_highlight";

        // Clear existing face highlight first (always clean start)
        const existingFaceHighlight = mainMesh.getObjectByName(SEL_FACE_NAME);
        if (existingFaceHighlight) {
            mainMesh.remove(existingFaceHighlight);
            (existingFaceHighlight as THREE.Mesh).geometry?.dispose();
            ((existingFaceHighlight as THREE.Mesh).material as THREE.Material)?.dispose();
        }

        // Clear existing edge highlights
        const existingEdgeHighlight = mainMesh.getObjectByName(SEL_EDGE_NAME);
        if (existingEdgeHighlight) {
            mainMesh.remove(existingEdgeHighlight);
            existingEdgeHighlight.traverse((child) => {
                if ((child as any).geometry) (child as any).geometry.dispose();
                if ((child as any).material) (child as any).material.dispose();
            });
        }

        if (!currentSelection || currentSelection.length === 0) {
            return;
        }

        // Helper: compare TopoIds robustly (handles large numbers as strings)
        const topoIdMatches = (a: any, b: any): boolean => {
            if (!a || !b) return false;
            // Compare feature_id as string, local_id as string, rank as string
            return String(a.feature_id) === String(b.feature_id)
                && String(a.local_id) === String(b.local_id)
                && String(a.rank) === String(b.rank);
        };

        // === FACE SELECTION (triangles) ===
        const faceIndices: number[] = [];
        data.triangle_ids.forEach((tid, triIdx) => {
            const isSelected = currentSelection.some(s => topoIdMatches(s, tid));
            if (isSelected) {
                faceIndices.push(data.indices[triIdx * 3]);
                faceIndices.push(data.indices[triIdx * 3 + 1]);
                faceIndices.push(data.indices[triIdx * 3 + 2]);
            }
        });

        if (faceIndices.length > 0) {
            console.log("[Viewport] Highlighting", faceIndices.length / 3, "triangles (faces)");

            // Create face highlight mesh directly here (not via updateHighlightMesh)
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
            mesh.renderOrder = 1001; // Higher than hover
            mainMesh.add(mesh);
        }

        // === EDGE SELECTION (lines) ===
        const SEL_VERTEX_NAME = "selection_vertex_highlight";
        const edgeSegments: number[] = [];

        // Debug: log what we're looking for
        const edgeSelections = currentSelection.filter(s => s.rank === "Edge");
        if (edgeSelections.length > 0) {
            console.log("[Viewport] Looking for edges:", edgeSelections.length, "edge selections");
            console.log("[Viewport] Available line_ids:", data.line_ids?.length || 0);
        }

        if (data.line_ids && data.line_indices) {
            // line_ids: one ID per line segment (2 consecutive indices per segment)
            data.line_ids.forEach((tid, lineIdx) => {
                const isSelected = currentSelection.some(s => topoIdMatches(s, tid));
                if (isSelected) {
                    const idx1 = data.line_indices[lineIdx * 2];
                    const idx2 = data.line_indices[lineIdx * 2 + 1];
                    // Get world positions
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
                color: 0x00ffff, // CYAN for edges (distinct from orange faces)
                linewidth: 8, // Thick to stand out
                resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
                depthTest: true
            });

            const edgeHighlight = new LineSegments2(lineGeo, lineMat);
            edgeHighlight.name = SEL_EDGE_NAME;
            edgeHighlight.renderOrder = 1002; // Above face highlight
            edgeHighlight.computeLineDistances();
            mainMesh.add(edgeHighlight);
        } else if (edgeSelections.length > 0) {
            // Debug: we have edge selections but no matches found
        }

        // === VERTEX SELECTION (points) ===
        // Clear existing vertex highlight
        const existingVertexHighlight = mainMesh.getObjectByName(SEL_VERTEX_NAME);
        if (existingVertexHighlight) {
            mainMesh.remove(existingVertexHighlight);
            const mat = (existingVertexHighlight as THREE.Points).material as THREE.Material;
            mat?.dispose();
        }

        const vertexPositions: number[] = [];
        const vertexSelections = currentSelection.filter(s => s.rank === "Vertex");

        if (vertexSelections.length > 0 && data.point_ids && data.point_indices) {
            console.log("[Viewport] Looking for vertices:", vertexSelections.length, "vertex selections");

            data.point_ids.forEach((tid, ptIdx) => {
                const isSelected = currentSelection.some(s => topoIdMatches(s, tid));
                if (isSelected) {
                    const idx = data.point_indices[ptIdx];
                    vertexPositions.push(
                        data.vertices[idx * 3],
                        data.vertices[idx * 3 + 1],
                        data.vertices[idx * 3 + 2]
                    );
                }
            });
        }

        if (vertexPositions.length > 0) {
            console.log("[Viewport] Highlighting", vertexPositions.length / 3, "vertices");

            const pointGeo = new THREE.BufferGeometry();
            pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertexPositions, 3));

            const pointMat = new THREE.PointsMaterial({
                color: 0x00ff00, // GREEN for vertices (distinct from orange faces and cyan edges)
                size: 16,
                sizeAttenuation: false,
                depthTest: false // Always visible
            });

            const vertexHighlight = new THREE.Points(pointGeo, pointMat);
            vertexHighlight.name = SEL_VERTEX_NAME;
            vertexHighlight.renderOrder = 1003; // Above everything
            mainMesh.add(vertexHighlight);
        }
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
