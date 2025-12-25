export interface Tessellation {
    vertices: number[];
    indices: number[];
    normals: number[];
    triangle_ids: any[];
    line_indices: number[];
    line_ids: any[];
    point_indices: number[];
    point_ids: any[];
}

export type FeatureType = 'Sketch' | 'Extrude' | 'Revolve' | 'Cut' | 'Plane' | 'Axis' | 'Point';

export interface Feature {
    id: string; // EntityId is UUID string
    name: string;
    feature_type: FeatureType;
    suppressed: boolean;
    parameters: Record<string, any>; // ParameterValue equivalent
    dependencies?: string[]; // IDs of features this feature depends on
}

// Graph structure from backend
export interface FeatureGraphState {
    nodes: Record<string, Feature>;
    sort_order: string[];
    variables?: VariableStore;
}

// Variable unit types (matching backend)
export type VariableUnit =
    | 'Dimensionless'
    | { Length: 'Millimeter' | 'Centimeter' | 'Meter' | 'Inch' | 'Foot' }
    | { Angle: 'Degrees' | 'Radians' };

// Global parametric variable
export interface Variable {
    id: string;
    name: string;
    description: string;
    expression: string;
    unit: VariableUnit;
    cached_value?: number;
    error?: string;
}

// Container for all variables
export interface VariableStore {
    variables: Record<string, Variable>;
    order: string[];
}


export interface SketchPlane {
    origin: [number, number, number];
    normal: [number, number, number];
    x_axis: [number, number, number];
    y_axis: [number, number, number];
}

export interface SketchGeometry {
    Line?: { start: [number, number], end: [number, number] };
    Circle?: { center: [number, number], radius: number };
    Arc?: { center: [number, number], radius: number, start_angle: number, end_angle: number };
    Point?: { pos: [number, number] };
    Ellipse?: { center: [number, number], semi_major: number, semi_minor: number, rotation: number };
}

export interface SketchEntity {
    id: string;
    geometry: SketchGeometry;
    is_construction?: boolean;
}

export type EntityId = string;

export interface ConstraintPoint {
    id: EntityId;
    index: number; // 0=Start/Center, 1=End
}

export interface SelectionCandidate {
    id: string; // entity ID or "ORIGIN"
    type: "entity" | "point" | "origin";
    index?: number; // for points (0=start, 1=end, etc)
    position?: [number, number];
}

/** Style configuration for visible dimension annotations */
export interface DimensionStyle {
    driven: boolean;    // true = reference-only, false = driving constraint
    offset: [number, number];  // Position offset for annotation text
    expression?: string;  // Optional expression (e.g., "@thickness") for re-evaluation when variables change
}

export interface SketchConstraint {
    Coincident?: { points: [ConstraintPoint, ConstraintPoint] };
    Horizontal?: { entity: EntityId };
    Vertical?: { entity: EntityId };
    Distance?: { points: [ConstraintPoint, ConstraintPoint], value: number, style?: DimensionStyle };
    Angle?: { lines: [EntityId, EntityId], value: number, style?: DimensionStyle };
    Radius?: { entity: EntityId, value: number, style?: DimensionStyle };
    Parallel?: { lines: [EntityId, EntityId] };
    Perpendicular?: { lines: [EntityId, EntityId] };
    Tangent?: { entities: [EntityId, EntityId] };
    Equal?: { entities: [EntityId, EntityId] };
    Symmetric?: { p1: ConstraintPoint, p2: ConstraintPoint, axis: EntityId };
    Fix?: { point: ConstraintPoint, position: [number, number] };
    DistancePointLine?: { point: ConstraintPoint, line: EntityId, value: number, style?: DimensionStyle };
}

/** Wrapper for constraints with suppression state */
export interface SketchConstraintEntry {
    constraint: SketchConstraint;
    suppressed?: boolean;
}

/** Helper to wrap a SketchConstraint in a SketchConstraintEntry */
export function wrapConstraint(constraint: SketchConstraint, suppressed: boolean = false): SketchConstraintEntry {
    return { constraint, suppressed };
}

export interface SketchOperation {
    AddGeometry?: { id: string, geometry: SketchGeometry };
    AddConstraint?: { constraint: SketchConstraint };
}

export interface Sketch {
    plane: any;
    entities: SketchEntity[];
    constraints: SketchConstraintEntry[];
    history: SketchOperation[];
}

/** A detected closed region in a sketch (for extrude profile selection) */
export interface SketchRegion {
    /** Stable identifier for this region */
    id: string;
    /** Entity IDs that form the boundary */
    boundary_entity_ids: string[];
    /** Ordered boundary points for rendering */
    boundary_points: [number, number][];
    /** Inner loops (holes) inside this region */
    voids?: [number, number][][];
    /** Centroid of the region */
    centroid: [number, number];
    /** Area of the region */
    area: number;
}

// Mirroring the backend ParameterValue
export type ParameterValue =
    | { Float: number }
    | { String: string }
    | { Bool: boolean }
    | { Sketch: Sketch }
    | { Reference: any }
    | { List: string[] }
    | { ProfileRegions: [number, number][][][] } // Profile regions with 2D boundary points
    | { Expression: string }; // Variable reference expression, e.g. "@thickness * 2"


// Snap types for sketch snapping
export type SnapType =
    "Endpoint" | "Midpoint" | "Center" |
    "Intersection" | "Origin" | "Grid";

export interface SnapPoint {
    position: [number, number];
    snap_type: SnapType;
    entity_id: string | null;
    distance: number;
}

export interface SnapConfig {
    snap_radius: number;
    enable_endpoint: boolean;
    enable_midpoint: boolean;
    enable_center: boolean;
    enable_intersection: boolean;
    enable_origin: boolean;
    enable_grid: boolean;
    grid_spacing: number;
}

export const defaultSnapConfig: SnapConfig = {
    snap_radius: 0.5,
    enable_endpoint: true,
    enable_midpoint: true,
    enable_center: true,
    enable_intersection: true,
    enable_origin: true,
    enable_grid: false,
    grid_spacing: 1.0,
};

export type SketchToolType =
    | "select" | "line" | "circle" | "arc" | "rectangle" | "slot" | "polygon" | "point" | "ellipse"
    | "trim" | "mirror" | "offset" | "linear_pattern" | "circular_pattern"
    | "constraint_horizontal" | "constraint_vertical" | "constraint_coincident"
    | "constraint_parallel" | "constraint_perpendicular" | "constraint_equal" | "constraint_fix"
    | "dimension";

/** Result of constraint solving with detailed status (matches backend SolveResult) */
export interface SolveResult {
    /** Whether the solver converged within tolerance */
    converged: boolean;
    /** Number of iterations performed */
    iterations: number;
    /** Final maximum error across all constraints */
    max_error: number;
    /** Number of geometry entities in the sketch */
    entity_count: number;
    /** Number of constraints in the sketch */
    constraint_count: number;
    /** Estimated degrees of freedom: negative=over, 0=fully, positive=under constrained */
    dof: number;
    /** Human-readable status message */
    status_message: string;
    /** Per-entity constraint status for visual DOF indicators */
    entity_statuses?: EntityConstraintStatus[];
}

/** Per-entity constraint status for visual DOF indicators */
export interface EntityConstraintStatus {
    /** The entity ID */
    id: string;
    /** Total DOF this entity contributes (2 for Point, 4 for Line, 3 for Circle, 5 for Arc/Ellipse) */
    total_dof: number;
    /** DOF consumed by constraints affecting this entity */
    constrained_dof: number;
    /** Remaining DOF (total_dof - constrained_dof, clamped to >= 0) */
    remaining_dof: number;
    /** True if all entity DOF are consumed by constraints */
    is_fully_constrained: boolean;
    /** True if more constraints than DOF affect this entity */
    is_over_constrained: boolean;
    /** True if entity is involved in a constraint conflict */
    involved_in_conflict: boolean;
}

// ===== Keyboard Shortcut System Types =====

/** A single shortcut binding */
export interface ShortcutBinding {
    commandId: string;
    shortcut: string; // e.g., "Ctrl+Shift+L" or "L"
    isCustom: boolean;
}

/** Stored shortcut configuration (localStorage) */
export interface ShortcutConfig {
    /** Version for future migrations */
    version: number;
    /** Custom bindings: commandId -> shortcut */
    bindings: Record<string, string>;
}
