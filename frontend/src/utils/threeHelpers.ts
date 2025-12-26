/**
 * THREE.js helper utilities for common rendering tasks.
 * 
 * Used for:
 * - Creating text sprites for labels and dimensions
 * - Creating simple geometric markers
 * - Common material and geometry patterns
 */

import * as THREE from 'three';

/**
 * Create a text sprite for rendering text in 3D space.
 * Renders text to a canvas texture and applies to a sprite.
 * 
 * @param text The text to display
 * @param color CSS color string (e.g., '#ffffff', 'red')
 * @param size Scale factor for the sprite
 * @param options Additional options
 */
export function createTextSprite(
    text: string,
    color: string,
    size: number,
    options: {
        fontSize?: number;
        fontWeight?: string;
        fontFamily?: string;
        backgroundColor?: string;
        padding?: number;
        sizeAttenuation?: boolean;
        depthTest?: boolean;
    } = {}
): THREE.Sprite {
    const {
        fontSize = 32,
        fontWeight = 'bold',
        fontFamily = 'Arial',
        backgroundColor,
        padding = 10,
        sizeAttenuation = false,
        depthTest = false,
    } = options;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Measure text to determine canvas size
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(text).width;
    canvas.width = Math.max(128, Math.ceil(textWidth + padding * 2));
    canvas.height = Math.ceil(fontSize * 1.5);

    // Draw background if specified
    if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Re-set font after canvas resize (required)
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest,
        sizeAttenuation,
    });

    const sprite = new THREE.Sprite(material);

    // Scale proportionally to maintain aspect ratio
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(size * aspect, size, 1);
    sprite.renderOrder = 10000;

    return sprite;
}

/**
 * Create a point marker texture with orange circle and grey crosshair lines.
 * The crosshair extends beyond the circle for a professional CAD look.
 * 
 * @param color CSS color string for the circle
 * @param size Canvas size (pixels)
 */
export function createPointMarkerTexture(
    color: string = '#ffaa00',
    size: number = 64
): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const circleRadius = size * 0.2; // Small circle in center
    const crossArmLength = size * 0.48; // Plus arms extend to edges
    const lineWidth = size * 0.06; // Thin lines for the cross

    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, size, size);

    // Draw transparent grey crosshair lines FIRST (so circle is on top)
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.7)'; // Semi-transparent grey
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // Horizontal line of plus
    ctx.beginPath();
    ctx.moveTo(center - crossArmLength, center);
    ctx.lineTo(center + crossArmLength, center);
    ctx.stroke();

    // Vertical line of plus
    ctx.beginPath();
    ctx.moveTo(center, center - crossArmLength);
    ctx.lineTo(center, center + crossArmLength);
    ctx.stroke();

    // Draw filled orange circle ON TOP of the crosshair
    ctx.beginPath();
    ctx.arc(center, center, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
}

/**
 * Create a circular marker mesh (for constraint indicators, coincident points, etc.)
 */
export function createCircleMarker(
    radius: number,
    color: number,
    options: {
        segments?: number;
        depthTest?: boolean;
        renderOrder?: number;
        opacity?: number;
    } = {}
): THREE.Mesh {
    const {
        segments = 16,
        depthTest = false,
        renderOrder = 10000,
        opacity = 1,
    } = options;

    const geometry = new THREE.CircleGeometry(radius, segments);
    const material = new THREE.MeshBasicMaterial({
        color,
        depthTest,
        transparent: opacity < 1,
        opacity,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;

    return mesh;
}

/**
 * Create a diamond/rhombus marker (often used for constraint indicators).
 */
export function createDiamondMarker(
    size: number,
    color: number,
    options: {
        depthTest?: boolean;
        renderOrder?: number;
    } = {}
): THREE.Mesh {
    const { depthTest = false, renderOrder = 10000 } = options;

    const shape = new THREE.Shape();
    shape.moveTo(0, size);
    shape.lineTo(size * 0.6, 0);
    shape.lineTo(0, -size);
    shape.lineTo(-size * 0.6, 0);
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({ color, depthTest });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;

    return mesh;
}

/**
 * Create a line between two 3D points.
 */
export function createLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: number,
    options: {
        linewidth?: number;
        depthTest?: boolean;
        dashed?: boolean;
    } = {}
): THREE.Line {
    const { depthTest = false, dashed = false } = options;

    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);

    const material = dashed
        ? new THREE.LineDashedMaterial({ color, depthTest, dashSize: 0.3, gapSize: 0.1 })
        : new THREE.LineBasicMaterial({ color, depthTest });

    const line = new THREE.Line(geometry, material);

    if (dashed) {
        line.computeLineDistances();
    }

    return line;
}

/**
 * Create an arc mesh for dimension arcs.
 */
export function createArc(
    radius: number,
    startAngle: number,
    endAngle: number,
    color: number,
    segments: number = 32,
    options: {
        depthTest?: boolean;
        linewidth?: number;
    } = {}
): THREE.Line {
    const { depthTest = false } = options;

    const points: THREE.Vector3[] = [];
    const angleRange = endAngle - startAngle;

    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (angleRange * i) / segments;
        points.push(new THREE.Vector3(
            radius * Math.cos(angle),
            radius * Math.sin(angle),
            0
        ));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, depthTest });

    return new THREE.Line(geometry, material);
}

/**
 * Dispose of a THREE.js object and its children recursively.
 * Properly cleans up geometries, materials, and textures.
 */
export function disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
            (child as THREE.Mesh).geometry.dispose();
        }

        const material = (child as THREE.Mesh).material;
        if (material) {
            if (Array.isArray(material)) {
                material.forEach((m) => {
                    disposeMaterial(m);
                });
            } else {
                disposeMaterial(material as THREE.Material);
            }
        }
    });
}

/**
 * Dispose of a material and its textures.
 */
function disposeMaterial(material: THREE.Material): void {
    material.dispose();

    // Dispose of any textures
    const mat = material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.SpriteMaterial;
    if (mat.map) mat.map.dispose();
    if ((mat as THREE.MeshStandardMaterial).normalMap) (mat as THREE.MeshStandardMaterial).normalMap?.dispose();
    if ((mat as THREE.MeshStandardMaterial).roughnessMap) (mat as THREE.MeshStandardMaterial).roughnessMap?.dispose();
}
