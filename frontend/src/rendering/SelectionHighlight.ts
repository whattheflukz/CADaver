import * as THREE from 'three';
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import { sketchToWorld, getEntityById } from '../utils/sketchGeometry';
import type { Sketch } from '../types';

export class SelectionHighlight {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private highlightMesh: LineSegments2 | null = null;
    private material: LineMaterial;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = "selection_highlight_group";
        this.group.renderOrder = 19000; // Above lines, below constraints
        this.scene.add(this.group);

        const resolution = (window as any).viewportLineResolution || new THREE.Vector2(window.innerWidth, window.innerHeight);
        this.material = new LineMaterial({
            color: 0xffaa00, // Orange highlight
            linewidth: 6,
            resolution,
            depthTest: false,
            transparent: true,
            opacity: 0.5
        });
    }

    public updateResolution(width: number, height: number) {
        this.material.resolution.set(width, height);
    }

    // Highlight hovered entities
    public updateHover(sketch: Sketch | null, hoveredEntityId: string | null) {
        this.clear();
        if (!sketch || !hoveredEntityId) return;

        const entity = getEntityById(sketch, hoveredEntityId);
        if (!entity) return;

        const vertices: number[] = [];
        const toVec = (p: [number, number]) => sketchToWorld(p[0], p[1], sketch.plane);

        if (entity.geometry.Line) {
            const { start, end } = entity.geometry.Line;
            const v1 = toVec(start);
            const v2 = toVec(end);
            vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        } else if (entity.geometry.Circle) {
            const { center, radius } = entity.geometry.Circle;
            const segments = 64;
            let prevP = toVec([center[0] + radius, center[1]]);
            for (let i = 1; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = center[0] + Math.cos(angle) * radius;
                const y = center[1] + Math.sin(angle) * radius;
                const currP = toVec([x, y]);
                vertices.push(prevP.x, prevP.y, prevP.z, currP.x, currP.y, currP.z);
                prevP = currP;
            }
        }
        // ... Arc support etc similar to SketchRenderer

        if (vertices.length > 0) {
            const geom = new LineSegmentsGeometry();
            geom.setPositions(vertices);
            this.highlightMesh = new LineSegments2(geom, this.material);
            this.highlightMesh.computeLineDistances();
            this.highlightMesh.scale.set(1, 1, 1);
            this.group.add(this.highlightMesh);
        }
    }

    public clear() {
        if (this.highlightMesh) {
            this.group.remove(this.highlightMesh);
            this.highlightMesh.geometry.dispose();
            this.highlightMesh = null;
        }
    }
}
