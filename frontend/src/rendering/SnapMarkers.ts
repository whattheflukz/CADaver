import * as THREE from 'three';
import type { SnapPoint, Sketch } from '../types';
import { sketchToWorld } from '../utils/sketchGeometry';
import { createCircleMarker, createDiamondMarker } from '../utils/threeHelpers';

export class SnapMarkers {
    private scene: THREE.Scene;
    private group: THREE.Group;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = "snap_markers_group";
        this.group.renderOrder = 20000; // Always on top
        this.scene.add(this.group);
    }

    public update(snap: SnapPoint | null, sketch: Sketch | null) {
        this.clear();
        if (!snap || !sketch) return;

        const pos = sketchToWorld(snap.position[0], snap.position[1], sketch.plane);

        // Z-bias to appear on top
        pos.add(new THREE.Vector3().fromArray(sketch.plane.normal || [0, 0, 1]).multiplyScalar(0.05));

        const color = 0xffaa00; // Orange

        // Create marker based on type
        switch (snap.snap_type) {
            case 'Endpoint':
            case 'Center':
            case 'Point': // Not in types?
                // Square or Circle? Viewport used Box for endpoint (implied) or just a dot
                // Let's use a Square for endpoint, Circle for center
                if (snap.snap_type === 'Center') {
                    const marker = createCircleMarker(0.3, color, { depthTest: false });
                    marker.position.copy(pos);
                    this.group.add(marker);
                } else {
                    // Square for endpoint
                    const geo = new THREE.PlaneGeometry(0.5, 0.5);
                    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.copy(pos);
                    mesh.lookAt(pos.clone().add(new THREE.Vector3().fromArray(sketch.plane.normal || [0, 0, 1])));
                    this.group.add(mesh);
                }
                break;

            case 'Midpoint':
                // Triangle
                const triShape = new THREE.Shape();
                triShape.moveTo(0, 0.3);
                triShape.lineTo(0.3, -0.2);
                triShape.lineTo(-0.3, -0.2);
                triShape.closePath();
                const triGeo = new THREE.ShapeGeometry(triShape);
                const triMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
                const triMesh = new THREE.Mesh(triGeo, triMat);
                triMesh.position.copy(pos);
                triMesh.lookAt(pos.clone().add(new THREE.Vector3().fromArray(sketch.plane.normal || [0, 0, 1])));
                this.group.add(triMesh);
                break;

            case 'Intersection':
                // X shape
                const xGroup = new THREE.Group();
                xGroup.position.copy(pos);
                // Rotate to match plane?
                // Just use simple lines
                // Need to orient to plane
                // For now just 2 crosses
                // Viewport.tsx logic? Line 2176 used "Marker" helper? No, it used "createSnapMarker"
                // Let's just use a diamond for now
                const diamond = createDiamondMarker(0.3, color, { depthTest: false });
                diamond.position.copy(pos);
                this.group.add(diamond);
                break;

            case 'Grid':
            case 'AxisX':
            case 'AxisY':
            case 'Origin':
                // Circle with crosshair?
                const circle = createCircleMarker(0.2, color, { depthTest: false });
                circle.position.copy(pos);
                this.group.add(circle);
                break;
        }

        // Add text label?
        // const label = createTextSprite(snap.snap_type, "#ffaa00", 0.5);
        // label.position.copy(pos).add(new THREE.Vector3(0.5, 0.5, 0));
        // this.group.add(label);
    }

    public clear() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        }
    }
}
