import * as THREE from 'three';
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import type { Sketch, SolveResult } from '../types';
import { sketchToWorld } from '../utils/sketchGeometry';
import { createPointMarkerTexture } from '../utils/threeHelpers';

export class SketchRenderer {
    private scene: THREE.Scene;
    private meshGroup: THREE.Group;

    // Meshes
    private solidLines: LineSegments2 | null = null;
    private constructionLines: LineSegments2 | null = null;
    private points: THREE.Points | null = null;
    private selectedLines: LineSegments2 | null = null;

    // Materials
    private solidMat: LineMaterial;
    private constructionMat: LineMaterial;
    private selectedMat: LineMaterial;
    private pointMat: THREE.PointsMaterial;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.meshGroup = new THREE.Group();
        this.meshGroup.name = "sketch_renderer_group";
        this.scene.add(this.meshGroup);

        const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);

        // Initialize reusable materials
        this.solidMat = new LineMaterial({
            color: 0xffffff,
            linewidth: 2, // slightly thicker for better visibility
            resolution,
            dashed: false,
            depthTest: false, // Always render on top of grid/axes
        });

        this.constructionMat = new LineMaterial({
            color: 0x888888,
            linewidth: 1,
            resolution,
            dashed: true,
            dashScale: 20, // Adjust based on world scale
            dashSize: 3,
            gapSize: 2,
            depthTest: false,
        });

        this.selectedMat = new LineMaterial({
            color: 0x00aaff, // Bright blue for selection
            linewidth: 4,
            resolution,
            depthTest: false,
        });

        // Circular orange points with plus sign
        const pointTexture = createPointMarkerTexture('#ffaa00', 128);
        this.pointMat = new THREE.PointsMaterial({
            map: pointTexture,
            size: 24,
            sizeAttenuation: false,
            depthTest: false,
            transparent: true,
            alphaTest: 0.1,
        });
    }

    public updateResolution(width: number, height: number) {
        const resolution = new THREE.Vector2(width, height);
        this.solidMat.resolution = resolution;
        this.constructionMat.resolution = resolution;
        this.selectedMat.resolution = resolution;
    }

    public update(
        sketch: Sketch | null,
        selection: any[] = [],
        _solveResult?: SolveResult | null
    ) {
        // Clear existing geometry
        this.clear();

        if (!sketch) return;

        const solidVertices: number[] = [];
        const constructionVertices: number[] = [];
        const selectedVertices: number[] = []; // For separate selection highlight pass
        const pointVertices: number[] = [];

        // Helper to check selection
        const isSelected = (entityId: string, type: 'entity' | 'point' = 'entity'): boolean => {
            return selection.some((s: any) => {
                if (typeof s === 'string') return s === entityId;
                if (typeof s === 'object' && s.id === entityId) {
                    if (type === 'point') return s.type === 'point'; // Point entities are 'point' type?
                    // Logic from Viewport.tsx:
                    // if s.type !== 'point' it selects the whole entity.
                    return s.type !== 'point';
                }
                return false;
            });
        };

        sketch.entities.forEach(ent => {
            // Helper to transform points
            const toVec = (p: [number, number]) => sketchToWorld(p[0], p[1], sketch.plane);

            const isConst = ent.is_construction;
            const selected = isSelected(ent.id);

            // Lines
            if (ent.geometry.Line) {
                const { start, end } = ent.geometry.Line;
                const v1 = toVec(start);
                const v2 = toVec(end);

                // Add to appropriate buffer
                if (isConst) {
                    constructionVertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                } else {
                    solidVertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                }

                if (selected) {
                    selectedVertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
                }

                // Add endpoints to point buffer
                pointVertices.push(v1.x, v1.y, v1.z);
                pointVertices.push(v2.x, v2.y, v2.z);
            }

            // Circles
            if (ent.geometry.Circle) {
                const { center, radius } = ent.geometry.Circle;
                const segments = 64;
                const centerVec = toVec(center);

                // We need to generate line segments for the circle
                // We need TWO perpendicular vectors on the plane.
                // sketchToWorld handles 2D -> 3D transform.
                // We can generate points in 2D then transform.

                let prevP = toVec([center[0] + radius, center[1]]);

                for (let i = 1; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    const x = center[0] + Math.cos(angle) * radius;
                    const y = center[1] + Math.sin(angle) * radius;
                    const currP = toVec([x, y]);

                    if (isConst) {
                        constructionVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    } else {
                        solidVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    }

                    if (selected) {
                        selectedVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    }

                    prevP = currP;
                }

                // Add center point
                pointVertices.push(centerVec.x, centerVec.y, centerVec.z);
            }

            // Arcs
            if (ent.geometry.Arc) {
                const { center, radius, start_angle, end_angle } = ent.geometry.Arc;
                const segments = 32;

                // Calculate step size based on angle difference
                let _diff = end_angle - start_angle;
                // Normalize to positive
                // if (diff < 0) diff += Math.PI * 2; // Arcs usually ccw from start??

                // Just use simple lerp
                const startX = center[0] + Math.cos(start_angle) * radius;
                const startY = center[1] + Math.sin(start_angle) * radius;
                let prevP = toVec([startX, startY]);

                // Add start point
                pointVertices.push(prevP.x, prevP.y, prevP.z);

                for (let i = 1; i <= segments; i++) {
                    // Interpolate angle
                    const t = i / segments;
                    // Properly handle angle wrapping if needed? 
                    // Assuming angles are correct in ent.
                    const angle = start_angle + (end_angle - start_angle) * t;

                    const x = center[0] + Math.cos(angle) * radius;
                    const y = center[1] + Math.sin(angle) * radius;
                    const currP = toVec([x, y]);

                    if (isConst) {
                        constructionVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    } else {
                        solidVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    }

                    if (selected) {
                        selectedVertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                    }

                    prevP = currP;
                }

                // Add end point
                pointVertices.push(prevP.x, prevP.y, prevP.z);

                // Center point slightly different style? Or just standard point.
                const cVec = toVec(center);
                pointVertices.push(cVec.x, cVec.y, cVec.z);
            }

            // Points
            if (ent.geometry.Point) {
                const p = toVec(ent.geometry.Point.pos);
                pointVertices.push(p.x, p.y, p.z);
                if (selected) {
                    // Maybe draw a small cross or circle for selected points?
                    // For now, rely on standard point size, or SelectionHighlightMesh handling hover/select.
                    // Actually, if we want to highlight selected points, we might need a separate mechanism.
                }
            }
        });

        // Create/Update Meshes
        if (solidVertices.length > 0) {
            const geom = new LineSegmentsGeometry();
            geom.setPositions(solidVertices);
            this.solidLines = new LineSegments2(geom, this.solidMat);
            this.solidLines.computeLineDistances();
            this.solidLines.scale.set(1, 1, 1);
            this.meshGroup.add(this.solidLines);
        }

        if (constructionVertices.length > 0) {
            const geom = new LineSegmentsGeometry();
            geom.setPositions(constructionVertices);
            this.constructionLines = new LineSegments2(geom, this.constructionMat);
            this.constructionLines.computeLineDistances();
            this.constructionLines.scale.set(1, 1, 1);
            this.meshGroup.add(this.constructionLines);
        }

        if (selectedVertices.length > 0) {
            const geom = new LineSegmentsGeometry();
            geom.setPositions(selectedVertices);
            this.selectedLines = new LineSegments2(geom, this.selectedMat);
            this.selectedLines.computeLineDistances();
            this.selectedLines.scale.set(1, 1, 1);
            this.selectedLines.renderOrder = 9999; // Ontop
            this.meshGroup.add(this.selectedLines);
        }

        if (pointVertices.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(pointVertices, 3));
            this.points = new THREE.Points(geom, this.pointMat);
            this.meshGroup.add(this.points);
        }
    }

    public clear() {
        // Dispose geometries
        if (this.solidLines) {
            this.meshGroup.remove(this.solidLines);
            this.solidLines.geometry.dispose();
            this.solidLines = null;
        }
        if (this.constructionLines) {
            this.meshGroup.remove(this.constructionLines);
            this.constructionLines.geometry.dispose();
            this.constructionLines = null;
        }
        if (this.selectedLines) {
            this.meshGroup.remove(this.selectedLines);
            this.selectedLines.geometry.dispose();
            this.selectedLines = null;
        }
        if (this.points) {
            this.meshGroup.remove(this.points);
            this.points.geometry.dispose();
            this.points = null;
        }
    }

    public dispose() {
        this.clear();
        this.scene.remove(this.meshGroup);

        // Dispose materials
        this.solidMat.dispose();
        this.constructionMat.dispose();
        this.selectedMat.dispose();
        this.pointMat.dispose();
    }
}
