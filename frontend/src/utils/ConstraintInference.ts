/**
 * Constraint Inference Detection
 * 
 * Detects and previews constraints that would be applied during sketch drawing.
 * This provides visual feedback before the user clicks, making sketching feel
 * effortless and predictable (plan.md Principle 10).
 * 
 * Supported inferences:
 * - Coincident: Cursor near existing points
 * - Horizontal/Vertical: Line being drawn at ~0° or ~90°
 * - Parallel: Line being drawn parallel to existing line
 * - Perpendicular: Line being drawn perpendicular to existing line
 * - Tangent: Line/arc starting tangent to a circle/arc
 */

import type { Sketch, SnapPoint, SketchToolType } from '../types';


/** Types of constraints that can be inferred during drawing */
export type InferenceType =
    | 'coincident'
    | 'horizontal'
    | 'vertical'
    | 'parallel'
    | 'perpendicular'
    | 'tangent';

/** An inferred constraint preview */
export interface InferredConstraint {
    /** Type of inferred constraint */
    type: InferenceType;
    /** Entity IDs involved (for parallel/perpendicular) */
    entities: string[];
    /** Display position for the inference icon (2D sketch coords) */
    displayPosition: [number, number];
    /** Confidence score 0-1 (for display intensity) */
    confidence: number;
}

/** Configuration for inference detection */
export interface InferenceConfig {
    /** Angle tolerance for horizontal/vertical detection (radians) */
    angleTolerance: number;
    /** Angle tolerance for parallel/perpendicular detection (radians) */
    parallelTolerance: number;
    /** Maximum entities to check for parallel/perpendicular */
    maxParallelCandidates: number;
    /** Enable coincident inference */
    enableCoincident: boolean;
    /** Enable horizontal/vertical inference */
    enableHV: boolean;
    /** Enable parallel/perpendicular inference */
    enableParallelPerp: boolean;
}

/** Default inference configuration */
export const defaultInferenceConfig: InferenceConfig = {
    angleTolerance: 0.087,        // ~5 degrees
    parallelTolerance: 0.052,     // ~3 degrees
    maxParallelCandidates: 10,
    enableCoincident: true,
    enableHV: true,
    enableParallelPerp: true,
};

/**
 * Detect inferred constraints based on cursor position and sketch state.
 * 
 * @param cursor Current cursor position in sketch coords
 * @param startPoint Start point of line being drawn (null if not drawing)
 * @param sketch Current sketch state
 * @param activeTool Currently active drawing tool
 * @param currentSnap Current snap point (if any)
 * @param config Inference configuration
 * @returns Array of inferred constraints to preview
 */
export function detectInferredConstraints(
    cursor: [number, number],
    startPoint: [number, number] | null,
    sketch: Sketch,
    activeTool: SketchToolType,
    currentSnap: SnapPoint | null,
    config: InferenceConfig = defaultInferenceConfig
): InferredConstraint[] {
    const inferences: InferredConstraint[] = [];

    // Only infer during drawing tools
    const drawingTools: SketchToolType[] = ['line', 'rectangle', 'polygon', 'arc'];
    if (!drawingTools.includes(activeTool)) {
        return inferences;
    }

    // 1. Coincident inference (from snap point)
    if (config.enableCoincident && currentSnap) {
        if (currentSnap.snap_type === 'Endpoint' ||
            currentSnap.snap_type === 'Center' ||
            currentSnap.snap_type === 'Midpoint' ||
            currentSnap.snap_type === 'Intersection') {
            inferences.push({
                type: 'coincident',
                entities: currentSnap.entity_id ? [currentSnap.entity_id] : [],
                displayPosition: currentSnap.position,
                confidence: 1.0 - (currentSnap.distance / 0.5), // Higher when closer
            });
        } else if (currentSnap.snap_type === 'Origin') {
            inferences.push({
                type: 'coincident',
                entities: ['origin'],
                displayPosition: [0, 0],
                confidence: 1.0,
            });
        }
    }

    // 2. Horizontal/Vertical inference (during line drawing)
    // Suppress angular inferences if we are hard-snapping to geometry (Endpoint, etc), 
    // to avoid misleading icons when the tool ignores angular snap.
    const isHardSnap = currentSnap && currentSnap.snap_type !== 'Grid';

    if (config.enableHV && startPoint !== null && activeTool === 'line' && !isHardSnap) {
        const hvInference = detectHVInference(startPoint, cursor, config.angleTolerance);
        if (hvInference) {
            inferences.push(hvInference);
        }
    }

    // 3. Parallel/Perpendicular inference (during line drawing)
    if (config.enableParallelPerp && startPoint !== null && activeTool === 'line' && !isHardSnap) {
        const parallelInferences = detectParallelPerpInference(
            startPoint,
            cursor,
            sketch,
            config.parallelTolerance,
            config.maxParallelCandidates
        );
        inferences.push(...parallelInferences);
    }

    return inferences;
}

/**
 * Detect horizontal/vertical line inference
 */
function detectHVInference(
    startPoint: [number, number],
    cursor: [number, number],
    tolerance: number
): InferredConstraint | null {
    const dx = cursor[0] - startPoint[0];
    const dy = cursor[1] - startPoint[1];
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.01) return null; // Too short to determine angle

    const angle = Math.atan2(dy, dx);
    const absAngle = Math.abs(angle);

    // Check horizontal (near 0 or ±π)
    const horizontalDiff = Math.min(absAngle, Math.abs(absAngle - Math.PI));
    if (horizontalDiff < tolerance) {
        const confidence = 1.0 - (horizontalDiff / tolerance);
        return {
            type: 'horizontal',
            entities: [],
            displayPosition: [
                (startPoint[0] + cursor[0]) / 2,
                (startPoint[1] + cursor[1]) / 2
            ],
            confidence,
        };
    }

    // Check vertical (near ±π/2)
    const verticalDiff = Math.abs(absAngle - Math.PI / 2);
    if (verticalDiff < tolerance) {
        const confidence = 1.0 - (verticalDiff / tolerance);
        return {
            type: 'vertical',
            entities: [],
            displayPosition: [
                (startPoint[0] + cursor[0]) / 2,
                (startPoint[1] + cursor[1]) / 2
            ],
            confidence,
        };
    }

    return null;
}

/**
 * Detect parallel/perpendicular to existing lines
 */
function detectParallelPerpInference(
    startPoint: [number, number],
    cursor: [number, number],
    sketch: Sketch,
    tolerance: number,
    maxCandidates: number
): InferredConstraint[] {
    const inferences: InferredConstraint[] = [];

    const dx = cursor[0] - startPoint[0];
    const dy = cursor[1] - startPoint[1];
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.01) return inferences;

    const currentAngle = Math.atan2(dy, dx);

    // Collect lines from sketch (limit to maxCandidates)
    const lines: { id: string; angle: number; midpoint: [number, number] }[] = [];

    for (const entity of sketch.entities) {
        if (lines.length >= maxCandidates) break;
        if (entity.id.startsWith('preview_')) continue;

        if (entity.geometry.Line) {
            const { start, end } = entity.geometry.Line;
            const lDx = end[0] - start[0];
            const lDy = end[1] - start[1];
            const lineAngle = Math.atan2(lDy, lDx);
            lines.push({
                id: entity.id,
                angle: lineAngle,
                midpoint: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
            });
        }
    }

    // Check each line for parallel/perpendicular
    for (const line of lines) {
        // Normalized angle difference for parallel check
        let angleDiff = Math.abs(currentAngle - line.angle);
        // Normalize to [0, π] since lines are undirected
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff > Math.PI / 2) angleDiff = Math.PI - angleDiff;

        // Parallel: angle difference near 0 (or π for opposite direction)
        if (angleDiff < tolerance) {
            inferences.push({
                type: 'parallel',
                entities: [line.id],
                displayPosition: [
                    (startPoint[0] + cursor[0]) / 2,
                    (startPoint[1] + cursor[1]) / 2
                ],
                confidence: 1.0 - (angleDiff / tolerance),
            });
            // Only report one parallel inference
            break;
        }

        // Perpendicular: angle difference near π/2
        const perpDiff = Math.abs(angleDiff - Math.PI / 2);
        if (perpDiff < tolerance) {
            inferences.push({
                type: 'perpendicular',
                entities: [line.id],
                displayPosition: [
                    (startPoint[0] + cursor[0]) / 2,
                    (startPoint[1] + cursor[1]) / 2
                ],
                confidence: 1.0 - (perpDiff / tolerance),
            });
            // Only report one perpendicular inference
            break;
        }
    }

    return inferences;
}

/**
 * Check if a specific inference type is present in the list
 */
export function hasInference(
    inferences: InferredConstraint[],
    type: InferenceType
): boolean {
    return inferences.some(i => i.type === type);
}

/**
 * Get the strongest inference of a given type
 */
export function getStrongestInference(
    inferences: InferredConstraint[],
    type: InferenceType
): InferredConstraint | null {
    const ofType = inferences.filter(i => i.type === type);
    if (ofType.length === 0) return null;
    return ofType.reduce((max, curr) => curr.confidence > max.confidence ? curr : max);
}
