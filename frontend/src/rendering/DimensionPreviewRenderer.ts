/**
 * DimensionPreviewRenderer - Renders dimension previews in the 3D viewport
 * Extracted from Viewport.tsx to reduce complexity.
 */

import * as THREE from 'three';
import type { Sketch, SketchPlane } from '../types';
import { sketchToWorld } from '../utils/sketchGeometry';

/** Preview dimension data structure */
export interface PreviewDimensionData {
    type: string;
    value: number;
    selections: SelectionCandidate[];
}

/** Selection candidate for dimension preview */
export interface SelectionCandidate {
    type: 'origin' | 'point' | 'entity';
    id?: string;
    position?: [number, number];
}

const PREVIEW_DIMENSION_NAME = 'preview_dimension';

/**
 * Create a text sprite for dimension labels
 */
export function createTextSprite(text: string, color: string, size: number): THREE.Sprite {
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
}

/**
 * Get position from a selection candidate
 */
export function getCandidatePosition(
    candidate: SelectionCandidate,
    sketch: Sketch | null
): [number, number] | null {
    if (candidate.type === 'origin') return [0, 0];

    if (candidate.type === 'point') {
        if (candidate.position) return candidate.position;
        if (candidate.id && sketch) {
            const ent = sketch.entities.find((e: any) => e.id === candidate.id);
            if (ent?.geometry.Point) return ent.geometry.Point.pos;
        }
    }

    if (candidate.type === 'entity' && sketch) {
        const ent = sketch.entities.find((e: any) => e.id === candidate.id);
        if (ent?.geometry.Point) return ent.geometry.Point.pos;
        if (ent?.geometry.Line) return ent.geometry.Line.start;
        if (ent?.geometry.Circle) return ent.geometry.Circle.center;
        if (ent?.geometry.Arc) return ent.geometry.Arc.center;
    }

    return null;
}

/**
 * Clean up existing preview dimension group
 */
export function cleanupPreviewDimension(scene: THREE.Scene): void {
    const existing = scene.getObjectByName(PREVIEW_DIMENSION_NAME) as THREE.Group;
    if (existing) {
        scene.remove(existing);
        existing.traverse((child) => {
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        });
    }
}

/**
 * Render distance dimension preview (Distance, HorizontalDistance, VerticalDistance, Length)
 */
function renderDistancePreview(
    group: THREE.Group,
    type: string,
    p1: [number, number],
    p2: [number, number],
    pointerPos: { x: number; y: number },
    value: number
): [number, number] | null {
    const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });
    let textPos: [number, number] | null = null;

    if (type === 'HorizontalDistance') {
        const y = pointerPos.y;
        const ext1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1[0], p1[1], 0),
            new THREE.Vector3(p1[0], y, 0)
        ]);
        const ext2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p2[0], p2[1], 0),
            new THREE.Vector3(p2[0], y, 0)
        ]);
        const dimLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1[0], y, 0),
            new THREE.Vector3(p2[0], y, 0)
        ]);
        group.add(new THREE.Line(ext1, dimMat));
        group.add(new THREE.Line(ext2, dimMat));
        group.add(new THREE.Line(dimLine, dimMat));
        textPos = [(p1[0] + p2[0]) / 2, y];

    } else if (type === 'VerticalDistance') {
        const x = pointerPos.x;
        const ext1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1[0], p1[1], 0),
            new THREE.Vector3(x, p1[1], 0)
        ]);
        const ext2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p2[0], p2[1], 0),
            new THREE.Vector3(x, p2[1], 0)
        ]);
        const dimLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, p1[1], 0),
            new THREE.Vector3(x, p2[1], 0)
        ]);
        group.add(new THREE.Line(ext1, dimMat));
        group.add(new THREE.Line(ext2, dimMat));
        group.add(new THREE.Line(dimLine, dimMat));
        textPos = [x, (p1[1] + p2[1]) / 2];

    } else {
        // Aligned Distance
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) { dx = 1; dy = 0; len = 1; }
        const nx = dx / len;
        const ny = dy / len;

        const vx = pointerPos.x - p1[0];
        const vy = pointerPos.y - p1[1];
        const perp = vx * -ny + vy * nx;

        const p1_ext = [p1[0] - ny * perp, p1[1] + nx * perp];
        const p2_ext = [p2[0] - ny * perp, p2[1] + nx * perp];

        const ext1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1[0], p1[1], 0),
            new THREE.Vector3(p1_ext[0], p1_ext[1], 0)
        ]);
        const ext2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p2[0], p2[1], 0),
            new THREE.Vector3(p2_ext[0], p2_ext[1], 0)
        ]);
        const dimLine = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1_ext[0], p1_ext[1], 0),
            new THREE.Vector3(p2_ext[0], p2_ext[1], 0)
        ]);
        group.add(new THREE.Line(ext1, dimMat));
        group.add(new THREE.Line(ext2, dimMat));
        group.add(new THREE.Line(dimLine, dimMat));
        textPos = [(p1_ext[0] + p2_ext[0]) / 2, (p1_ext[1] + p2_ext[1]) / 2];
    }

    if (textPos) {
        const textSprite = createTextSprite(value.toFixed(2), '#00dddd', 0.03);
        textSprite.position.set(textPos[0], textPos[1], 0.02);
        group.add(textSprite);
    }

    return textPos;
}

/**
 * Render point-to-line distance preview
 */
function renderDistancePointLinePreview(
    group: THREE.Group,
    line: { start: [number, number]; end: [number, number] },
    point: [number, number],
    value: number,
    plane: SketchPlane
): void {
    const dx = line.end[0] - line.start[0];
    const dy = line.end[1] - line.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return;

    const nx = dx / len;
    const ny = dy / len;

    const vx = point[0] - line.start[0];
    const vy = point[1] - line.start[1];
    const t = vx * nx + vy * ny;

    const projX = line.start[0] + nx * t;
    const projY = line.start[1] + ny * t;

    const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });

    const pWorld = sketchToWorld(point[0], point[1], plane);
    const projWorld = sketchToWorld(projX, projY, plane);

    const dimLine = new THREE.BufferGeometry().setFromPoints([pWorld, projWorld]);
    group.add(new THREE.Line(dimLine, dimMat));

    const midX = (point[0] + projX) / 2;
    const midY = (point[1] + projY) / 2;

    const distDx = point[0] - projX;
    const distDy = point[1] - projY;
    const distLen = Math.sqrt(distDx * distDx + distDy * distDy);
    const nDx = distLen > 0.001 ? distDx / distLen : -ny;
    const nDy = distLen > 0.001 ? distDy / distLen : nx;

    const offsetX = nDy * 0.1;
    const offsetY = -nDx * 0.1;
    const textX = midX + offsetX;
    const textY = midY + offsetY;

    const val = (value !== undefined && value !== null && !isNaN(value)) ? value : 0;
    const textSprite = createTextSprite(val.toFixed(2), '#00dddd', 0.03);
    textSprite.position.set(textX, textY, 0.02);
    group.add(textSprite);
}

/**
 * Render radius dimension preview
 */
function renderRadiusPreview(
    group: THREE.Group,
    center: [number, number],
    pointerPos: { x: number; y: number },
    radius: number
): void {
    const dimMat = new THREE.LineBasicMaterial({ color: 0x00dddd, depthTest: false });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center[0], center[1], 0),
        new THREE.Vector3(pointerPos.x, pointerPos.y, 0)
    ]);
    group.add(new THREE.Line(lineGeo, dimMat));

    const textSprite = createTextSprite('R ' + radius.toFixed(2), '#00dddd', 0.03);
    textSprite.position.set(pointerPos.x, pointerPos.y, 0.02);
    group.add(textSprite);
}

/**
 * Render angle dimension preview
 */
function renderAnglePreview(
    group: THREE.Group,
    pointerPos: { x: number; y: number },
    angleRad: number
): void {
    const textSprite = createTextSprite(
        'Angle ' + (angleRad * 180 / Math.PI).toFixed(1),
        '#00dddd',
        0.03
    );
    textSprite.position.set(pointerPos.x, pointerPos.y, 0.02);
    group.add(textSprite);
}

/**
 * Main function to render dimension preview
 */
export function renderDimensionPreview(
    scene: THREE.Scene,
    previewDimension: PreviewDimensionData,
    pointerPos: { x: number; y: number },
    clientSketch: Sketch | null,
    matrix: THREE.Matrix4 | null
): void {
    cleanupPreviewDimension(scene);

    if (!previewDimension || previewDimension.selections.length === 0) return;

    const group = new THREE.Group();
    group.name = PREVIEW_DIMENSION_NAME;

    if (clientSketch?.plane && matrix) {
        group.matrixAutoUpdate = false;
        group.matrix.copy(matrix);
    }

    const { type, value, selections } = previewDimension;
    const getPos = (c: SelectionCandidate) => getCandidatePosition(c, clientSketch);

    if ((type === 'Distance' || type === 'HorizontalDistance' || type === 'VerticalDistance' || type === 'Length') && selections.length >= 1) {
        let p1 = getPos(selections[0]);
        let p2 = selections.length > 1 ? getPos(selections[1]) : null;

        // Handle Line-Point case
        if (selections.length === 2 && !p2 && selections[1].type === 'point') {
            p2 = selections[1].position || null;
        }

        // If only 1 entity (Length), use start/end
        if (selections.length === 1 && selections[0].type === 'entity' && clientSketch) {
            const ent = clientSketch.entities.find((e: any) => e.id === selections[0].id);
            if (ent?.geometry.Line) {
                p1 = ent.geometry.Line.start;
                p2 = ent.geometry.Line.end;
            }
        }

        if (p1 && p2) {
            renderDistancePreview(group, type, p1, p2, pointerPos, value);
        }

    } else if (type === 'DistancePointLine' && selections.length === 2 && clientSketch) {
        const isLine = (c: SelectionCandidate) =>
            c.type === 'entity' && clientSketch.entities.find((e: any) => e.id === c.id)?.geometry.Line;
        const getLine = (c: SelectionCandidate) =>
            clientSketch.entities.find((e: any) => e.id === c.id)?.geometry.Line;

        const lineC = isLine(selections[0]) ? selections[0] : selections[1];
        const pointC = isLine(selections[0]) ? selections[1] : selections[0];

        const line = getLine(lineC);
        const p = getPos(pointC);

        if (line && p && clientSketch.plane) {
            renderDistancePointLinePreview(group, line, p, value, clientSketch.plane);
        }

    } else if (type === 'Radius' && selections.length === 1) {
        const center = getPos(selections[0]);
        if (center) {
            renderRadiusPreview(group, center, pointerPos, value);
        }

    } else if (type === 'Angle') {
        renderAnglePreview(group, pointerPos, value);
    }

    scene.add(group);
}
