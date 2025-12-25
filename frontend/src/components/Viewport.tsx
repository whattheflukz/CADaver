import { onCleanup, onMount, createEffect, createSignal, type Component } from "solid-js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import type { Tessellation, SnapPoint, SketchPlane, SolveResult, EntityConstraintStatus, SketchEntity } from "../types";

interface ViewportProps {
    tessellation: Tessellation | null;
    onSelect?: (topoId: any, modifier: "replace" | "add" | "remove") => void;
    selection?: any[];
    clientSketch?: any; // Type 'Sketch' from types.ts, but loose for now to avoid import cycles or just use 'any'
    onCanvasClick?: (type: "click" | "move" | "dblclick", point: [number, number, number]) => void;
    activeSnap?: SnapPoint | null; // Current snap point for visual indicator
    onDimensionDrag?: (constraintIndex: number, newOffset: [number, number]) => void;
    // New props for sketch setup
    sketchSetupMode?: boolean;
    onSelectPlane?: (plane: SketchPlane) => void;
    previewDimension?: {
        type: "Distance" | "Angle" | "Radius" | "Length" | "DistancePointLine" | "Unsupported";
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

                // Vertex points - orange dots at corners
                const pointMat = new THREE.PointsMaterial({
                    color: 0xffaa00, // Orange
                    size: 6, // Moderate size
                    sizeAttenuation: false,
                    depthTest: false, // Always on top
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
        raycaster.params.Line.threshold = 1.0; // World units (Aggressive pick tolerance)

        // Raycast against mainMesh and its children (lines, points)
        // Note: mainMesh itself is the faces. Children are lines/points.
        // We want to raycast all of them.

        let targets: THREE.Object3D[] = [];
        if (mainMesh) {
            targets.push(mainMesh);
            mainMesh.children.forEach(c => targets.push(c));
        }



        // Add Sketch Meshes to Raycast Targets
        const sketchMesh = scene.getObjectByName("client_sketch_preview");
        if (sketchMesh) targets.push(sketchMesh);

        const constructionMesh = scene.getObjectByName("client_sketch_preview_construction");
        if (constructionMesh) targets.push(constructionMesh);

        const definingPointsMesh = scene.getObjectByName("sketch_defining_points");
        if (definingPointsMesh) targets.push(definingPointsMesh);

        const hitboxMesh = scene.getObjectByName("client_sketch_hitbox");
        if (hitboxMesh) targets.push(hitboxMesh);

        const intersects = raycaster.intersectObjects(targets, false);

        // Sort by priority: Hitbox > Defining Points > Lines > Faces, then by distance
        intersects.sort((a, b) => {
            const typeScore = (obj: THREE.Object3D) => {
                // Highest priority: Hitbox for reliable picking
                if (obj.name === "client_sketch_hitbox") return -2;
                // High priority: Sketch preview and defining points
                if (obj.userData && obj.userData.idMap) return -1;
                if (obj.name === "sketch_defining_points") return -1;

                if (obj.type === 'Points') return 0;
                if (obj.type === 'LineSegments') return 1;
                return 2; // Mesh (Faces)
            };

            const scoreA = typeScore(a.object);
            const scoreB = typeScore(b.object);

            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.distance - b.distance;
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
                        topoId = hit.object.userData.idMap[idx];
                        console.log("[Click] Sketch entity:", topoId);
                        break;
                    }
                    continue;
                }

                // 2. FACE SELECTION (mainMesh with faceIndex) - most common 3D selection
                if (hit.object === mainMesh && hit.faceIndex !== undefined &&
                    props.tessellation?.triangle_ids?.length > 0) {
                    const idx = hit.faceIndex;
                    if (idx >= 0 && idx < props.tessellation.triangle_ids.length) {
                        topoId = props.tessellation.triangle_ids[idx];
                        console.log("[Click] Face:", topoId);
                        break;
                    }
                    continue;
                }

                // 3. EDGE SELECTION (LineSegments2 named "sketch_lines")
                if (hit.object.name === 'sketch_lines' && hit.faceIndex !== undefined &&
                    props.tessellation?.line_ids?.length > 0) {
                    // LineSegments2 uses faceIndex as segment index
                    const idx = hit.faceIndex;
                    if (idx >= 0 && idx < props.tessellation.line_ids.length) {
                        topoId = props.tessellation.line_ids[idx];
                        console.log("[Click] Edge:", topoId);
                        break;
                    }
                    continue;
                }

                // 4. VERTEX SELECTION (Points geometry named "vertices") - last priority
                if (hit.object.name === 'vertices' && hit.index !== undefined &&
                    props.tessellation?.point_ids?.length > 0) {
                    const idx = hit.index;
                    if (idx >= 0 && idx < props.tessellation.point_ids.length) {
                        topoId = props.tessellation.point_ids[idx];
                        console.log("[Click] Vertex:", topoId);
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
            props.onCanvasClick("click", target);
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

        // Clean up all sketch preview meshes (they have names like "client_sketch_preview_color")
        const toRemove: THREE.Object3D[] = [];
        scene.traverse((child) => {
            if (child.name.startsWith(SKETCH_PREVIEW_NAME)) {
                toRemove.push(child);
            }
        });
        toRemove.forEach((obj) => {
            scene.remove(obj);
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) (obj as any).material.dispose();
        });

        if (props.clientSketch && props.clientSketch.entities) {
            // ... (rest of code)

            const solidVertices: number[] = [];
            const solidIndices: number[] = [];
            let solidVIdx = 0;

            const constructionVertices: number[] = [];
            const constructionIndices: number[] = [];
            let constVIdx = 0;

            const selectedVertices: number[] = [];

            // Helper to transform 2D point to 3D world space
            const toWorld = (x: number, y: number): THREE.Vector3 => {
                const plane = props.clientSketch.plane;
                const origin = new THREE.Vector3().fromArray(plane.origin);
                const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
                const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
                return origin.add(xAxis.multiplyScalar(x)).add(yAxis.multiplyScalar(y));
            }

            props.clientSketch.entities.forEach((ent: any) => {
                const isConstruction = ent.is_construction === true;
                const isSelected = props.selection && props.selection.includes(ent.id);

                const vertices = isConstruction ? constructionVertices : solidVertices;
                const indices = isConstruction ? constructionIndices : solidIndices;
                let vIdx = isConstruction ? constVIdx : solidVIdx;

                // Helper to add segments
                const addSegment = (p1x: number, p1y: number, p2x: number, p2y: number) => {
                    const start = toWorld(p1x, p1y);
                    const end = toWorld(p2x, p2y);

                    if (isSelected) {
                        selectedVertices.push(start.x, start.y, start.z);
                        selectedVertices.push(end.x, end.y, end.z);
                    }

                    vertices.push(start.x, start.y, start.z);
                    vertices.push(end.x, end.y, end.z);
                    indices.push(vIdx, vIdx + 1);
                    vIdx += 2;
                };

                if (ent.geometry && ent.geometry.Line) {
                    const { start, end } = ent.geometry.Line;
                    addSegment(start[0], start[1], end[0], end[1]);
                } else if (ent.geometry && ent.geometry.Circle) {
                    const { center, radius } = ent.geometry.Circle;
                    const segments = 64; // SMOOTH RENDER: Increased segments
                    let prevX = center[0] + radius;
                    let prevY = center[1];
                    for (let i = 1; i <= segments; i++) {
                        const angle = (i / segments) * 2 * Math.PI;
                        const x = center[0] + radius * Math.cos(angle);
                        const y = center[1] + radius * Math.sin(angle);
                        addSegment(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                } else if (ent.geometry && ent.geometry.Arc) {
                    const { center, radius, start_angle, end_angle } = ent.geometry.Arc;
                    const segments = 64; // SMOOTH RENDER: Increased segments
                    let sweep = end_angle - start_angle;
                    if (sweep < 0) sweep += 2 * Math.PI;
                    let prevX = center[0] + radius * Math.cos(start_angle);
                    let prevY = center[1] + radius * Math.sin(start_angle);
                    for (let i = 1; i <= segments; i++) {
                        const t = i / segments;
                        const angle = start_angle + sweep * t;
                        const x = center[0] + radius * Math.cos(angle);
                        const y = center[1] + radius * Math.sin(angle);
                        addSegment(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                } else if (ent.geometry && ent.geometry.Point) {
                    // Render point as a small cross/marker for visibility
                    const { pos } = ent.geometry.Point;
                    const size = 0.3; // Size of the cross marker
                    // Horizontal line
                    addSegment(pos[0] - size, pos[1], pos[0] + size, pos[1]);
                    // Vertical line
                    addSegment(pos[0], pos[1] - size, pos[0], pos[1] + size);
                } else if (ent.geometry && ent.geometry.Ellipse) {
                    const { center, semi_major, semi_minor, rotation } = ent.geometry.Ellipse;
                    const segments = 64;
                    const cos_r = Math.cos(rotation);
                    const sin_r = Math.sin(rotation);

                    const ellipsePoint = (t: number): [number, number] => {
                        const x_local = semi_major * Math.cos(t);
                        const y_local = semi_minor * Math.sin(t);
                        return [
                            center[0] + x_local * cos_r - y_local * sin_r,
                            center[1] + x_local * sin_r + y_local * cos_r
                        ];
                    };

                    let [prevX, prevY] = ellipsePoint(0);
                    for (let i = 1; i <= segments; i++) {
                        const t = (i / segments) * 2 * Math.PI;
                        const [x, y] = ellipsePoint(t);
                        addSegment(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                }

                if (isConstruction) constVIdx = vIdx;
                else solidVIdx = vIdx;
            });

            // Build entity status lookup from solveResult
            const entityStatusMap = new Map<string, EntityConstraintStatus>();
            if (props.solveResult?.entity_statuses) {
                for (const status of props.solveResult.entity_statuses) {
                    entityStatusMap.set(status.id, status);
                }
            }

            // Helper to determine entity color based on constraint status
            const getEntityColor = (entityId: string): number => {
                const status = entityStatusMap.get(entityId);
                if (!status) {
                    // No status info, use yellow (under-constrained default)
                    return 0xffdd00;
                }
                if (status.is_over_constrained || status.involved_in_conflict) {
                    return 0xff4444; // Red for over-constrained/conflict
                }
                if (status.is_fully_constrained) {
                    return 0x44cc44; // Green for fully constrained
                }
                return 0xffdd00; // Yellow for under-constrained
            };

            // Group entities by their constraint status color
            const colorGroups: Map<number, { vertices: number[], idMap: string[] }> = new Map();

            props.clientSketch.entities.forEach((ent: any) => {
                if (ent.is_construction) return; // Handle separately
                const isSelected = props.selection && props.selection.includes(ent.id);
                const color = getEntityColor(ent.id);

                if (!colorGroups.has(color)) {
                    colorGroups.set(color, { vertices: [], idMap: [] });
                }
                const group = colorGroups.get(color)!;

                // Count segments this entity will produce
                let segmentsAdded = 0;

                const addSegmentToGroup = (p1x: number, p1y: number, p2x: number, p2y: number) => {
                    const start = toWorld(p1x, p1y);
                    const end = toWorld(p2x, p2y);

                    if (isSelected) {
                        selectedVertices.push(start.x, start.y, start.z);
                        selectedVertices.push(end.x, end.y, end.z);
                    }

                    group.vertices.push(start.x, start.y, start.z);
                    group.vertices.push(end.x, end.y, end.z);
                    segmentsAdded++;
                };

                if (ent.geometry && ent.geometry.Line) {
                    const { start, end } = ent.geometry.Line;
                    addSegmentToGroup(start[0], start[1], end[0], end[1]);
                } else if (ent.geometry && ent.geometry.Circle) {
                    const { center, radius } = ent.geometry.Circle;
                    const segments = 64;
                    let prevX = center[0] + radius;
                    let prevY = center[1];
                    for (let i = 1; i <= segments; i++) {
                        const angle = (i / segments) * 2 * Math.PI;
                        const x = center[0] + radius * Math.cos(angle);
                        const y = center[1] + radius * Math.sin(angle);
                        addSegmentToGroup(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                } else if (ent.geometry && ent.geometry.Arc) {
                    const { center, radius, start_angle, end_angle } = ent.geometry.Arc;
                    const segments = 64;
                    let sweep = end_angle - start_angle;
                    if (sweep < 0) sweep += 2 * Math.PI;
                    let prevX = center[0] + radius * Math.cos(start_angle);
                    let prevY = center[1] + radius * Math.sin(start_angle);
                    for (let i = 1; i <= segments; i++) {
                        const t = i / segments;
                        const angle = start_angle + sweep * t;
                        const x = center[0] + radius * Math.cos(angle);
                        const y = center[1] + radius * Math.sin(angle);
                        addSegmentToGroup(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                } else if (ent.geometry && ent.geometry.Point) {
                    // Render point as a small cross
                    const { pos } = ent.geometry.Point;
                    const size = 0.3;
                    addSegmentToGroup(pos[0] - size, pos[1], pos[0] + size, pos[1]);
                    addSegmentToGroup(pos[0], pos[1] - size, pos[0], pos[1] + size);
                } else if (ent.geometry && ent.geometry.Ellipse) {
                    const { center, semi_major, semi_minor, rotation } = ent.geometry.Ellipse;
                    const segments = 64;
                    const cos_r = Math.cos(rotation);
                    const sin_r = Math.sin(rotation);

                    const ellipsePoint = (t: number): [number, number] => {
                        const x_local = semi_major * Math.cos(t);
                        const y_local = semi_minor * Math.sin(t);
                        return [
                            center[0] + x_local * cos_r - y_local * sin_r,
                            center[1] + x_local * sin_r + y_local * cos_r
                        ];
                    };

                    let [prevX, prevY] = ellipsePoint(0);
                    for (let i = 1; i <= segments; i++) {
                        const t = (i / segments) * 2 * Math.PI;
                        const [x, y] = ellipsePoint(t);
                        addSegmentToGroup(prevX, prevY, x, y);
                        prevX = x;
                        prevY = y;
                    }
                }

                // Add to idMap for raycasting
                for (let i = 0; i < segmentsAdded; i++) {
                    group.idMap.push(ent.id);
                }
            });

            // Render each color group as a separate mesh
            const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);
            const allIdMaps: string[] = [];
            const allVertices: number[] = [];

            colorGroups.forEach((group, color) => {
                if (group.vertices.length === 0) return;

                const geo = new LineSegmentsGeometry();
                geo.setPositions(group.vertices);

                const mat = new LineMaterial({
                    color: color,
                    linewidth: 3,
                    resolution: resolution,
                    depthTest: false
                });

                const mesh = new LineSegments2(geo, mat);
                mesh.name = `${SKETCH_PREVIEW_NAME}_${color.toString(16)}`;
                mesh.renderOrder = 9999;
                mesh.computeLineDistances();
                mesh.userData = { idMap: group.idMap };
                scene.add(mesh);

                // Accumulate for combined hitbox
                allVertices.push(...group.vertices);
                allIdMaps.push(...group.idMap);
            });

            // Create Hitbox Mesh (Fat LineSegments2 for robust Raycasting) - using combined data
            if (allVertices.length > 0) {
                const hitboxGeo = new LineSegmentsGeometry();
                hitboxGeo.setPositions(allVertices);

                const hitboxMat = new LineMaterial({
                    color: 0xff0000,
                    linewidth: 20,
                    resolution: resolution,
                    visible: true,
                    transparent: true,
                    opacity: 0,
                    depthWrite: false,
                    depthTest: false
                });

                const hitboxMesh = new LineSegments2(hitboxGeo, hitboxMat);
                hitboxMesh.name = "client_sketch_hitbox";
                hitboxMesh.renderOrder = 0;
                hitboxMesh.computeLineDistances();
                hitboxMesh.userData = { idMap: allIdMaps };
                scene.add(hitboxMesh);
            }

            // Render Selection Highlight Mesh (Overlay)
            if (selectedVertices.length > 0) {
                const geo = new LineSegmentsGeometry();
                geo.setPositions(selectedVertices);

                const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);

                const mat = new LineMaterial({
                    color: 0xffa500, // Orange Highlight
                    linewidth: 4, // Slightly thicker than base (3)
                    resolution: resolution,
                    depthTest: false // Always on top
                });

                const mesh = new LineSegments2(geo, mat);
                mesh.name = "sketch_selection_highlight";
                mesh.renderOrder = 10000; // Above base (9999)
                mesh.computeLineDistances();
                scene.add(mesh);
            }

            // Render Render Defining Points (Endpoints, Corners, Centers)
            const definingPoints: number[] = [];
            props.clientSketch.entities.forEach((ent: any) => {
                if (ent.is_construction) return; // Don't show points for construction lines by default? Plan says "active sketch entities". Typically construction points are less critical but maybe still useful. Plan doesn't exclude them explicitly, but "Sketch entities... slightly thicker". Points should probably be for all.
                // Let's include them for all entities to be safe and consistent, or restrict to non-construction if clutter is high.
                // Re-reading Plan: "Display of defining points... visible when the sketch is active".
                // I will include construction points too, but maybe smaller? No, keep simple first.

                if (ent.geometry && ent.geometry.Line) {
                    const { start, end } = ent.geometry.Line;
                    const p1 = toWorld(start[0], start[1]);
                    const p2 = toWorld(end[0], end[1]);
                    definingPoints.push(p1.x, p1.y, p1.z);
                    definingPoints.push(p2.x, p2.y, p2.z);
                } else if (ent.geometry && ent.geometry.Circle) {
                    const { center } = ent.geometry.Circle;
                    const p = toWorld(center[0], center[1]);
                    definingPoints.push(p.x, p.y, p.z);
                } else if (ent.geometry && ent.geometry.Arc) {
                    const { center, radius, start_angle, end_angle } = ent.geometry.Arc;
                    const c = toWorld(center[0], center[1]);

                    const startX = center[0] + radius * Math.cos(start_angle);
                    const startY = center[1] + radius * Math.sin(start_angle);
                    const s = toWorld(startX, startY);

                    const endX = center[0] + radius * Math.cos(end_angle);
                    const endY = center[1] + radius * Math.sin(end_angle);
                    const e = toWorld(endX, endY);

                    definingPoints.push(c.x, c.y, c.z);
                    definingPoints.push(s.x, s.y, s.z);
                    definingPoints.push(e.x, e.y, e.z);
                } else if (ent.geometry && ent.geometry.Point) {
                    // Point entity - add the point position as a defining point
                    const { pos } = ent.geometry.Point;
                    const p = toWorld(pos[0], pos[1]);
                    definingPoints.push(p.x, p.y, p.z);
                }
                // TODO: Rectangles are typically just Lines in entities list? 
                // If they are separate constructs, we handle them. 
                // But typically they degrade to lines. If "Rectangle" entity type existed, we'd handle it.
                // Based on types.ts, we only have Line, Circle, Arc, Point.
            });

            if (definingPoints.length > 0) {
                const pGeo = new THREE.BufferGeometry();
                pGeo.setAttribute('position', new THREE.Float32BufferAttribute(definingPoints, 3));
                const pMat = new THREE.PointsMaterial({
                    color: 0xffffff,
                    size: 6,
                    sizeAttenuation: false,
                    depthTest: false
                });
                const pMesh = new THREE.Points(pGeo, pMat);
                pMesh.name = "sketch_defining_points"; // Unique name to clean up?
                // Need to clean this up too in the loop start
                pMesh.renderOrder = 10000;
                scene.add(pMesh);
            }

            // Render Construction Mesh
            if (constructionVertices.length > 0) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(constructionVertices, 3));
                geo.setIndex(constructionIndices);
                const mat = new THREE.LineDashedMaterial({
                    color: 0xaaaaaa, // Grey for construction
                    linewidth: 1,
                    scale: 1,
                    dashSize: 0.1,
                    gapSize: 0.05,
                    depthTest: false
                });
                const mesh = new THREE.LineSegments(geo, mat); // Use Standard LineSegments for Construction (Dashed)

                // Construction ID Map
                const constIdMap: string[] = [];
                props.clientSketch.entities.forEach((ent: any) => {
                    if (!ent.is_construction) return;

                    let segmentsAdded = 0;
                    if (ent.geometry && ent.geometry.Line) {
                        segmentsAdded = 1;
                    } else if (ent.geometry && ent.geometry.Circle) {
                        segmentsAdded = 64;
                    } else if (ent.geometry && ent.geometry.Arc) {
                        segmentsAdded = 64;
                    } else if (ent.geometry && ent.geometry.Point) {
                        segmentsAdded = 2; // Cross marker has 2 segments
                    }

                    for (let i = 0; i < segmentsAdded; i++) {
                        constIdMap.push(ent.id);
                    }
                });

                mesh.userData = { idMap: constIdMap };
                mesh.name = CONSTRUCTION_PREVIEW_NAME;
                mesh.computeLineDistances(); // Required for DashedMaterial
                mesh.renderOrder = 9999;
                scene.add(mesh);
            }

            // Render Preview Geometry (Offset Tool, etc)
            if (props.previewGeometry && props.previewGeometry.length > 0) {
                const previewVertices: number[] = [];
                const previewIndices: number[] = [];
                let pVIdx = 0;

                props.previewGeometry.forEach((ent: any) => {
                    const addSeg = (p1x: number, p1y: number, p2x: number, p2y: number) => {
                        const start = toWorld(p1x, p1y);
                        const end = toWorld(p2x, p2y);
                        previewVertices.push(start.x, start.y, start.z);
                        previewVertices.push(end.x, end.y, end.z);
                        previewIndices.push(pVIdx, pVIdx + 1);
                        pVIdx += 2;
                    };

                    if (ent.geometry.Line) {
                        const { start, end } = ent.geometry.Line;
                        addSeg(start[0], start[1], end[0], end[1]);
                    } else if (ent.geometry.Circle) {
                        const { center, radius } = ent.geometry.Circle;
                        const segments = 64;
                        let prevX = center[0] + radius;
                        let prevY = center[1];
                        for (let i = 1; i <= segments; i++) {
                            const angle = (i / segments) * 2 * Math.PI;
                            const x = center[0] + radius * Math.cos(angle);
                            const y = center[1] + radius * Math.sin(angle);
                            addSeg(prevX, prevY, x, y);
                            prevX = x;
                            prevY = y;
                        }
                    } else if (ent.geometry.Arc) {
                        const { center, radius, start_angle, end_angle } = ent.geometry.Arc;
                        const segments = 64;
                        let sweep = end_angle - start_angle;
                        if (sweep < 0) sweep += 2 * Math.PI;
                        let prevX = center[0] + radius * Math.cos(start_angle);
                        let prevY = center[1] + radius * Math.sin(start_angle);
                        for (let i = 1; i <= segments; i++) {
                            const t = i / segments;
                            const angle = start_angle + sweep * t;
                            const x = center[0] + radius * Math.cos(angle);
                            const y = center[1] + radius * Math.sin(angle);
                            addSeg(prevX, prevY, x, y);
                            prevX = x;
                            prevY = y;
                        }
                    }
                    // Point not needed for preview usually
                });

                if (previewVertices.length > 0) {
                    const geo = new LineSegmentsGeometry();
                    geo.setPositions(previewVertices);

                    const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);
                    const mat = new LineMaterial({
                        color: 0x00aaff, // Blue preview
                        linewidth: 2,
                        resolution: resolution,
                        dashed: true,
                        dashScale: 1,
                        dashSize: 2,
                        gapSize: 1,
                        opacity: 0.8,
                        transparent: true,
                        depthTest: false
                    });

                    const mesh = new LineSegments2(geo, mat);
                    mesh.name = "client_sketch_preview_offset";
                    mesh.computeLineDistances();
                    mesh.renderOrder = 10001;
                    scene.add(mesh);
                }
            }

            // ===== CONSTRAINT INDICATORS =====
            // Cleanup handled at start of effect
            const indicatorGroup = new THREE.Group();
            indicatorGroup.name = CONSTRAINT_INDICATOR_NAME;
            scene.add(indicatorGroup);

            // Apply Sketch Plane Transform to the Group
            // This ensures all 2D coordinates (X, Y, 0) inside determining positions
            // are automatically transformed to the 3D sketch plane.
            if (props.clientSketch.plane) {
                const plane = props.clientSketch.plane;
                const origin = new THREE.Vector3().fromArray(plane.origin);
                const xAxis = new THREE.Vector3().fromArray(plane.x_axis);
                const yAxis = new THREE.Vector3().fromArray(plane.y_axis);
                const zAxis = new THREE.Vector3().fromArray(plane.normal);

                const matrix = new THREE.Matrix4();
                matrix.makeBasis(xAxis, yAxis, zAxis);
                matrix.setPosition(origin);

                indicatorGroup.matrixAutoUpdate = false;
                indicatorGroup.matrix.copy(matrix);
            }

            // Helper: Get entity by ID
            const getEntity = (id: string) => props.clientSketch.entities.find((e: any) => e.id === id);

            // Helper: Get point position from constraint point
            const getPointPos = (cp: { id: string, index: number }): [number, number] | null => {
                if (cp.id === "00000000-0000-0000-0000-000000000000") return [0, 0];

                const entity = getEntity(cp.id);
                if (!entity) return null;

                if (entity.geometry.Line) {
                    return cp.index === 0 ? entity.geometry.Line.start : entity.geometry.Line.end;
                } else if (entity.geometry.Circle) {
                    return entity.geometry.Circle.center;
                } else if (entity.geometry.Arc) {
                    const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
                    if (cp.index === 0) return center;
                    const angle = cp.index === 1 ? start_angle : end_angle;
                    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
                }
                return null;
            };

            // Helper: Get line midpoint
            const getLineMidpoint = (id: string): [number, number] | null => {
                const entity = getEntity(id);
                if (!entity || !entity.geometry.Line) return null;
                const { start, end } = entity.geometry.Line;
                return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
            };

            // Helper: Get line geometry by ID
            const getLineById = (id: string): { start: [number, number], end: [number, number] } | null => {
                const entity = getEntity(id);
                if (!entity || !entity.geometry.Line) return null;
                return entity.geometry.Line;
            };

            // Helper: Create text sprite (supports longer text like dimension values)
            const createTextSprite = (text: string, color: string, size: number): THREE.Sprite => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;

                // Dynamic canvas size based on text length
                const fontSize = 32;
                ctx.font = `bold ${fontSize}px Arial`;
                const textWidth = ctx.measureText(text).width;
                canvas.width = Math.max(128, Math.ceil(textWidth + 20));
                canvas.height = 48;

                // Re-set font after canvas resize
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);

                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    depthTest: false,
                    sizeAttenuation: true // Scale with scene depth (default behavior)
                    // Actually, if we want it to scale with scene, sizeAttenuation should be true (default).
                    // But previous code had it false? Let's check view_file.
                    // Previous code: sizeAttenuation: false. Keep as is for now to avoid behavior change.
                });
                const sprite = new THREE.Sprite(spriteMat);
                // Scale proportionally to keep aspect ratio
                const aspect = canvas.width / canvas.height;
                sprite.scale.set(size * aspect, size, 1);
                sprite.renderOrder = 10000;
                return sprite;
            };

            // Helper: Create coincident marker (small sphere)
            const createCoincidentMarker = (x: number, y: number): THREE.Mesh => {
                const geo = new THREE.CircleGeometry(0.15, 16);
                const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(x, y, 0.01);
                mesh.renderOrder = 10000;
                return mesh;
            };

            // Process constraints
            if (props.clientSketch.constraints) {
                props.clientSketch.constraints.forEach((entry: any, index: number) => {
                    // Unwrap SketchConstraintEntry to get the actual constraint
                    const constraint = entry.constraint || entry;
                    if (constraint.Horizontal) {
                        const mid = getLineMidpoint(constraint.Horizontal.entity);
                        if (mid) {
                            const sprite = createTextSprite("H", "#00aaff", 0.8);
                            sprite.position.set(mid[0] + 0.5, mid[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                    } else if (constraint.Vertical) {
                        const mid = getLineMidpoint(constraint.Vertical.entity);
                        if (mid) {
                            const sprite = createTextSprite("V", "#00aaff", 0.8);
                            sprite.position.set(mid[0] + 0.5, mid[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                    } else if (constraint.Coincident) {
                        const p1 = getPointPos(constraint.Coincident.points[0]);
                        const p2 = getPointPos(constraint.Coincident.points[1]);
                        if (p1 && p2) {
                            // Place marker at average position (they should be the same when solved)
                            const cx = (p1[0] + p2[0]) / 2;
                            const cy = (p1[1] + p2[1]) / 2;
                            indicatorGroup.add(createCoincidentMarker(cx, cy));
                        }
                    } else if (constraint.Parallel) {
                        const mid1 = getLineMidpoint(constraint.Parallel.lines[0]);
                        const mid2 = getLineMidpoint(constraint.Parallel.lines[1]);
                        if (mid1) {
                            const sprite = createTextSprite("||", "#ffaa00", 0.8);
                            sprite.position.set(mid1[0] + 0.5, mid1[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                        if (mid2) {
                            const sprite = createTextSprite("||", "#ffaa00", 0.8);
                            sprite.position.set(mid2[0] + 0.5, mid2[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                    } else if (constraint.Perpendicular) {
                        const mid1 = getLineMidpoint(constraint.Perpendicular.lines[0]);
                        if (mid1) {
                            const sprite = createTextSprite("⊥", "#ff8800", 0.8);
                            sprite.position.set(mid1[0] + 0.5, mid1[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                    } else if (constraint.Equal) {
                        const mid1 = getLineMidpoint(constraint.Equal.entities[0]);
                        const mid2 = getLineMidpoint(constraint.Equal.entities[1]);
                        if (mid1) {
                            const sprite = createTextSprite("=", "#88ff00", 0.8);
                            sprite.position.set(mid1[0] + 0.5, mid1[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                        if (mid2) {
                            const sprite = createTextSprite("=", "#88ff00", 0.8);
                            sprite.position.set(mid2[0] + 0.5, mid2[1] + 0.3, 0.01);
                            indicatorGroup.add(sprite);
                        }
                    } else if (constraint.Distance && constraint.Distance.style) {
                        // Dimension with visual annotation
                        const cp1 = constraint.Distance.points[0];
                        const cp2 = constraint.Distance.points[1];
                        const p1 = getPointPos(cp1);
                        const p2 = getPointPos(cp2);

                        if (p1 && p2) {
                            const dimStyle = constraint.Distance.style;
                            const value = constraint.Distance.value;

                            // Default: Point-to-Point Axis
                            let dx = p2[0] - p1[0];
                            let dy = p2[1] - p1[1];
                            let len = Math.sqrt(dx * dx + dy * dy);

                            // Check for Line Alignment overrides
                            // Check if EITHER point belongs to a Line entity
                            const entity1 = getEntity(cp1.id);
                            const entity2 = getEntity(cp2.id);

                            let alignLine: { start: [number, number], end: [number, number] } | null = null;

                            if (entity1 && entity1.geometry.Line) alignLine = entity1.geometry.Line;
                            else if (entity2 && entity2.geometry.Line) alignLine = entity2.geometry.Line;

                            if (alignLine) {
                                const l = alignLine;
                                const ldx = l.end[0] - l.start[0];
                                const ldy = l.end[1] - l.start[1];
                                const lLen = Math.sqrt(ldx * ldx + ldy * ldy);
                                if (lLen > 0.001) {
                                    // Use PERPENDICULAR to line direction
                                    const ux = ldx / lLen;
                                    const uy = ldy / lLen;

                                    dx = -uy;
                                    dy = ux;

                                    len = 1.0;

                                    // Ensure we point toward other point
                                    const pdx = p2[0] - p1[0];
                                    const pdy = p2[1] - p1[1];
                                    if (pdx * dx + pdy * dy < 0) {
                                        dx = -dx;
                                        dy = -dy;
                                    }
                                }
                            }

                            if (len < 0.001) return;

                            // Normalize axis
                            const nx = dx / len;
                            const ny = dy / len;

                            // Perpendicular vector for offset (dimension height direction)
                            const px = -ny;
                            const py = nx;

                            const offsetDist = 1.0 + dimStyle.offset[1];

                            // Calculate dimension corners by projecting p1/p2 onto the parallel offset line
                            // Center of dimension line is "average of projected points" + offset
                            // Actually, mostly we just want to project p1 and p2 onto the axis defined by Normal

                            // Extension Vector is P (perpendicular) * offsetDist
                            const evX = px * offsetDist;
                            const evY = py * offsetDist;

                            // Projected points on the dimension line
                            // We assume p1 is origin for projection relative
                            // dimP1 = p1 + ev
                            // dimP2 = p2 projected onto line through dimP1 with direction N

                            // Wait, standard aligned dimension:
                            // Extension lines extend from p1 and p2 in direction P.
                            // Dimension line is drawn at distance `offsetDist` in direction P.
                            // Intersection of Extension lines and Dimension Line defines endpoints.

                            const dStart = [p1[0] + evX, p1[1] + evY, 0.01] as const;

                            // For dEnd, we project p2 onto the line defined by dStart + t*N
                            // Vector from dStart to p2
                            const v2x = p2[0] - dStart[0];
                            const v2y = p2[1] - dStart[1];
                            // Project v2 onto N
                            const dot = v2x * nx + v2y * ny;
                            const dEnd = [dStart[0] + nx * dot, dStart[1] + ny * dot, 0.01] as const;

                            // Line color: cyan for driving, gray for driven
                            const dimColor = dimStyle.driven ? 0x888888 : 0x00dddd;
                            const dimMat = new THREE.LineBasicMaterial({ color: dimColor, depthTest: false });

                            // Extension lines
                            // From p1 to dStart
                            const extGeo1 = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(p1[0], p1[1], 0.01),
                                new THREE.Vector3(...dStart)
                            ]);
                            const extLine1 = new THREE.Line(extGeo1, dimMat);
                            extLine1.renderOrder = 10000;
                            indicatorGroup.add(extLine1);

                            // From p2 to dEnd
                            const extGeo2 = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(p2[0], p2[1], 0.01),
                                new THREE.Vector3(...dEnd)
                            ]);
                            const extLine2 = new THREE.Line(extGeo2, dimMat);
                            extLine2.renderOrder = 10000;
                            indicatorGroup.add(extLine2);

                            // Dimension line
                            const dimGeo = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(...dStart),
                                new THREE.Vector3(...dEnd)
                            ]);
                            const dimLine = new THREE.Line(dimGeo, dimMat);
                            dimLine.renderOrder = 10000;
                            indicatorGroup.add(dimLine);

                            // Value text at midpoint of dimension line
                            const midX = (dStart[0] + dEnd[0]) / 2;
                            const midY = (dStart[1] + dEnd[1]) / 2;
                            const valueText = value.toFixed(2);
                            const textColor = dimStyle.driven ? "#888888" : "#00dddd";
                            const textSprite = createTextSprite(valueText, textColor, 1.0);
                            textSprite.position.set(midX, midY, 0.02);
                            indicatorGroup.add(textSprite);

                            // Add hitbox rectangle to visualize click detection area
                            const textStr = value.toFixed(2);
                            const textWidth = textStr.length * 0.12;
                            const textHeight = 0.3;

                            // HITBOX CORRECTNESS: Use Sprite instead of Mesh so it rotates with camera
                            const hitboxMat = new THREE.SpriteMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.0 });
                            const hitboxLine = new THREE.Sprite(hitboxMat);
                            hitboxLine.position.set(midX, midY, 0);
                            hitboxLine.scale.set(textWidth * 2, textHeight * 2, 1);
                            hitboxLine.renderOrder = 9999;
                            hitboxLine.userData = {
                                isDimensionHitbox: true,
                                index: index,
                                type: "Distance",
                                dirX: nx, // Store normalized axis
                                dirY: ny,
                            };
                            indicatorGroup.add(hitboxLine);
                        }
                    } else if (constraint.Angle && constraint.Angle.style) {
                        // Angular dimension with arc visualization
                        const line1 = getLineById(constraint.Angle.lines[0]);
                        const line2 = getLineById(constraint.Angle.lines[1]);

                        if (line1 && line2) {
                            const dimStyle = constraint.Angle.style;
                            const angleRad = constraint.Angle.value;
                            const angleDeg = angleRad * 180 / Math.PI;

                            // Calculate line-line intersection
                            const x1 = line1.start[0], y1 = line1.start[1];
                            const x2 = line1.end[0], y2 = line1.end[1];
                            const x3 = line2.start[0], y3 = line2.start[1];
                            const x4 = line2.end[0], y4 = line2.end[1];

                            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
                            let center: [number, number];

                            if (Math.abs(denom) > 0.0001) {
                                // Lines intersect - calculate intersection point
                                const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
                                center = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
                            } else {
                                // Parallel lines - use midpoint of closest endpoints
                                center = [(x2 + x3) / 2, (y2 + y3) / 2];
                            }

                            // Create arc to show angle
                            // Radius depends on offset[1]
                            const baseRadius = 1.5;
                            const radiusOffset = dimStyle.offset[1] || 0;
                            const arcRadius = Math.max(0.5, baseRadius + radiusOffset);
                            const dimColor = dimStyle.driven ? 0x888888 : 0xff8800;

                            // Get direction angles for the two lines (from intersection point)
                            // Determine correct direction vectors by checking which endpoint is further from intersection
                            const dStart1 = (x1 - center[0]) ** 2 + (y1 - center[1]) ** 2;
                            const dEnd1 = (x2 - center[0]) ** 2 + (y2 - center[1]) ** 2;
                            let dx1, dy1;
                            if (dEnd1 > dStart1) {
                                dx1 = x2 - center[0];
                                dy1 = y2 - center[1];
                            } else {
                                dx1 = x1 - center[0];
                                dy1 = y1 - center[1];
                            }

                            const dStart2 = (x3 - center[0]) ** 2 + (y3 - center[1]) ** 2;
                            const dEnd2 = (x4 - center[0]) ** 2 + (y4 - center[1]) ** 2;
                            let dx2, dy2;
                            if (dEnd2 > dStart2) {
                                dx2 = x4 - center[0];
                                dy2 = y4 - center[1];
                            } else {
                                dx2 = x3 - center[0];
                                dy2 = y3 - center[1];
                            }

                            const angle1 = Math.atan2(dy1, dx1);
                            const angle2 = Math.atan2(dy2, dx2);

                            // Draw arc between the two angles (shorter arc)
                            let startAngle = angle1;
                            let endAngle = angle2;

                            // Ensure we draw the smaller angle
                            let diff = endAngle - startAngle;
                            while (diff > Math.PI) diff -= 2 * Math.PI;
                            while (diff < -Math.PI) diff += 2 * Math.PI;
                            endAngle = startAngle + diff;

                            // Calculate arc endpoint positions (where arc touches)
                            const arcStart: [number, number] = [
                                center[0] + arcRadius * Math.cos(startAngle),
                                center[1] + arcRadius * Math.sin(startAngle)
                            ];
                            const arcEnd: [number, number] = [
                                center[0] + arcRadius * Math.cos(endAngle),
                                center[1] + arcRadius * Math.sin(endAngle)
                            ];

                            // Draw leader lines from intersection to arc endpoints
                            const leaderMat = new THREE.LineBasicMaterial({ color: dimColor, depthTest: false });

                            // Leader line 1: from intersection toward line1 endpoint
                            const leader1Geo = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(center[0], center[1], 0.01),
                                new THREE.Vector3(arcStart[0], arcStart[1], 0.01)
                            ]);
                            const leader1 = new THREE.Line(leader1Geo, leaderMat);
                            leader1.renderOrder = 10000;
                            indicatorGroup.add(leader1);

                            // Leader line 2: from intersection toward line2 endpoint
                            const leader2Geo = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(center[0], center[1], 0.01),
                                new THREE.Vector3(arcEnd[0], arcEnd[1], 0.01)
                            ]);
                            const leader2 = new THREE.Line(leader2Geo, leaderMat);
                            leader2.renderOrder = 10000;
                            indicatorGroup.add(leader2);

                            // Create arc curve
                            const arcCurve = new THREE.EllipseCurve(
                                center[0], center[1],
                                arcRadius, arcRadius,
                                startAngle, endAngle,
                                diff < 0, 0
                            );
                            const arcPoints = arcCurve.getPoints(24);
                            const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
                            const arcMat = new THREE.LineBasicMaterial({ color: dimColor, depthTest: false });
                            const arcLine = new THREE.Line(arcGeo, arcMat);
                            arcLine.renderOrder = 10000;
                            indicatorGroup.add(arcLine);

                            // Value text at arc midpoint
                            const textAngle = startAngle + diff / 2;
                            const textX = center[0] + arcRadius * 1.5 * Math.cos(textAngle);
                            const textY = center[1] + arcRadius * 1.5 * Math.sin(textAngle);
                            const valueText = angleDeg.toFixed(1) + "°";
                            const textColor = dimStyle.driven ? "#888888" : "#ff8800";
                            const textSprite = createTextSprite(valueText, textColor, 1.2);
                            textSprite.position.set(textX, textY, 0.02);
                            indicatorGroup.add(textSprite);

                            // Add hitbox rectangle for Angle dimension
                            const textStr = angleDeg.toFixed(1) + "°";
                            const textWidth = textStr.length * 0.12;
                            const textHeight = 0.3;

                            // HITBOX CORRECTNESS: Use Sprite
                            const hitboxMat = new THREE.SpriteMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.0 });
                            const hitboxLine = new THREE.Sprite(hitboxMat);
                            hitboxLine.position.set(textX, textY, 0);
                            hitboxLine.scale.set(textWidth * 2, textHeight * 2, 1);
                            hitboxLine.renderOrder = 9999;
                            hitboxLine.userData = {
                                isDimensionHitbox: true,
                                index: index,
                                type: "Angle",
                                center: center,
                            };
                            indicatorGroup.add(hitboxLine);
                        }
                    } else if (constraint.Radius && constraint.Radius.style) {
                        // Radius dimension rendering
                        const entityId = constraint.Radius.entity;
                        const entity = getEntity(entityId);

                        if (entity && (entity.geometry.Circle || entity.geometry.Arc)) {
                            const dimStyle = constraint.Radius.style;
                            const value = constraint.Radius.value;

                            let center: [number, number];
                            let radius: number;

                            if (entity.geometry.Circle) {
                                center = entity.geometry.Circle.center;
                                radius = entity.geometry.Circle.radius;
                            } else {
                                center = entity.geometry.Arc.center;
                                radius = entity.geometry.Arc.radius;
                            }

                            // Use offset[1] as the angle for the leader line
                            // Default to 45 degrees if not set
                            const angle = dimStyle.offset[1] || (Math.PI / 4);

                            const cos = Math.cos(angle);
                            const sin = Math.sin(angle);

                            // Leader end point (outside circle)
                            const extraLen = 1.0;
                            const leaderEnd: [number, number] = [
                                center[0] + (radius + extraLen) * cos,
                                center[1] + (radius + extraLen) * sin
                            ];

                            const dimColor = dimStyle.driven ? 0x888888 : 0x00dddd;
                            const dimMat = new THREE.LineBasicMaterial({ color: dimColor, depthTest: false });

                            // Draw line from center (or near center) to leader end
                            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(center[0], center[1], 0.01),
                                new THREE.Vector3(leaderEnd[0], leaderEnd[1], 0.01)
                            ]);
                            const lineMesh = new THREE.Line(lineGeo, dimMat);
                            lineMesh.renderOrder = 10000;
                            indicatorGroup.add(lineMesh);

                            // Text
                            const textPos = leaderEnd;
                            const valueText = "R " + value.toFixed(2);
                            const textColor = dimStyle.driven ? "#888888" : "#00dddd";
                            const textSprite = createTextSprite(valueText, textColor, 1.0);
                            textSprite.position.set(textPos[0], textPos[1] + 0.3, 0.02);
                            indicatorGroup.add(textSprite);

                            // Hitbox
                            const textStr = valueText;
                            const textWidth = textStr.length * 0.12;
                            const textHeight = 0.3;

                            // HITBOX CORRECTNESS: Use Sprite
                            const hitboxMat = new THREE.SpriteMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.0 });
                            const hitboxLine = new THREE.Sprite(hitboxMat);
                            hitboxLine.position.set(textPos[0], textPos[1] + 0.3, 0);
                            hitboxLine.scale.set(textWidth * 2, textHeight * 2, 1);
                            hitboxLine.renderOrder = 9999;
                            hitboxLine.userData = {
                                isDimensionHitbox: true,
                                index: index,
                                type: "Radius",
                                center: center,
                            };
                            indicatorGroup.add(hitboxLine);
                        }
                    }
                });
            }

            if (indicatorGroup.children.length > 0) {
                scene.add(indicatorGroup);
            }
        }
    });

    // ===== SNAP INDICATOR VISUALIZATION =====
    createEffect(() => {
        if (!ready() || !scene) return;

        const SNAP_INDICATOR_NAME = "snap_indicator";
        let existing = scene.getObjectByName(SNAP_INDICATOR_NAME);
        if (existing) {
            scene.remove(existing);
            existing.traverse((child) => {
                if ((child as any).geometry) (child as any).geometry.dispose();
                if ((child as any).material) (child as any).material.dispose();
            });
        }

        const snap = props.activeSnap;
        if (!snap) return;

        const group = new THREE.Group();
        group.name = SNAP_INDICATOR_NAME;

        // Create different indicators based on snap type
        const createSnapMarker = () => {
            const { snap_type, position } = snap;
            const [x, y] = position;

            switch (snap_type) {
                case "Endpoint": {
                    // Small square
                    const geo = new THREE.PlaneGeometry(0.3, 0.3);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(x, y, 0.02);
                    mesh.rotation.z = Math.PI / 4; // Diamond shape
                    mesh.renderOrder = 10001;
                    return mesh;
                }
                case "Midpoint": {
                    // Triangle
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0.2);
                    shape.lineTo(-0.15, -0.1);
                    shape.lineTo(0.15, -0.1);
                    shape.closePath();
                    const geo = new THREE.ShapeGeometry(shape);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(x, y, 0.02);
                    mesh.renderOrder = 10001;
                    return mesh;
                }
                case "Center": {
                    // Cross inside circle
                    const circleGeo = new THREE.RingGeometry(0.12, 0.18, 16);
                    const circleMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false, side: THREE.DoubleSide });
                    const circleMesh = new THREE.Mesh(circleGeo, circleMat);
                    circleMesh.position.set(x, y, 0.02);
                    circleMesh.renderOrder = 10001;
                    return circleMesh;
                }
                case "Intersection": {
                    // X mark
                    const crossGeo = new THREE.BufferGeometry();
                    const verts = new Float32Array([
                        -0.15, -0.15, 0, 0.15, 0.15, 0,
                        -0.15, 0.15, 0, 0.15, -0.15, 0
                    ]);
                    crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
                    crossGeo.setIndex([0, 1, 2, 3]);
                    const crossMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2, depthTest: false });
                    const crossMesh = new THREE.LineSegments(crossGeo, crossMat);
                    crossMesh.position.set(x, y, 0.02);
                    crossMesh.renderOrder = 10001;
                    return crossMesh;
                }
                case "Origin": {
                    // Coordinate cross
                    const crossGeo = new THREE.BufferGeometry();
                    const verts = new Float32Array([
                        -0.25, 0, 0, 0.25, 0, 0,
                        0, -0.25, 0, 0, 0.25, 0
                    ]);
                    crossGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
                    crossGeo.setIndex([0, 1, 2, 3]);
                    const crossMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2, depthTest: false });
                    const crossMesh = new THREE.LineSegments(crossGeo, crossMat);
                    crossMesh.position.set(x, y, 0.02);
                    crossMesh.renderOrder = 10001;
                    return crossMesh;
                }
                case "Grid": {
                    // Small dot
                    const dotGeo = new THREE.CircleGeometry(0.1, 8);
                    const dotMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, depthTest: false });
                    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
                    dotMesh.position.set(x, y, 0.02);
                    dotMesh.renderOrder = 10001;
                    return dotMesh;
                }
                default:
                    return null;
            }
        };

        const marker = createSnapMarker();
        if (marker) {
            group.add(marker);
            scene.add(group);
        }
    });



    // State must be outside effect to persist across sketch updates
    let isDragging = false;
    let dragIndex = -1;
    let dragType: "Distance" | "Angle" | "Radius" | null = null;
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
            const indicatorGroup = scene.getObjectByName(CONSTRAINT_INDICATOR_NAME);
            if (!indicatorGroup) return;

            const hits = raycaster.intersectObjects(indicatorGroup.children, false);

            for (const hit of hits) {
                if (hit.object.userData && hit.object.userData.isDimensionHitbox) {
                    // Start dragging
                    e.stopPropagation(); // Prevent orbit controls or other clicks
                    isDragging = true;
                    dragIndex = hit.object.userData.index;
                    dragType = hit.object.userData.type;
                    dragUserData = hit.object.userData;
                    dragStartPoint.copy(hit.point);
                    dragStartLocal = getLocalPos(hit.point); // Cache start in local space

                    const constraint = props.clientSketch.constraints[dragIndex];
                    if (dragType === "Distance" && constraint.Distance && constraint.Distance.style) {
                        startOffset = [...constraint.Distance.style.offset];
                    } else if (dragType === "Angle" && constraint.Angle && constraint.Angle.style) {
                        startOffset = [...constraint.Angle.style.offset];
                    } else if (dragType === "Radius" && constraint.Radius && constraint.Radius.style) {
                        startOffset = [...constraint.Radius.style.offset];
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
        if (!props.tessellation || !mainMesh) return;

        // Project mouse to world for preview
        const rect = containerRef!.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0.5);
        vec.unproject(camera);
        const dir = vec.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));

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

        if (props.previewDimension && props.previewDimension.selections.length > 0) {
            previewGroup = new THREE.Group();
            previewGroup.name = PREVIEW_DIMENSION_NAME;

            const selections = props.previewDimension.selections;

            // Simplified Helper to get positions
            const getPos = (c: any): [number, number] | null => {
                if (c.type === "origin") return [0, 0];
                if (c.type === "point") return c.position;
                if (c.type === "entity") {
                    const sk = props.clientSketch;
                    if (!sk) return null;
                    const ent = sk.entities.find((e: any) => e.id === c.id);
                    if (ent?.geometry.Line) return ent.geometry.Line.start; // Default to start
                    if (ent?.geometry.Circle) return ent.geometry.Circle.center;
                    if (ent?.geometry.Arc) return ent.geometry.Arc.center;
                }
                return null;
            };

            const type = props.previewDimension.type;

            if (type === "Distance" && selections.length >= 1) {
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
                    // Calculate vectors
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

                    // Constuct visual
                    // Base line p1-p2 (not drawn, but reference)
                    // Dimension line is parallel to base line, shifted by perp
                    // Extent lines go from p1,p2 to dimension line

                    const p1_ext = [p1[0] - ny * perp, p1[1] + nx * perp]; // shift by perp along normal (-ny, nx)
                    const p2_ext = [p2[0] - ny * perp, p2[1] + nx * perp];

                    const dimMat = new LineMaterial({ color: 0x00dddd, linewidth: 2, resolution: new THREE.Vector2(rect.width, rect.height) });

                    // Extension lines
                    const ext1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1[0], p1[1], 0), new THREE.Vector3(p1_ext[0], p1_ext[1], 0)]);
                    previewGroup.add(new THREE.Line(ext1, dimMat));
                    const ext2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p2[0], p2[1], 0), new THREE.Vector3(p2_ext[0], p2_ext[1], 0)]);
                    previewGroup.add(new THREE.Line(ext2, dimMat));

                    // Dimension line
                    const dimLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p1_ext[0], p1_ext[1], 0), new THREE.Vector3(p2_ext[0], p2_ext[1], 0)]);
                    previewGroup.add(new THREE.Line(dimLineGeo, dimMat));

                    // Text
                    const mid = [(p1_ext[0] + p2_ext[0]) / 2, (p1_ext[1] + p2_ext[1]) / 2];
                    const textSprite = createTextSprite(props.previewDimension.value.toFixed(2), "#00dddd", 1.0);
                    textSprite.position.set(mid[0], mid[1], 0.02);
                    previewGroup.add(textSprite);
                }
            } else if (type === "Radius" && selections.length === 1) {
                const center = getPos(selections[0]);
                if (center) {
                    const radius = props.previewDimension.value;





                    const dimMat = new LineMaterial({ color: 0x00dddd, linewidth: 2, resolution: new THREE.Vector2(rect.width, rect.height) });

                    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(center[0], center[1], 0), new THREE.Vector3(worldPos.x, worldPos.y, 0)]);
                    previewGroup.add(new THREE.Line(lineGeo, dimMat));

                    const textSprite = createTextSprite("R " + radius.toFixed(2), "#00dddd", 1.0);
                    textSprite.position.set(worldPos.x, worldPos.y, 0.02);
                    previewGroup.add(textSprite);
                }
            } else if (type === "Angle") {
                // Simplified angle preview 
                // TODO: fully implement
                const textSprite = createTextSprite("Angle " + (props.previewDimension.value * 180 / Math.PI).toFixed(1), "#00dddd", 1.0);
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
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.faceIndex !== undefined) {
                const hoveredId = props.tessellation!.triangle_ids[hit.faceIndex!];

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

        console.log("[Viewport] Selection update:", currentSelection.length, "items selected");

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
            console.log("[Viewport] Highlighting", edgeSegments.length / 6, "edge segments");
            // Create thick line for selected edges
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
            console.warn("[Viewport] No edge matches found! Selection:", edgeSelections[0], "First line_id:", data.line_ids?.[0]);
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
                props.onCanvasClick("move", target);
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
