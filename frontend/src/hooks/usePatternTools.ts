/**
 * usePatternTools - Hook for sketch pattern operations (Mirror, Linear Pattern, Circular Pattern)
 * 
 * Extracted from useSketching.ts to reduce complexity.
 * Handles the confirmation logic for pattern tools after user sets parameters.
 */

import { type Sketch, type SketchEntity, type SketchConstraint, wrapConstraint } from '../types';

export interface MirrorState {
    axis: string | null;
    entities: string[];
    activeField: 'axis' | 'entities';
    previewGeometry: SketchEntity[];
}

export interface LinearPatternState {
    direction: string | null;
    entities: string[];
    count: number;
    spacing: number;
    flipDirection: boolean;
    activeField: 'direction' | 'entities';
    previewGeometry: SketchEntity[];
}

export interface CircularPatternState {
    center: string | null;
    entities: string[];
    count: number;
    angle: number;
    activeField: 'center' | 'entities';
    previewGeometry: SketchEntity[];
}

/**
 * Reflect a point across a line (for mirror tool)
 */
export function reflectPoint(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number]
): [number, number] {
    const x1 = lineStart[0], y1 = lineStart[1];
    const x2 = lineEnd[0], y2 = lineEnd[1];
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.0001) return point; // Degenerate line
    const a = (dx * dx - dy * dy) / lenSq;
    const b = 2 * dx * dy / lenSq;
    const px = point[0] - x1;
    const py = point[1] - y1;
    const x2_p = a * px + b * py + x1;
    const y2_p = b * px - a * py + y1;
    return [x2_p, y2_p];
}

/**
 * Translate a point by a direction vector scaled by distance
 */
export function translatePoint(
    point: [number, number],
    direction: [number, number], // Normalized direction
    distance: number
): [number, number] {
    return [
        point[0] + direction[0] * distance,
        point[1] + direction[1] * distance
    ];
}

/**
 * Rotate a point around a center by an angle (radians)
 */
export function rotatePoint(
    point: [number, number],
    center: [number, number],
    angle: number
): [number, number] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    return [
        center[0] + dx * cos - dy * sin,
        center[1] + dx * sin + dy * cos
    ];
}

/**
 * Mirror an entity across an axis line
 */
export function mirrorEntity(
    entity: SketchEntity,
    axisStart: [number, number],
    axisEnd: [number, number],
    axisId: string
): { entity: SketchEntity; constraints: SketchConstraint[] } | null {
    const newId = crypto.randomUUID();
    const constraints: SketchConstraint[] = [];

    const reflect = (p: [number, number]) => reflectPoint(p, axisStart, axisEnd);

    let newGeo: any = null;

    if (entity.geometry.Point) {
        newGeo = { Point: { pos: reflect(entity.geometry.Point.pos) } };
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
    } else if (entity.geometry.Line) {
        const l = entity.geometry.Line;
        newGeo = { Line: { start: reflect(l.start), end: reflect(l.end) } };
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 1 }, p2: { id: newId, index: 1 }, axis: axisId } });
    } else if (entity.geometry.Circle) {
        const c = entity.geometry.Circle;
        newGeo = { Circle: { center: reflect(c.center), radius: c.radius } };
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        constraints.push({ Equal: { entities: [entity.id, newId] } });
    } else if (entity.geometry.Arc) {
        const arc = entity.geometry.Arc;
        const startP: [number, number] = [
            arc.center[0] + arc.radius * Math.cos(arc.start_angle),
            arc.center[1] + arc.radius * Math.sin(arc.start_angle)
        ];
        const endP: [number, number] = [
            arc.center[0] + arc.radius * Math.cos(arc.end_angle),
            arc.center[1] + arc.radius * Math.sin(arc.end_angle)
        ];
        const newC = reflect(arc.center);
        const newStart = reflect(startP);
        const newEnd = reflect(endP);
        const newStartAngle = Math.atan2(newStart[1] - newC[1], newStart[0] - newC[0]);
        const newEndAngle = Math.atan2(newEnd[1] - newC[1], newEnd[0] - newC[0]);
        newGeo = { Arc: { center: newC, radius: arc.radius, start_angle: newStartAngle, end_angle: newEndAngle } };
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 1 }, p2: { id: newId, index: 1 }, axis: axisId } });
        constraints.push({ Symmetric: { p1: { id: entity.id, index: 2 }, p2: { id: newId, index: 2 }, axis: axisId } });
    }

    if (!newGeo) return null;

    return {
        entity: { id: newId, geometry: newGeo, is_construction: false },
        constraints
    };
}

/**
 * Translate an entity by a direction vector (for linear pattern)
 */
export function translateEntity(
    entity: SketchEntity,
    direction: [number, number],
    distance: number
): SketchEntity | null {
    const newId = crypto.randomUUID();
    const translate = (p: [number, number]) => translatePoint(p, direction, distance);

    let newGeo: any = null;

    if (entity.geometry.Point) {
        newGeo = { Point: { pos: translate(entity.geometry.Point.pos) } };
    } else if (entity.geometry.Line) {
        const l = entity.geometry.Line;
        newGeo = { Line: { start: translate(l.start), end: translate(l.end) } };
    } else if (entity.geometry.Circle) {
        const c = entity.geometry.Circle;
        newGeo = { Circle: { center: translate(c.center), radius: c.radius } };
    } else if (entity.geometry.Arc) {
        const arc = entity.geometry.Arc;
        newGeo = { Arc: { center: translate(arc.center), radius: arc.radius, start_angle: arc.start_angle, end_angle: arc.end_angle } };
    } else if (entity.geometry.Ellipse) {
        const e = entity.geometry.Ellipse;
        newGeo = { Ellipse: { center: translate(e.center), semi_major: e.semi_major, semi_minor: e.semi_minor, rotation: e.rotation } };
    }

    if (!newGeo) return null;

    return { id: newId, geometry: newGeo, is_construction: false };
}

/**
 * Rotate an entity around a center point (for circular pattern)
 */
export function rotateEntity(
    entity: SketchEntity,
    center: [number, number],
    angle: number
): SketchEntity | null {
    const newId = crypto.randomUUID();
    const rotate = (p: [number, number]) => rotatePoint(p, center, angle);

    let newGeo: any = null;

    if (entity.geometry.Point) {
        newGeo = { Point: { pos: rotate(entity.geometry.Point.pos) } };
    } else if (entity.geometry.Line) {
        const l = entity.geometry.Line;
        newGeo = { Line: { start: rotate(l.start), end: rotate(l.end) } };
    } else if (entity.geometry.Circle) {
        const c = entity.geometry.Circle;
        newGeo = { Circle: { center: rotate(c.center), radius: c.radius } };
    } else if (entity.geometry.Arc) {
        const arc = entity.geometry.Arc;
        newGeo = {
            Arc: {
                center: rotate(arc.center),
                radius: arc.radius,
                start_angle: arc.start_angle + angle,
                end_angle: arc.end_angle + angle
            }
        };
    } else if (entity.geometry.Ellipse) {
        const e = entity.geometry.Ellipse;
        newGeo = {
            Ellipse: {
                center: rotate(e.center),
                semi_major: e.semi_major,
                semi_minor: e.semi_minor,
                rotation: e.rotation + angle
            }
        };
    }

    if (!newGeo) return null;

    return { id: newId, geometry: newGeo, is_construction: false };
}

/**
 * Execute mirror operation on a sketch
 */
export function executeMirror(
    sketch: Sketch,
    mirrorState: MirrorState
): Sketch | null {
    const { axis: axisId, entities: entitiesToMirror } = mirrorState;
    if (!axisId || entitiesToMirror.length === 0) return null;

    const axisEnt = sketch.entities.find(e => e.id === axisId);
    if (!axisEnt || !axisEnt.geometry.Line) return null;

    const ae = axisEnt.geometry.Line;
    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];

    for (const targetId of entitiesToMirror) {
        const targetEnt = sketch.entities.find(e => e.id === targetId);
        if (!targetEnt) continue;

        const result = mirrorEntity(targetEnt, ae.start, ae.end, axisId);
        if (result) {
            newEntities.push(result.entity);
            newConstraints.push(...result.constraints);
        }
    }

    const updated = { ...sketch };
    updated.entities = [...updated.entities, ...newEntities];
    updated.constraints = [...updated.constraints, ...newConstraints.map(c => wrapConstraint(c))];
    updated.history = [
        ...(updated.history || []),
        ...newEntities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
        ...newConstraints.map(c => ({ AddConstraint: { constraint: c } }))
    ];

    return updated;
}

/**
 * Execute linear pattern operation on a sketch
 */
export function executeLinearPattern(
    sketch: Sketch,
    patternState: LinearPatternState
): Sketch | null {
    const { direction: directionId, entities: entitiesToPattern, count, spacing, flipDirection } = patternState;
    if (!directionId || entitiesToPattern.length === 0 || count < 2) return null;

    const dirEnt = sketch.entities.find(e => e.id === directionId);
    if (!dirEnt || !dirEnt.geometry.Line) return null;

    const de = dirEnt.geometry.Line;
    const dx = de.end[0] - de.start[0];
    const dy = de.end[1] - de.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return null;

    const direction: [number, number] = flipDirection
        ? [-(dx / len), -(dy / len)]
        : [dx / len, dy / len];

    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];

    for (let i = 1; i < count; i++) {
        const dist = spacing * i;
        for (const targetId of entitiesToPattern) {
            const targetEnt = sketch.entities.find(e => e.id === targetId);
            if (!targetEnt) continue;

            const translated = translateEntity(targetEnt, direction, dist);
            if (translated) {
                newEntities.push(translated);
                // Add Equal constraint for lines, circles, and arcs
                if (targetEnt.geometry.Line || targetEnt.geometry.Circle || targetEnt.geometry.Arc) {
                    newConstraints.push({ Equal: { entities: [targetId, translated.id] } });
                }
            }
        }
    }

    const updated = { ...sketch };
    updated.entities = [...updated.entities, ...newEntities];
    updated.constraints = [...updated.constraints, ...newConstraints.map(c => wrapConstraint(c))];
    updated.history = [
        ...(updated.history || []),
        ...newEntities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
        ...newConstraints.map(c => ({ AddConstraint: { constraint: c } }))
    ];

    return updated;
}

/**
 * Execute circular pattern operation on a sketch
 */
export function executeCircularPattern(
    sketch: Sketch,
    patternState: CircularPatternState
): Sketch | null {
    const { center: centerId, entities: entitiesToPattern, count, angle: totalAngle } = patternState;
    if (!centerId || entitiesToPattern.length === 0 || count < 2) return null;

    // Get center point
    let center: [number, number] | null = null;
    if (centerId === 'origin') {
        center = [0, 0];
    } else {
        const centerEnt = sketch.entities.find(e => e.id === centerId);
        if (centerEnt?.geometry.Point) {
            center = centerEnt.geometry.Point.pos;
        } else if (centerEnt?.geometry.Circle) {
            center = centerEnt.geometry.Circle.center;
        } else if (centerEnt?.geometry.Arc) {
            center = centerEnt.geometry.Arc.center;
        }
    }
    if (!center) return null;

    const angleStep = (totalAngle * Math.PI / 180) / (count - 1);

    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];

    for (let i = 1; i < count; i++) {
        const rotAngle = angleStep * i;
        for (const targetId of entitiesToPattern) {
            const targetEnt = sketch.entities.find(e => e.id === targetId);
            if (!targetEnt) continue;

            const rotated = rotateEntity(targetEnt, center, rotAngle);
            if (rotated) {
                newEntities.push(rotated);
                // Add Equal constraint for lines, circles, and arcs
                if (targetEnt.geometry.Line || targetEnt.geometry.Circle || targetEnt.geometry.Arc) {
                    newConstraints.push({ Equal: { entities: [targetId, rotated.id] } });
                }
            }
        }
    }

    const updated = { ...sketch };
    updated.entities = [...updated.entities, ...newEntities];
    updated.constraints = [...updated.constraints, ...newConstraints.map(c => wrapConstraint(c))];
    updated.history = [
        ...(updated.history || []),
        ...newEntities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
        ...newConstraints.map(c => ({ AddConstraint: { constraint: c } }))
    ];

    return updated;
}

// ===== PATTERN PREVIEW GENERATION =====
// Extracted from useSketching.ts patternPreview memo

/**
 * Extended state interface for circular pattern (as used in useSketching.ts)
 */
export interface CircularPatternStateExtended {
    centerId: string | null;
    entities: string[];
    count: number;
    totalAngle: number;
    activeField: 'center' | 'entities';
    centerType: 'point' | 'origin' | null;
    flipDirection: boolean;
    previewGeometry: SketchEntity[];
}

/**
 * Generate preview entities for linear pattern without committing to sketch
 */
export function generateLinearPatternPreview(
    sketch: Sketch,
    state: LinearPatternState
): SketchEntity[] {
    const { direction: directionId, entities: entitiesToPattern, count, spacing, flipDirection } = state;
    if (!directionId || entitiesToPattern.length === 0 || count < 2) return [];

    const dirEnt = sketch.entities.find(e => e.id === directionId);
    if (!dirEnt || !dirEnt.geometry.Line) return [];

    const de = dirEnt.geometry.Line;
    const dx = de.end[0] - de.start[0];
    const dy = de.end[1] - de.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return [];

    let nx = dx / len;
    let ny = dy / len;
    if (flipDirection) {
        nx = -nx;
        ny = -ny;
    }
    const direction: [number, number] = [nx, ny];

    const newEntities: SketchEntity[] = [];

    for (let copyIdx = 1; copyIdx < count; copyIdx++) {
        const dist = spacing * copyIdx;
        for (const targetId of entitiesToPattern) {
            const targetEnt = sketch.entities.find(e => e.id === targetId);
            if (!targetEnt) continue;

            let newGeo: any = null;
            if (targetEnt.geometry.Point) {
                newGeo = { Point: { pos: translatePoint(targetEnt.geometry.Point.pos, direction, dist) } };
            } else if (targetEnt.geometry.Line) {
                const l = targetEnt.geometry.Line;
                newGeo = { Line: { start: translatePoint(l.start, direction, dist), end: translatePoint(l.end, direction, dist) } };
            } else if (targetEnt.geometry.Circle) {
                const c = targetEnt.geometry.Circle;
                newGeo = { Circle: { center: translatePoint(c.center, direction, dist), radius: c.radius } };
            } else if (targetEnt.geometry.Arc) {
                const arc = targetEnt.geometry.Arc;
                newGeo = { Arc: { center: translatePoint(arc.center, direction, dist), radius: arc.radius, start_angle: arc.start_angle, end_angle: arc.end_angle } };
            }

            if (newGeo) {
                newEntities.push({ id: crypto.randomUUID(), geometry: newGeo, is_construction: false });
            }
        }
    }

    return newEntities;
}

/**
 * Generate preview entities for circular pattern without committing to sketch
 */
export function generateCircularPatternPreview(
    sketch: Sketch,
    state: CircularPatternStateExtended
): SketchEntity[] {
    const { entities: entitiesToPattern, count, flipDirection, totalAngle, centerType, centerId } = state;
    const totalAngleRad = (flipDirection ? -1 : 1) * totalAngle * Math.PI / 180;
    if (entitiesToPattern.length === 0 || count < 2) return [];

    // Get center point
    let center: [number, number] = [0, 0];
    if (centerType === 'point' && centerId) {
        const centerEnt = sketch.entities.find(e => e.id === centerId);
        if (centerEnt?.geometry.Point) {
            center = centerEnt.geometry.Point.pos;
        } else if (centerEnt?.geometry.Circle) {
            center = centerEnt.geometry.Circle.center;
        } else if (centerEnt?.geometry.Arc) {
            center = centerEnt.geometry.Arc.center;
        } else {
            if (!centerEnt) return [];
        }
    } else if (centerType === 'point' && !centerId) {
        return [];
    }
    // If centerType === 'origin', center stays [0,0]

    const newEntities: SketchEntity[] = [];

    for (let copyIdx = 1; copyIdx < count; copyIdx++) {
        const angle = totalAngleRad * copyIdx / count;
        for (const targetId of entitiesToPattern) {
            const targetEnt = sketch.entities.find(e => e.id === targetId);
            if (!targetEnt) continue;

            let newGeo: any = null;
            if (targetEnt.geometry.Point) {
                newGeo = { Point: { pos: rotatePoint(targetEnt.geometry.Point.pos, center, angle) } };
            } else if (targetEnt.geometry.Line) {
                const l = targetEnt.geometry.Line;
                newGeo = { Line: { start: rotatePoint(l.start, center, angle), end: rotatePoint(l.end, center, angle) } };
            } else if (targetEnt.geometry.Circle) {
                const c = targetEnt.geometry.Circle;
                newGeo = { Circle: { center: rotatePoint(c.center, center, angle), radius: c.radius } };
            } else if (targetEnt.geometry.Arc) {
                const arc = targetEnt.geometry.Arc;
                newGeo = { Arc: { center: rotatePoint(arc.center, center, angle), radius: arc.radius, start_angle: arc.start_angle + angle, end_angle: arc.end_angle + angle } };
            }

            if (newGeo) {
                newEntities.push({ id: crypto.randomUUID(), geometry: newGeo, is_construction: false });
            }
        }
    }

    return newEntities;
}

