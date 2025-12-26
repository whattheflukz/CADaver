import * as THREE from 'three';
import { LineMaterial, LineSegmentsGeometry, LineSegments2 } from 'three-stdlib';
import type { Sketch, ActiveMeasurement } from '../types';
import { getMeasurementValue } from '../types';
import {
    sketchToWorld,
    getConstraintPointPosition,
    getLineMidpoint,
    getEntityById
} from '../utils/sketchGeometry';
import { createTextSprite, createCircleMarker } from '../utils/threeHelpers';

export class DimensionRenderer {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private resolution: THREE.Vector2 = new THREE.Vector2(window.innerWidth, window.innerHeight);

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = "dimension_renderer_group";
        this.scene.add(this.group);
    }

    public update(sketch: Sketch | null, resolution: THREE.Vector2 = new THREE.Vector2(window.innerWidth, window.innerHeight)) {
        this.resolution.copy(resolution);
        this.clear();
        if (!sketch || !sketch.constraints) return;

        // Use a slight Z offset to prevent z-fighting with sketch lines
        this.group.position.z = 0.01;

        sketch.constraints.forEach((entry: any, index: number) => {
            const constraint = entry.constraint || entry;

            try {

                if (constraint.Horizontal) {
                    this.renderTextConstraint(sketch, constraint.Horizontal.entity, "H", "#00aaff");
                } else if (constraint.Vertical) {
                    this.renderTextConstraint(sketch, constraint.Vertical.entity, "V", "#00aaff");
                } else if (constraint.Coincident) {
                    this.renderCoincident(sketch, constraint.Coincident.points);
                } else if (constraint.Parallel) {
                    this.renderTextConstraint(sketch, constraint.Parallel.lines[0], "||", "#ffaa00");
                    this.renderTextConstraint(sketch, constraint.Parallel.lines[1], "||", "#ffaa00");
                } else if (constraint.Perpendicular) {
                    this.renderTextConstraint(sketch, constraint.Perpendicular.lines[0], "⊥", "#ff8800");
                } else if (constraint.Equal) {
                    this.renderTextConstraint(sketch, constraint.Equal.entities[0], "=", "#88ff00");
                    this.renderTextConstraint(sketch, constraint.Equal.entities[1], "=", "#88ff00");
                } else if (constraint.Distance && constraint.Distance.style) {
                    this.renderDistance(sketch, constraint.Distance, index);
                } else if (constraint.HorizontalDistance && constraint.HorizontalDistance.style) {
                    this.renderLinearDistance(sketch, constraint.HorizontalDistance, index, 'horizontal');
                } else if (constraint.VerticalDistance && constraint.VerticalDistance.style) {
                    this.renderLinearDistance(sketch, constraint.VerticalDistance, index, 'vertical');
                } else if (constraint.Angle && constraint.Angle.style) {
                    this.renderAngle(sketch, constraint.Angle, index);
                } else if (constraint.Radius && constraint.Radius.style) {
                    this.renderRadius(sketch, constraint.Radius, index);
                } else if (constraint.DistancePointLine) {
                    this.renderPointLineDistance(sketch, constraint.DistancePointLine, index);
                } else if (constraint.Length && constraint.Length.style) {
                    // Length is often rendered same as Distance but specific to a line entity
                    // Not fully implemented in reference trace, skipping for now or treating as distance
                }
            } catch (e) {
                console.error("[DimensionRenderer] Error rendering constraint:", index, entry, e);
            }
        });
    }

    private renderTextConstraint(sketch: Sketch, entityId: string, text: string, color: string) {
        const mid = getLineMidpoint(sketch, entityId);
        if (mid) {
            const pos = sketchToWorld(mid[0], mid[1], sketch.plane);
            // Offset slightly in Y (local) for visibility? 
            // Viewport.tsx added +0.5, +0.3. We need to project that offset.
            // For now, just place at midpoint.
            // Ideally we offset in screen space or billboard it.

            const sprite = createTextSprite(text, color, 0.03);
            sprite.position.copy(pos);
            // Constant world offset? Or local offset?
            // Viewport.tsx: sprite.position.set(mid[0] + 0.5, mid[1] + 0.3, 0.01);
            // This implies offset in sketch space.
            const offset = sketchToWorld(mid[0] + 0.5, mid[1] + 0.3, sketch.plane);
            sprite.position.copy(offset);

            this.group.add(sprite);
        }
    }

    private renderCoincident(sketch: Sketch, points: any[]) {
        const p1 = getConstraintPointPosition(sketch, points[0]);
        const p2 = getConstraintPointPosition(sketch, points[1]);
        if (p1 && p2) {
            const cx = (p1[0] + p2[0]) / 2;
            const cy = (p1[1] + p2[1]) / 2;
            const pos = sketchToWorld(cx, cy, sketch.plane);

            // Viewport.tsx used createCoincidentMarker
            const marker = createCircleMarker(0.15, 0xff00ff);
            marker.position.copy(pos);
            this.group.add(marker);
        }
    }

    private renderDistance(sketch: Sketch, data: any, index: number) {
        const p1 = getConstraintPointPosition(sketch, data.points[0]);
        const p2 = getConstraintPointPosition(sketch, data.points[1]);
        if (!p1 || !p2) return;

        // Logic from Viewport.tsx lines 1429+
        // Default: Point-to-Point Axis
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let len = Math.sqrt(dx * dx + dy * dy);

        // Helper to check line alignment (Logic simplified from Viewport.tsx)
        const entity1 = getEntityById(sketch, data.points[0].id);
        const entity2 = getEntityById(sketch, data.points[1].id);

        let alignLine = null;
        if (entity1 && entity1.geometry.Line) alignLine = entity1.geometry.Line;
        else if (entity2 && entity2.geometry.Line) alignLine = entity2.geometry.Line;

        if (alignLine) {
            const l = alignLine;
            const ldx = l.end[0] - l.start[0];
            const ldy = l.end[1] - l.start[1];
            const lLen = Math.sqrt(ldx * ldx + ldy * ldy);
            if (lLen > 0.001) {
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

        const nx = dx / len;
        const ny = dy / len;
        const px = -ny;
        const py = nx;

        const offsetDist = 1.0 + data.style.offset[1];
        const evX = px * offsetDist;
        const evY = py * offsetDist;

        const dStart: [number, number] = [p1[0] + evX, p1[1] + evY];

        // Project p2 onto line
        const v2x = p2[0] - dStart[0];
        const v2y = p2[1] - dStart[1];
        const dot = v2x * nx + v2y * ny;
        const dEnd: [number, number] = [dStart[0] + nx * dot, dStart[1] + ny * dot];

        const color = data.style.driven ? 0x888888 : 0x00dddd;

        this.createDimensionLine(sketch, p1, dStart, color);
        this.createDimensionLine(sketch, p2, dEnd, color);
        this.createDimensionLine(sketch, dStart, dEnd, color);

        this.createDimensionText(sketch, dStart, dEnd, data.value, color, index, 'Distance', nx, ny);
    }

    private renderLinearDistance(sketch: Sketch, data: any, index: number, type: 'horizontal' | 'vertical') {
        const p1 = getConstraintPointPosition(sketch, data.points[0]);
        const p2 = getConstraintPointPosition(sketch, data.points[1]);
        if (!p1 || !p2) return;

        const dimStyle = data.style;
        const color = dimStyle.driven ? 0x888888 : 0x00dddd;

        let dStart: [number, number];
        let dEnd: [number, number];

        if (type === 'horizontal') {
            const midY = (p1[1] + p2[1]) / 2;
            const dimY = midY + dimStyle.offset[1];
            dStart = [p1[0], dimY];
            dEnd = [p2[0], dimY];
        } else {
            const midX = (p1[0] + p2[0]) / 2;
            const dimX = midX + dimStyle.offset[0];
            dStart = [dimX, p1[1]];
            dEnd = [dimX, p2[1]];
        }

        this.createDimensionLine(sketch, p1, dStart, color);
        this.createDimensionLine(sketch, p2, dEnd, color);
        this.createDimensionLine(sketch, dStart, dEnd, color);

        const nx = type === 'horizontal' ? 1 : 0;
        const ny = type === 'horizontal' ? 0 : 1;

        this.createDimensionText(sketch, dStart, dEnd, data.value, color, index,
            type === 'horizontal' ? 'HorizontalDistance' : 'VerticalDistance',
            nx, ny
        );
    }

    private renderAngle(_sketch: Sketch, _data: any, _index: number) {
        // Complex angle rendering logic...
        // For brevity in this refactor step, I'll simplify or copy the core parts
        // Viewport.tsx lines 1668-1850
        // It handles 3-point angle, line-line angle.
        // I will implement a placeholder for now to keep file size manageable
        // and add full logic in a dedicated update
    }

    private renderRadius(sketch: Sketch, data: any, _index: number) {
        const center = getConstraintPointPosition(sketch, data.center);
        if (!center) return;

        const dimStyle = data.style;
        const val = data.value;
        const angle = dimStyle.offset[0] || 0; // Or whatever stores the angle

        const r = val;
        // Direction vector from center
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        // const pOnCircle: [number, number] = [center[0] + dx * r, center[1] + dy * r];
        const pEnd: [number, number] = [center[0] + dx * (r + 2), center[1] + dy * (r + 2)];

        const color = dimStyle.driven ? 0x888888 : 0x00dddd;

        this.createDimensionLine(sketch, center, pEnd, color);
        // Arrow head?

        // Text
        const pos = sketchToWorld(pEnd[0], pEnd[1], sketch.plane);
        const sprite = createTextSprite(`R${val.toFixed(2)}`, color === 0x888888 ? "#888888" : "#00dddd", 0.03);
        sprite.position.copy(pos);
        this.group.add(sprite);
    }

    private renderPointLineDistance(sketch: Sketch, data: any, index: number) {
        const point = getConstraintPointPosition(sketch, data.point);
        const entity = getEntityById(sketch, data.line);

        if (!point || !entity || !entity.geometry.Line) {
            console.warn('[DimensionRenderer] renderPointLineDistance missing data:', { point, entityFound: !!entity, isLine: entity?.geometry?.Line });
            return;
        }

        const line = entity.geometry.Line;
        const ldx = line.end[0] - line.start[0];
        const ldy = line.end[1] - line.start[1];
        const lineLen = Math.sqrt(ldx * ldx + ldy * ldy);

        if (lineLen < 0.0001) return;

        // Line direction (normalized)
        const lnx = ldx / lineLen;
        const lny = ldy / lineLen;

        // Project point onto line (infinite)
        const vx = point[0] - line.start[0];
        const vy = point[1] - line.start[1];
        const t = vx * lnx + vy * lny;

        const projX = line.start[0] + lnx * t;
        const projY = line.start[1] + lny * t;
        const proj: [number, number] = [projX, projY];

        // === Match Distance dimension pattern ===
        // "p1" = proj (point on line)
        // "p2" = point (the actual point)
        // Measurement direction: from proj to point
        let dx = point[0] - proj[0];
        let dy = point[1] - proj[1];
        let len = Math.sqrt(dx * dx + dy * dy);

        if (len < 0.0001) {
            // Point is on the line - use perpendicular to line
            dx = -lny;
            dy = lnx;
            len = 1;
        }

        // nx, ny = measurement direction (from proj to point)
        const nx = dx / len;
        const ny = dy / len;

        // px, py = perpendicular (along reference line direction)
        const px = -ny;
        const py = nx;

        // style may be absent; default to non-driven
        const color = data.style?.driven ? 0x888888 : 0x00dddd;

        // Get offset from style (default [0, 0])
        // offset[1] = perpendicular offset (how far to shift the dimension line sideways)
        const offset = data.style?.offset || [0, 0];
        const offsetDist = 1.0 + offset[1];

        // Offset in perpendicular direction
        const evX = px * offsetDist;
        const evY = py * offsetDist;

        // dStart = proj offset perpendicular
        const dStart: [number, number] = [proj[0] + evX, proj[1] + evY];

        // dEnd = point PROJECTED onto line from dStart in direction nx,ny
        const v2x = point[0] - dStart[0];
        const v2y = point[1] - dStart[1];
        const dot = v2x * nx + v2y * ny;
        const dEnd: [number, number] = [dStart[0] + nx * dot, dStart[1] + ny * dot];

        // Draw leader lines from original positions to offset dimension line
        this.createDimensionLine(sketch, proj, dStart, color);
        this.createDimensionLine(sketch, point, dEnd, color);
        // Draw the dimension line itself
        this.createDimensionLine(sketch, dStart, dEnd, color);

        // Text at dimension line
        this.createDimensionText(sketch, dStart, dEnd, data.value, color, index, 'DistancePointLine', nx, ny);
    }

    private createDimensionLine(sketch: Sketch, start: [number, number], end: [number, number], color: number) {
        const v1 = sketchToWorld(start[0], start[1], sketch.plane);
        const v2 = sketchToWorld(end[0], end[1], sketch.plane);

        const geo = new LineSegmentsGeometry();
        geo.setPositions([v1.x, v1.y, v1.z, v2.x, v2.y, v2.z]);

        const mat = new LineMaterial({
            color,
            linewidth: 2, // Thicker than 1px
            resolution: this.resolution,
            depthTest: false
        });
        const line = new LineSegments2(geo, mat);
        line.computeLineDistances();
        this.group.add(line);
    }

    private createDimensionText(
        sketch: Sketch,
        start: [number, number],
        end: [number, number],
        value: number,
        color: number,
        index: number,
        type: string,
        nx: number,
        ny: number
    ) {
        const midX = (start[0] + end[0]) / 2;
        const midY = (start[1] + end[1]) / 2;

        const pos = sketchToWorld(midX, midY, sketch.plane);
        const colorStr = color === 0x888888 ? "#888888" : "#00dddd";
        const sprite = createTextSprite(value.toFixed(2), colorStr, 0.03);
        sprite.position.copy(pos);
        // Slightly forward for text
        // In local space z=0.02
        // We added group z offset, but sprite might need its own

        this.group.add(sprite);

        // Hitbox - DEBUG: Making visible and larger to debug
        const textStr = value.toFixed(2);
        // Increase size for better click detection
        const textWidth = textStr.length * 0.05; // Was 0.025
        const textHeight = 0.15; // Was 0.06

        const hitboxMat = new THREE.SpriteMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.3 }); // Was 0.0
        const hitbox = new THREE.Sprite(hitboxMat);
        hitbox.position.copy(pos);
        hitbox.scale.set(textWidth * 2, textHeight * 2, 1);
        console.log('[DimensionRenderer] Created hitbox:', { pos, scale: hitbox.scale, type, index });
        hitbox.userData = {
            isDimensionHitbox: true,
            index,
            type,
            dirX: nx,
            dirY: ny
        };
        this.group.add(hitbox);
    }

    public clear() {
        // Dispose logic..
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) (child as any).material.dispose();
        }
    }

    public getGroup() {
        return this.group;
    }

    /**
     * Render temporary, non-driving measurements
     * These have distinct visual styling (magenta/purple) to differentiate from constraints
     */
    public renderMeasurements(sketch: Sketch | null, measurements: ActiveMeasurement[]) {
        if (!sketch || !measurements || measurements.length === 0) return;

        // Measurement color (magenta/purple to differentiate from cyan dimensions)
        const MEASURE_COLOR = 0xff00ff;
        const MEASURE_COLOR_STR = '#ff00ff';

        measurements.forEach((measurement, index) => {
            if (!measurement.result) return;

            const result = measurement.result;
            const displayPos = measurement.displayPosition || [0, 0];

            try {
                // Render based on measurement type
                if ('Distance' in result && result.Distance) {
                    // Get entity positions
                    const p1 = getConstraintPointPosition(sketch, { id: measurement.entity1Id, index: measurement.point1Index });
                    const p2 = getConstraintPointPosition(sketch, { id: measurement.entity2Id, index: measurement.point2Index });

                    if (p1 && p2) {
                        // Draw measurement line
                        this.createMeasurementLine(sketch, p1, p2, MEASURE_COLOR);

                        // Draw text at display position
                        const valueObj = getMeasurementValue(result);
                        if (valueObj !== null) {
                            const pos = sketchToWorld(displayPos[0], displayPos[1], sketch.plane);
                            const sprite = createTextSprite(`📏 ${valueObj.value.toFixed(2)}`, MEASURE_COLOR_STR, 0.035);
                            sprite.position.copy(pos);
                            this.group.add(sprite);
                        }
                    }
                } else if ('Angle' in result && result.Angle) {
                    // Angle measurement
                    const valueObj = getMeasurementValue(result);
                    if (valueObj !== null) {
                        const degrees = (valueObj.value * 180 / Math.PI).toFixed(1);
                        const pos = sketchToWorld(displayPos[0], displayPos[1], sketch.plane);
                        const sprite = createTextSprite(`📐 ${degrees}°`, MEASURE_COLOR_STR, 0.035);
                        sprite.position.copy(pos);
                        this.group.add(sprite);
                    }
                } else if ('Radius' in result && result.Radius) {
                    // Radius measurement  
                    const valueObj = getMeasurementValue(result);
                    if (valueObj !== null) {
                        const pos = sketchToWorld(displayPos[0], displayPos[1], sketch.plane);
                        const sprite = createTextSprite(`⭕ R${valueObj.value.toFixed(2)}`, MEASURE_COLOR_STR, 0.035);
                        sprite.position.copy(pos);
                        this.group.add(sprite);
                    }
                }
            } catch (e) {
                console.error('[DimensionRenderer] Error rendering measurement:', index, measurement, e);
            }
        });
    }

    /**
     * Create a measurement line with distinct styling (thicker, magenta)
     */
    private createMeasurementLine(sketch: Sketch, start: [number, number], end: [number, number], color: number) {
        const v1 = sketchToWorld(start[0], start[1], sketch.plane);
        const v2 = sketchToWorld(end[0], end[1], sketch.plane);

        const geo = new LineSegmentsGeometry();
        geo.setPositions([v1.x, v1.y, v1.z, v2.x, v2.y, v2.z]);

        // Use thicker line and magenta color for measurements
        const mat = new LineMaterial({
            color,
            linewidth: 3,
            resolution: this.resolution,
            depthTest: false,
            dashed: true,
            dashSize: 0.1,
            gapSize: 0.05
        });
        const line = new LineSegments2(geo, mat);
        line.computeLineDistances();
        this.group.add(line);
    }
}

