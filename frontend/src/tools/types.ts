import type { Sketch, SketchEntity, SelectionCandidate, SnapPoint } from "../types";

export interface SketchToolContext {
    // State Accessors
    sketch: Sketch;
    selection: SelectionCandidate[];
    snapPoint: SnapPoint | null;
    constructionMode: boolean;

    // State Modifiers
    setSketch: (sketch: Sketch) => void;
    setSelection: (selection: SelectionCandidate[]) => void;
    setEditingDimension: (dim: any) => void;
    setTempPoint?: (pt: [number, number] | null) => void;

    // Dimension specific
    dimensionSelection?: SelectionCandidate[];
    setDimensionSelection?: (selection: SelectionCandidate[]) => void;
    commitDimension?: () => boolean;
    setDimensionMousePosition?: (pos: [number, number]) => void;

    // Measurement specific (temporary, non-driving)
    measurementSelection?: SelectionCandidate[];
    setMeasurementSelection?: (selection: SelectionCandidate[]) => void;
    calculateMeasurement?: (c1: SelectionCandidate, c2: SelectionCandidate) => any;
    addActiveMeasurement?: (measurement: any) => void;

    // Constraint Selection (for multi-click constraints)
    constraintSelection?: any[];
    setConstraintSelection?: (selection: any[]) => void;
    setTool?: (toolId: string) => void;

    // Actions
    sendUpdate: (sketch: Sketch) => void; // Trigger solver
    spawnEntity: (entity: SketchEntity) => void; // Add new entity helper

    // Command / Input
    getSketchAction?: (e: KeyboardEvent) => any;
}

export interface SketchTool {
    id: string;

    // Lifecycle
    onActivate?(): void;
    onDeactivate?(): void;

    // Mouse Events (coordinates in sketch plane local space)
    onMouseDown?(u: number, v: number, _e?: MouseEvent): void;
    onMouseMove?(u: number, v: number, _e?: MouseEvent): void;
    onMouseUp?(u: number, v: number, _e?: MouseEvent): void;

    // Keyboard Events
    onKeyDown?(e: KeyboardEvent): void;

    // Actions
    onCancel?(): void; // Esc key
}
