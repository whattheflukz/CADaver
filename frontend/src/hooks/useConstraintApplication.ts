/**
 * useConstraintApplication - Handles automatic constraint creation when constraint tools are active.
 * Extracted from useSketching.ts to reduce file size.
 * 
 * When a constraint tool is selected and appropriate entities are selected,
 * this hook automatically creates and applies the constraint.
 */

import { createEffect } from 'solid-js';
import type { Sketch, SketchConstraint, SelectionCandidate } from '../types';
import { wrapConstraint } from '../types';

// Constants
const ORIGIN_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

// --- Helper Functions ---

/**
 * Get constraint point reference from a selection candidate.
 */
export function getConstraintPointFromCandidate(
    c: SelectionCandidate
): { id: string; index: number } | null {
    if (c.type === 'origin') return { id: ORIGIN_ENTITY_ID, index: 0 };
    if (c.type === 'point') return { id: c.id, index: c.index ?? 0 };
    if (c.type === 'entity') return { id: c.id, index: c.index ?? 0 };
    return null;
}

/**
 * Get 2D position from a selection candidate.
 */
export function getCandidatePosition2D(
    c: SelectionCandidate,
    sketch: Sketch
): [number, number] | null {
    if (c.type === 'origin') return [0, 0];
    if (c.type === 'point' && c.position) return c.position;

    const ent = sketch.entities.find(e => e.id === c.id);
    if (!ent) return null;

    if (ent.geometry.Point) return ent.geometry.Point.pos;
    if (ent.geometry.Line) {
        const idx = c.index ?? 0;
        return idx === 1 ? ent.geometry.Line.end : ent.geometry.Line.start;
    }
    if (ent.geometry.Circle) return ent.geometry.Circle.center;
    if (ent.geometry.Arc) return ent.geometry.Arc.center;
    if (ent.geometry.Ellipse) return ent.geometry.Ellipse.center;
    return null;
}

/**
 * Resolve entity ID from a selection candidate.
 */
export function resolveEntityIdFromSelectionCandidate(
    c: SelectionCandidate
): string | null {
    if (c.type === 'entity') return c.id;
    if (c.type === 'point') return c.id;
    return null;
}

// --- Constraint Building ---

/**
 * Build a constraint based on the active tool and selection.
 */
export function buildConstraintFromSelection(
    tool: string,
    sketch: Sketch,
    selection: SelectionCandidate[]
): SketchConstraint | null {
    const selectedEntityIds = Array.from(
        new Set(
            selection
                .map(resolveEntityIdFromSelectionCandidate)
                .filter((id): id is string => !!id)
        )
    );

    if (tool === 'constraint_horizontal' || tool === 'constraint_vertical') {
        if (selectedEntityIds.length === 1) {
            const ent = sketch.entities.find(e => e.id === selectedEntityIds[0]);
            if (ent?.geometry.Line) {
                return tool === 'constraint_horizontal'
                    ? { Horizontal: { entity: ent.id } }
                    : { Vertical: { entity: ent.id } };
            }
        }
    } else if (tool === 'constraint_parallel' || tool === 'constraint_perpendicular') {
        if (selectedEntityIds.length === 2) {
            const e1 = sketch.entities.find(e => e.id === selectedEntityIds[0]);
            const e2 = sketch.entities.find(e => e.id === selectedEntityIds[1]);
            if (e1?.geometry.Line && e2?.geometry.Line && e1.id !== e2.id) {
                return tool === 'constraint_parallel'
                    ? { Parallel: { lines: [e1.id, e2.id] } }
                    : { Perpendicular: { lines: [e1.id, e2.id] } };
            }
        }
    } else if (tool === 'constraint_equal') {
        if (selectedEntityIds.length === 2) {
            const e1 = sketch.entities.find(e => e.id === selectedEntityIds[0]);
            const e2 = sketch.entities.find(e => e.id === selectedEntityIds[1]);
            if (e1 && e2 && e1.id !== e2.id) {
                return { Equal: { entities: [e1.id, e2.id] } };
            }
        }
    } else if (tool === 'constraint_coincident') {
        if (selection.length === 2) {
            const p1 = getConstraintPointFromCandidate(selection[0]);
            const p2 = getConstraintPointFromCandidate(selection[1]);
            if (p1 && p2 && (p1.id !== p2.id || p1.index !== p2.index)) {
                return { Coincident: { points: [p1, p2] } };
            }
        }
    } else if (tool === 'constraint_fix') {
        if (selection.length === 1) {
            const p = getConstraintPointFromCandidate(selection[0]);
            const pos = getCandidatePosition2D(selection[0], sketch);
            if (p && pos) {
                return { Fix: { point: p, position: pos } };
            }
        }
    }

    return null;
}

// --- Hook ---

interface ConstraintApplicationConfig {
    sketchTool: () => string;
    currentSketch: () => Sketch;
    sketchSelection: () => SelectionCandidate[];
    setCurrentSketch: (s: Sketch) => void;
    sendSketchUpdate: (s: Sketch) => void;
    setConstraintSelection: (s: any[]) => void;
    setSketchSelection: (s: SelectionCandidate[]) => void;
    setSketchTool: (t: string) => void;
}

/**
 * Hook that auto-applies constraints when constraint tools are active.
 */
export function useConstraintApplication(config: ConstraintApplicationConfig): void {
    createEffect(() => {
        const tool = config.sketchTool();
        if (!tool.startsWith('constraint_')) return;

        const sk = config.currentSketch();
        const selNow = config.sketchSelection();

        const constraint = buildConstraintFromSelection(tool, sk, selNow);
        if (!constraint) return;

        const updated = { ...sk };
        updated.constraints = [...(updated.constraints || []), wrapConstraint(constraint)];
        updated.history = [...(updated.history || []), { AddConstraint: { constraint } }];

        config.setCurrentSketch(updated);
        config.sendSketchUpdate(updated);
        config.setConstraintSelection([]);
        config.setSketchSelection([]);
        config.setSketchTool('select');
    });
}
