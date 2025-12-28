/**
 * useDimensionDrag - Hook for handling dimension dragging in the viewport
 * Extracted from Viewport.tsx to reduce complexity.
 */

import { createEffect, onCleanup, type Accessor } from 'solid-js';
import * as THREE from 'three';
import type { Sketch } from '../types';
import {
    getPointerPos2D as doGetPointerPos2D,
    intersectObjectsFromClient as doIntersectObjectsFromClient,
    worldToSketchLocal
} from '../services/RaycastService';

export interface DimensionDragContext {
    scene: () => THREE.Scene | null;
    camera: () => THREE.Camera | null;
    containerRef: () => HTMLDivElement | null;
    controls: () => any | null;  // OrbitControls
    ready: Accessor<boolean>;
    clientSketch: Accessor<Sketch | null | undefined>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    onDimensionDrag?: (index: number, offset: [number, number]) => void;
}

type DragType = 'Distance' | 'Angle' | 'Radius' | 'DistanceParallelLines' | 'HorizontalDistance' | 'VerticalDistance' | 'DistancePointLine' | null;

/**
 * Setup dimension drag event listeners and handlers
 */
export function useDimensionDrag(ctx: DimensionDragContext) {
    // Drag state
    let isDragging = false;
    let dragIndex = -1;
    let dragType: DragType = null;
    let startOffset = [0, 0];
    let dragUserData: any = null;
    let dragStartPoint = new THREE.Vector3();
    let dragStartLocal = { x: 0, y: 0 };

    createEffect(() => {
        const scene = ctx.scene();
        const camera = ctx.camera();
        const containerRef = ctx.containerRef();
        const controls = ctx.controls();

        if (!ctx.ready() || !containerRef || !scene || !camera) return;

        const getRaycastContext = () => ({
            containerRef: containerRef,
            camera,
            scene,
            mainMesh: scene.getObjectByName('mainMesh') as THREE.Mesh | null,
            raycaster: ctx.raycaster,
            mouse: ctx.mouse
        });

        const getSketchContext = () => ({
            plane: ctx.clientSketch()?.plane || null
        });

        const getLocalPos = (worldPos: THREE.Vector3) => {
            return worldToSketchLocal(worldPos, getSketchContext());
        };

        const onPointerDown = (e: PointerEvent) => {
            const sketch = ctx.clientSketch();
            if (!containerRef || !sketch) return;

            const CONSTRAINT_INDICATOR_NAME = 'constraint_indicators';
            const DIMENSION_RENDERER_NAME = 'dimension_renderer_group';

            const indicatorGroup = scene.getObjectByName(CONSTRAINT_INDICATOR_NAME);
            const dimensionGroup = scene.getObjectByName(DIMENSION_RENDERER_NAME);

            let targets: THREE.Object3D[] = [];
            if (indicatorGroup) targets = targets.concat(indicatorGroup.children);
            if (dimensionGroup) targets = targets.concat(dimensionGroup.children);

            if (targets.length === 0) return;

            const hits = doIntersectObjectsFromClient(
                e.clientX,
                e.clientY,
                getRaycastContext(),
                targets,
                true
            );

            for (const hit of hits) {
                if (hit.object.userData?.isDimensionHitbox) {
                    e.stopPropagation();
                    isDragging = true;
                    dragIndex = hit.object.userData.index;
                    dragType = hit.object.userData.type;
                    dragUserData = hit.object.userData;
                    dragStartPoint.copy(hit.point);
                    dragStartLocal = getLocalPos(hit.point);

                    const entry = sketch.constraints[dragIndex];
                    const constraint = (entry as any).constraint || entry;

                    // Extract initial offset based on constraint type
                    if (dragType === 'Distance' && constraint.Distance?.style) {
                        startOffset = [...constraint.Distance.style.offset];
                    } else if (dragType === 'Angle' && constraint.Angle?.style) {
                        startOffset = [...constraint.Angle.style.offset];
                    } else if (dragType === 'Radius' && constraint.Radius?.style) {
                        startOffset = [...constraint.Radius.style.offset];
                    } else if (dragType === 'DistanceParallelLines' && constraint.DistanceParallelLines?.style) {
                        startOffset = [...constraint.DistanceParallelLines.style.offset];
                    } else if (dragType === 'HorizontalDistance' && constraint.HorizontalDistance?.style) {
                        startOffset = [...constraint.HorizontalDistance.style.offset];
                    } else if (dragType === 'VerticalDistance' && constraint.VerticalDistance?.style) {
                        startOffset = [...constraint.VerticalDistance.style.offset];
                    } else if (dragType === 'DistancePointLine' && constraint.DistancePointLine) {
                        startOffset = constraint.DistancePointLine.style?.offset
                            ? [...constraint.DistancePointLine.style.offset]
                            : [0, 0];
                    }

                    if (controls) controls.enabled = false;
                    return;
                }
            }
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging || !containerRef) return;

            const currentLocal = doGetPointerPos2D(
                e.clientX,
                e.clientY,
                getRaycastContext(),
                getSketchContext()
            );
            if (!currentLocal) return;

            let newOffset: [number, number] = [startOffset[0], startOffset[1]];

            if (dragType === 'Distance' || dragType === 'DistanceParallelLines' || dragType === 'DistancePointLine') {
                const dx = currentLocal.x - dragStartLocal.x;
                const dy = currentLocal.y - dragStartLocal.y;

                const { dirX, dirY } = dragUserData || { dirX: 1, dirY: 0 };
                const normalX = -dirY;
                const normalY = dirX;

                const deltaPara = dx * dirX + dy * dirY;
                const deltaPerp = dx * normalX + dy * normalY;

                newOffset = [startOffset[0] + deltaPara, startOffset[1] + deltaPerp];

            } else if (dragType === 'Angle') {
                const center = dragUserData.center;
                const currentDist = Math.sqrt((currentLocal.x - center[0]) ** 2 + (currentLocal.y - center[1]) ** 2);
                const startDistLocal = Math.sqrt((dragStartLocal.x - center[0]) ** 2 + (dragStartLocal.y - center[1]) ** 2);
                const deltaRadius = currentDist - startDistLocal;

                newOffset = [startOffset[0], startOffset[1] + deltaRadius];

            } else if (dragType === 'Radius') {
                const center = dragUserData.center;
                const startAngle = Math.atan2(dragStartLocal.y - center[1], dragStartLocal.x - center[0]);
                const currentAngle = Math.atan2(currentLocal.y - center[1], currentLocal.x - center[0]);
                const deltaAngle = currentAngle - startAngle;

                newOffset = [startOffset[0], startOffset[1] + deltaAngle];

            } else if (dragType === 'HorizontalDistance') {
                const dy = currentLocal.y - dragStartLocal.y;
                newOffset = [startOffset[0], startOffset[1] + dy];

            } else if (dragType === 'VerticalDistance') {
                const dx = currentLocal.x - dragStartLocal.x;
                newOffset = [startOffset[0] + dx, startOffset[1]];
            }

            if (ctx.onDimensionDrag) {
                ctx.onDimensionDrag(dragIndex, newOffset);
            }
        };

        const onPointerUp = () => {
            isDragging = false;
            dragIndex = -1;
            dragType = null;
            if (controls) controls.enabled = true;
        };

        containerRef.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        onCleanup(() => {
            containerRef.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        });
    });
}
