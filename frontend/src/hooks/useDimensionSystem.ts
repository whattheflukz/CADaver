
import { createSignal, createEffect, type Accessor } from 'solid-js';
import {
    type Sketch,
    type SketchEntity,
    type SketchConstraint,
    type SelectionCandidate,
    type ActiveMeasurement,
    type MeasurementResult,
    wrapConstraint
} from '../types';

interface UseDimensionSystemProps {
    currentSketch: Accessor<Sketch>;
    setCurrentSketch: (s: Sketch) => void;
    sendSketchUpdate: (s: Sketch) => void;
    setSketchTool: (tool: string) => void;
    setEditingDimension: (d: any) => void;
    dimensionSelection: Accessor<SelectionCandidate[]>;
    setDimensionSelection: (s: SelectionCandidate[]) => void;
    measurementSelection: Accessor<SelectionCandidate[]>;
    setMeasurementSelection: (s: SelectionCandidate[]) => void;
    setMeasurementPending: (s: any) => void;
    measurementPending: Accessor<any>;
}

export function useDimensionSystem(props: UseDimensionSystemProps) {
    const {
        currentSketch,
        setCurrentSketch,
        sendSketchUpdate,
        setSketchTool,
        setEditingDimension,
        dimensionSelection,
        setDimensionSelection,
        measurementSelection: _measurementSelection,
        setMeasurementSelection,
        measurementPending: _measurementPending,
        setMeasurementPending
    } = props;

    // --- State ---
    const [dimensionProposedAction, setDimensionProposedAction] = createSignal<{
        label: string;
        type: "Distance" | "Angle" | "Radius" | "Length" | "DistancePointLine" | "DistanceParallelLines" | "HorizontalDistance" | "VerticalDistance" | "Unsupported";
        value?: number;
        isValid: boolean;
    } | null>(null);

    const [dimensionPlacementMode, setDimensionPlacementMode] = createSignal(false);
    const [dimensionMousePosition, setDimensionMousePosition] = createSignal<[number, number] | null>(null);
    const [activeMeasurements, setActiveMeasurements] = createSignal<ActiveMeasurement[]>([]);

    // --- Helpers ---
    const dist = (p1: [number, number], p2: [number, number]) => Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);

    const getEntityInfo = (c: SelectionCandidate, sketch: Sketch): { type: 'point' | 'line' | 'circle' | 'arc', pos?: [number, number], entity?: SketchEntity } | null => {
        if (c.type === 'origin') {
            return { type: 'point', pos: [0, 0] };
        }
        if (c.type === 'point' && c.position) {
            return { type: 'point', pos: c.position };
        }
        const entity = sketch.entities.find(e => e.id === c.id);
        if (!entity) return null;

        if (entity.geometry.Line) {
            if (c.type === 'point' && c.index !== undefined) {
                const pos = c.index === 0 ? entity.geometry.Line.start : entity.geometry.Line.end;
                return { type: 'point', pos, entity };
            }
            return { type: 'line', entity };
        }
        if (entity.geometry.Circle) {
            if (c.type === 'point') {
                return { type: 'point', pos: entity.geometry.Circle.center, entity };
            }
            return { type: 'circle', entity };
        }
        if (entity.geometry.Arc) {
            if (c.type === 'point') {
                return { type: 'point', pos: entity.geometry.Arc.center, entity };
            }
            return { type: 'arc', entity };
        }
        if (entity.geometry.Point) {
            return { type: 'point', pos: entity.geometry.Point.pos, entity };
        }
        return null;
    };

    const calculateMeasurement = (c1: SelectionCandidate, c2: SelectionCandidate): ActiveMeasurement | null => {
        const sketch = currentSketch();
        const info1 = getEntityInfo(c1, sketch);
        const info2 = getEntityInfo(c2, sketch);

        if (!info1 || !info2) return null;

        let result: MeasurementResult | null = null;
        let displayPosition: [number, number] = [0, 0];

        // Point to Point
        if (info1.type === 'point' && info2.type === 'point' && info1.pos && info2.pos) {
            result = { Distance: { value: dist(info1.pos, info2.pos) } };
            displayPosition = [(info1.pos[0] + info2.pos[0]) / 2, (info1.pos[1] + info2.pos[1]) / 2];
        }
        // Point to Line
        else if (info1.type === 'point' && info1.pos && info2.type === 'line' && info2.entity?.geometry.Line) {
            const line = info2.entity.geometry.Line;
            const p = info1.pos;
            const l1 = line.start;
            const l2 = line.end;

            const dx = l2[0] - l1[0];
            const dy = l2[1] - l1[1];
            const lenSq = dx * dx + dy * dy;

            if (lenSq < 1e-6) {
                result = { Distance: { value: dist(p, l1) } };
                displayPosition = [(p[0] + l1[0]) / 2, (p[1] + l1[1]) / 2];
            } else {
                const t = ((p[0] - l1[0]) * dx + (p[1] - l1[1]) * dy) / lenSq;
                const projection = [l1[0] + t * dx, l1[1] + t * dy] as [number, number];
                result = { Distance: { value: dist(p, projection) } };
                displayPosition = [(p[0] + projection[0]) / 2, (p[1] + projection[1]) / 2];
            }
        }
        // Line to Point (swap)
        else if (info1.type === 'line' && info1.entity?.geometry.Line && info2.type === 'point' && info2.pos) {
            return calculateMeasurement(c2, c1);
        }
        // Line to Line (parallel or angle)
        else if (info1.type === 'line' && info1.entity?.geometry.Line && info2.type === 'line' && info2.entity?.geometry.Line) {
            const line1 = info1.entity.geometry.Line;
            const line2 = info2.entity.geometry.Line;
            const dx1 = line1.end[0] - line1.start[0];
            const dy1 = line1.end[1] - line1.start[1];
            const dx2 = line2.end[0] - line2.start[0];
            const dy2 = line2.end[1] - line2.start[1];

            const crossProduct = dx1 * dy2 - dy1 * dx2;
            if (Math.abs(crossProduct) < 1e-6) { // Parallel
                const p = line1.start;
                const l1 = line2.start;
                const l2 = line2.end;
                const dx = l2[0] - l1[0];
                const dy = l2[1] - l1[1];
                const lenSq = dx * dx + dy * dy;

                if (lenSq < 1e-6) {
                    result = { Distance: { value: dist(p, l1) } };
                } else {
                    const t = ((p[0] - l1[0]) * dx + (p[1] - l1[1]) * dy) / lenSq;
                    const projection = [l1[0] + t * dx, l1[1] + t * dy] as [number, number];
                    result = { Distance: { value: dist(p, projection) } };
                }
                displayPosition = [(line1.start[0] + line1.end[0]) / 2, (line1.start[1] + line1.end[1]) / 2]; // Approximation
            } else { // Angle
                const angle1 = Math.atan2(dy1, dx1);
                const angle2 = Math.atan2(dy2, dx2);
                let angle = Math.abs(angle1 - angle2);
                if (angle > Math.PI) angle = 2 * Math.PI - angle;
                result = { Angle: { value: angle * 180 / Math.PI } };
                displayPosition = [
                    (line1.start[0] + line1.end[0] + line2.start[0] + line2.end[0]) / 4,
                    (line1.start[1] + line1.end[1] + line2.start[1] + line2.end[1]) / 4
                ];
            }
        }
        // Radius
        else if ((info1.type === 'circle' && info1.entity?.geometry.Circle) || (info1.type === 'arc' && info1.entity?.geometry.Arc)) {
            const rad = info1.type === 'circle' ? info1.entity!.geometry.Circle!.radius : info1.entity!.geometry.Arc!.radius;
            const center = info1.type === 'circle' ? info1.entity!.geometry.Circle!.center : info1.entity!.geometry.Arc!.center;
            result = { Radius: { value: rad } };
            displayPosition = center;
        }
        // Length
        else if (info1.type === 'line' && info1.entity?.geometry.Line && !info2) {
            const line = info1.entity!.geometry.Line!;
            result = { Distance: { value: dist(line.start, line.end) } };
            displayPosition = [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2];
        }

        if (result) {
            return {
                entity1Id: c1.id,
                point1Index: c1.index ?? -1,
                entity2Id: c2 ? c2.id : "",
                point2Index: c2 ? (c2.index ?? -1) : -1,
                result: result,
                displayPosition: displayPosition
            };
        }
        return null;
    };

    const getCandidatePosition = (c: SelectionCandidate, sketch: any): [number, number] | null => {
        if (c.type === "origin") return [0, 0];
        if (c.type === "point" && c.position) return c.position;

        const ent = sketch.entities.find((e: any) => e.id === c.id);
        if (!ent) return null;

        if (c.type === "point" && ent.geometry.Point) return ent.geometry.Point.pos;
        if (c.type === "entity") {
            if (ent.geometry.Line) return ent.geometry.Line.start;
            if (ent.geometry.Circle) return ent.geometry.Circle.center;
            if (ent.geometry.Arc) return ent.geometry.Arc.center;
        }
        return null;
    };

    /**
     * Determines dimension mode based on mouse position
     */
    const getDimensionModeFromMousePosition = (
        p1: [number, number],
        p2: [number, number],
        mousePos: [number, number] | null
    ): "Distance" | "HorizontalDistance" | "VerticalDistance" => {
        if (!mousePos) return "Distance";

        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        const [mx, my] = mousePos;
        const outsideHorizontally = mx < minX || mx > maxX;
        const outsideVertically = my < minY || my > maxY;

        if (outsideHorizontally && !outsideVertically) {
            return "HorizontalDistance";
        } else if (outsideVertically && !outsideHorizontally) {
            return "VerticalDistance";
        } else if (outsideHorizontally && outsideVertically) {
            const distToVerticalEdge = Math.min(Math.abs(mx - minX), Math.abs(mx - maxX));
            const distToHorizontalEdge = Math.min(Math.abs(my - minY), Math.abs(my - maxY));

            if (distToVerticalEdge < distToHorizontalEdge) {
                return "HorizontalDistance";
            } else {
                return "VerticalDistance";
            }
        }

        return "Distance";
    };

    /**
     * Analyze current selection to propose a dimension
     */
    const analyzeDimensionSelection = (candidates: SelectionCandidate[]) => {
        const sketch = currentSketch();

        if (candidates.length === 1) {
            const c = candidates[0];
            if (c.type === "entity") {
                const e = sketch.entities.find(ent => ent.id === c.id);
                if (e) {
                    if (e.geometry.Line) {
                        const { start, end } = e.geometry.Line;
                        const length = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
                        setDimensionProposedAction({
                            label: `Length (${length.toFixed(2)})`,
                            type: "Length",
                            value: length,
                            isValid: true
                        });
                        setDimensionPlacementMode(true);
                        return;
                    } else if (e.geometry.Circle) {
                        setDimensionProposedAction({
                            label: `Radius (R${e.geometry.Circle.radius.toFixed(2)})`,
                            type: "Radius",
                            value: e.geometry.Circle.radius,
                            isValid: true
                        });
                        setDimensionPlacementMode(true);
                        return;
                    } else if (e.geometry.Arc) {
                        setDimensionProposedAction({
                            label: `Radius (R${e.geometry.Arc.radius.toFixed(2)})`,
                            type: "Radius",
                            value: e.geometry.Arc.radius,
                            isValid: true
                        });
                        setDimensionPlacementMode(true);
                        return;
                    }
                }
            }
        } else if (candidates.length === 2) {
            const [c1, c2] = candidates;

            const isPointLike = (c: SelectionCandidate): boolean => {
                if (c.type === "point" || c.type === "origin") {
                    return true;
                }
                if (c.type === "entity") {
                    const e = sketch.entities.find(ent => ent.id === c.id);
                    return !!e?.geometry.Point;
                }
                return false;
            };

            if (isPointLike(c1) && isPointLike(c2)) {
                const p1 = getCandidatePosition(c1, sketch);
                const p2 = getCandidatePosition(c2, sketch);

                if (p1 && p2) {
                    const mousePos = dimensionMousePosition();
                    const mode = getDimensionModeFromMousePosition(p1, p2, mousePos);

                    let value = 0;
                    let label = "";

                    if (mode === "HorizontalDistance") {
                        value = Math.abs(p2[0] - p1[0]);
                        label = `Horizontal (${value.toFixed(2)})`;
                    } else if (mode === "VerticalDistance") {
                        value = Math.abs(p2[1] - p1[1]);
                        label = `Vertical (${value.toFixed(2)})`;
                    } else {
                        value = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
                        label = `Distance (${value.toFixed(2)})`;
                    }

                    setDimensionProposedAction({
                        label,
                        type: mode,
                        value,
                        isValid: true
                    });
                    setDimensionPlacementMode(true);
                    return;
                }
            }

            if ((isPointLike(c1) && c2.type === "entity") || (isPointLike(c2) && c1.type === "entity")) {
                const pointC = isPointLike(c1) ? c1 : c2;
                const lineC = isPointLike(c1) ? c2 : c1;

                const lineEnt = sketch.entities.find(e => e.id === lineC.id);
                if (lineEnt && lineEnt.geometry.Line) {
                    const p = getCandidatePosition(pointC, sketch);
                    const line = lineEnt.geometry.Line;

                    if (p) {
                        const dx = line.end[0] - line.start[0];
                        const dy = line.end[1] - line.start[1];
                        const len = Math.sqrt(dx * dx + dy * dy);

                        if (len > 0.0001) {
                            const nx = -dy / len;
                            const ny = dx / len;

                            const vx = p[0] - line.start[0];
                            const vy = p[1] - line.start[1];

                            const dist = Math.abs(vx * nx + vy * ny);

                            setDimensionProposedAction({
                                label: `Distance (${dist.toFixed(2)})`,
                                type: "DistancePointLine",
                                value: dist,
                                isValid: true,
                            });
                            setDimensionPlacementMode(true);
                            return;
                        }
                    }
                }
            }

            if (c1.type === "entity" && c2.type === "entity") {
                const e1 = sketch.entities.find(e => e.id === c1.id);
                const e2 = sketch.entities.find(e => e.id === c2.id);
                if (e1?.geometry.Line && e2?.geometry.Line) {
                    const l1 = e1.geometry.Line;
                    const l2 = e2.geometry.Line;

                    const dx1 = l1.end[0] - l1.start[0];
                    const dy1 = l1.end[1] - l1.start[1];
                    const dx2 = l2.end[0] - l2.start[0];
                    const dy2 = l2.end[1] - l2.start[1];

                    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (len1 > 0.0001 && len2 > 0.0001) {
                        const n1x = dx1 / len1, n1y = dy1 / len1;
                        const n2x = dx2 / len2, n2y = dy2 / len2;

                        const cross = n1x * n2y - n1y * n2x;
                        let isParallel = Math.abs(cross) < 0.1;

                        const hasParallelConstraint = sketch.constraints.some(entry => {
                            if ((entry as any).suppressed) return false;
                            const c = (entry as any).constraint;
                            if (c.Parallel) {
                                const [l1id, l2id] = c.Parallel.lines;
                                return (l1id === e1.id && l2id === e2.id) || (l1id === e2.id && l2id === e1.id);
                            }
                            if (c.Angle) {
                                const [l1id, l2id] = c.Angle.lines;
                                const sameLines = (l1id === e1.id && l2id === e2.id) || (l1id === e2.id && l2id === e1.id);
                                const angleValue = c.Angle.value;
                                const isZeroOrPi = Math.abs(angleValue) < 0.01 || Math.abs(angleValue - Math.PI) < 0.01;
                                return sameLines && isZeroOrPi;
                            }
                            return false;
                        });

                        if (hasParallelConstraint) {
                            isParallel = true;
                        }

                        if (isParallel) {
                            const l2MidX = (l2.start[0] + l2.end[0]) / 2;
                            const l2MidY = (l2.start[1] + l2.end[1]) / 2;

                            const nx = -n1y;
                            const ny = n1x;

                            const vx = l2MidX - l1.start[0];
                            const vy = l2MidY - l1.start[1];

                            const dist = Math.abs(vx * nx + vy * ny);

                            setDimensionProposedAction({
                                label: `Distance (${dist.toFixed(2)})`,
                                type: "DistanceParallelLines",
                                value: dist,
                                isValid: true
                            });
                            setDimensionPlacementMode(true);
                            return;
                        } else {
                            const dot = n1x * n2x + n1y * n2y;
                            const angle = Math.acos(Math.min(1, Math.max(-1, Math.abs(dot))));

                            setDimensionProposedAction({
                                label: `Angle (${(angle * 180 / Math.PI).toFixed(1)}°)`,
                                type: "Angle",
                                value: angle,
                                isValid: true
                            });
                            setDimensionPlacementMode(true);
                            return;
                        }
                    }
                }
            }

            if ((c1.type === "entity" && (c2.type === "point" || c2.type === "origin")) ||
                ((c1.type === "point" || c1.type === "origin") && c2.type === "entity")) {
                const lineCand = c1.type === "entity" ? c1 : c2;
                const pointCand = c1.type === "entity" ? c2 : c1;

                const e = sketch.entities.find(ent => ent.id === lineCand.id);
                if (e && e.geometry.Line) {
                    const p = getCandidatePosition(pointCand, sketch);
                    const { start, end } = e.geometry.Line;
                    let dist = 0;

                    if (p) {
                        const lx = end[0] - start[0];
                        const ly = end[1] - start[1];
                        const len = Math.sqrt(lx * lx + ly * ly);
                        if (len > 1e-9) {
                            const nx = -ly / len;
                            const ny = lx / len;
                            const vx = p[0] - start[0];
                            const vy = p[1] - start[1];
                            dist = Math.abs(vx * nx + vy * ny);
                        } else {
                            dist = Math.sqrt((start[0] - p[0]) ** 2 + (start[1] - p[1]) ** 2);
                        }
                    }

                    setDimensionProposedAction({
                        label: `Distance (Point to Line) (${dist.toFixed(2)})`,
                        type: "DistancePointLine",
                        value: dist,
                        isValid: true
                    });
                    setDimensionPlacementMode(true);
                    return;
                }
            }
        }

        setDimensionProposedAction(null);
        setDimensionPlacementMode(false);
    };


    /* ===== Effects ===== */
    createEffect(() => {
        // Dimension Preview Effect
        const sel = dimensionSelection();
        const _mousePos = dimensionMousePosition();
        if (sel.length > 0) {
            analyzeDimensionSelection(sel);
        } else {
            setDimensionProposedAction(null);
            setDimensionPlacementMode(false);
        }
    });


    /* ===== Handlers ===== */

    const handleDimensionFinish = (offsetOverride?: [number, number]) => {
        const action = dimensionProposedAction();
        const selections = dimensionSelection();
        if (!action || !action.isValid) return;

        const sketch = currentSketch();
        let constraint: SketchConstraint | null = null;

        if (action.type === "Length") {
            const c = selections[0];
            if (c && c.type === "entity") {
                constraint = {
                    Distance: {
                        points: [{ id: c.id, index: 0 }, { id: c.id, index: 1 }],
                        value: action.value!,
                        style: { driven: false, offset: offsetOverride || [0, 1.0] }
                    }
                };
            }
        } else if (action.type === "Radius") {
            const c = selections[0];
            if (c && c.type === "entity") {
                constraint = {
                    Radius: {
                        entity: c.id,
                        value: action.value!,
                        style: { driven: false, offset: offsetOverride || [0.7, 0.7] }
                    }
                };
            }
        } else if (action.type === "Angle") {
            const [c1, c2] = selections;
            constraint = {
                Angle: {
                    lines: [c1.id, c2.id],
                    value: action.value!,
                    style: { driven: false, offset: [0, 1.0] }
                }
            };
        } else if (action.type === "DistancePointLine") {
            const c1 = selections[0];
            const c2 = selections[1];
            const lineCand = c1.type === "entity" ? c1 : c2;
            const pointCand = c1.type === "entity" ? c2 : c1;

            const getConstraintPoint = (c: SelectionCandidate): { id: string, index: number } => {
                if (c.type === "origin") return { id: "00000000-0000-0000-0000-000000000000", index: 0 };
                return { id: c.id, index: c.index || 0 };
            };

            constraint = {
                DistancePointLine: {
                    point: getConstraintPoint(pointCand),
                    line: lineCand.id,
                    value: action.value!,
                }
            };
        } else if (action.type === "Distance" || action.type === "HorizontalDistance" || action.type === "VerticalDistance") {
            let p1: { id: string, index: number } | null = null;
            let p2: { id: string, index: number } | null = null;

            if (selections.length === 2) {
                const getPoint = (c: SelectionCandidate): { id: string, index: number } | null => {
                    if (c.type === "origin") return { id: "00000000-0000-0000-0000-000000000000", index: 0 };
                    if (c.type === "point") return { id: c.id, index: c.index || 0 };
                    if (c.type === "entity") return { id: c.id, index: c.index || 0 };
                    return null;
                };
                p1 = getPoint(selections[0]);
                p2 = getPoint(selections[1]);
            } else if (selections.length === 1 && selections[0].type === 'entity') {
                p1 = { id: selections[0].id, index: 0 };
                p2 = { id: selections[0].id, index: 1 };
            }

            if (p1 && p2) {
                if (action.type === "HorizontalDistance") {
                    constraint = {
                        HorizontalDistance: {
                            points: [p1, p2],
                            value: action.value!,
                            style: { driven: false, offset: offsetOverride || [0, 1.0] }
                        }
                    };
                } else if (action.type === "VerticalDistance") {
                    constraint = {
                        VerticalDistance: {
                            points: [p1, p2],
                            value: action.value!,
                            style: { driven: false, offset: offsetOverride || [0, 1.0] }
                        }
                    };
                } else {
                    constraint = {
                        Distance: {
                            points: [p1, p2],
                            value: action.value!,
                            style: { driven: false, offset: offsetOverride || [0, 1.0] }
                        }
                    };
                }
            }
        } else if (action.type === "DistanceParallelLines") {
            const [c1, c2] = selections;
            if (c1.type === "entity" && c2.type === "entity") {
                constraint = {
                    DistanceParallelLines: {
                        lines: [c1.id, c2.id],
                        value: action.value!,
                        style: { driven: false, offset: offsetOverride || [0, 1.0] }
                    }
                };
            }
        }

        if (constraint) {
            const updated = { ...sketch };
            updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
            updated.history = [...(updated.history || []), { AddConstraint: { constraint: constraint } }];
            setCurrentSketch(updated);
            sendSketchUpdate(updated);

            setEditingDimension({
                constraintIndex: updated.constraints.length - 1,
                type: action.type === 'Radius' ? 'Radius' : (action.type === 'Angle' ? 'Angle' : 'Distance'),
                currentValue: action.value!,
                isNew: true
            });
        }

        setDimensionSelection([]);
        setDimensionProposedAction(null);
        setDimensionPlacementMode(false);
        setSketchTool("select");
    };

    const handleDimensionCancel = () => {
        setDimensionSelection([]);
        setDimensionProposedAction(null);
        setDimensionPlacementMode(false);
        setSketchTool("select");
    };

    const handleDimensionDrag = (constraintIndex: number, newOffset: [number, number]) => {
        const sketch = currentSketch();
        if (constraintIndex < 0 || constraintIndex >= sketch.constraints.length) return;

        const updated = { ...sketch };
        const constraints = [...updated.constraints];
        const entry = constraints[constraintIndex];

        // Deep clone for safety
        const newEntry = JSON.parse(JSON.stringify(entry));

        // Access the actual constraint within the entry
        const c = newEntry.constraint || newEntry;

        // Update offset in style
        if (c.Distance && c.Distance.style) c.Distance.style.offset = newOffset;
        else if (c.HorizontalDistance && c.HorizontalDistance.style) c.HorizontalDistance.style.offset = newOffset;
        else if (c.VerticalDistance && c.VerticalDistance.style) c.VerticalDistance.style.offset = newOffset;
        else if (c.Angle && c.Angle.style) c.Angle.style.offset = newOffset;
        else if (c.Radius && c.Radius.style) c.Radius.style.offset = newOffset;
        else if (c.DistancePointLine && c.DistancePointLine.style) c.DistancePointLine.style.offset = newOffset;
        else if (c.DistanceParallelLines && c.DistanceParallelLines.style) c.DistanceParallelLines.style.offset = newOffset;

        constraints[constraintIndex] = newEntry;
        updated.constraints = constraints;
        setCurrentSketch(updated);
        // Do NOT send update on every drag frame - only update local state
    };

    const handleMeasurementClearPending = () => {
        setMeasurementSelection([]);
        setMeasurementPending(null);
        setActiveMeasurements([]);
    };




    return {
        dimensionProposedAction,
        setDimensionProposedAction,
        analyzeDimensionSelection,
        dimensionPlacementMode,
        setDimensionPlacementMode,
        activeMeasurements,
        setActiveMeasurements,
        dimensionMousePosition,
        setDimensionMousePosition,
        calculateMeasurement,
        handleDimensionFinish,
        handleDimensionCancel,
        handleDimensionDrag,
        handleMeasurementClearPending
    };

}
