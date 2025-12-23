import { type Component, For } from 'solid-js';
import './FeatureTree.css';

// Types mirror the backend types
export type FeatureType = 'Sketch' | 'Extrude' | 'Revolve' | 'Cut' | 'Plane' | 'Axis' | 'Point';

export interface Feature {
    id: string; // EntityId is UUID string
    name: string;
    feature_type: FeatureType;
    suppressed: boolean;
    parameters: Record<string, any>; // ParameterValue equivalent
}

// Graph structure from backend
export interface FeatureGraphState {
    nodes: Record<string, Feature>;
    sort_order: string[];
}

interface FeatureTreeProps {
    graph: FeatureGraphState;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    expanded: Record<string, boolean>;
    onToggleExpand: (id: string) => void;
}

const FeatureTree: Component<FeatureTreeProps> = (props) => {
    // Local state removed in favor of props for persistence

    console.log("FeatureTree Render. Nodes:", Object.keys(props.graph.nodes).length, "Sort:", props.graph.sort_order.length);
    return (
        <div class="feature-tree">
            <div class="feature-tree-header">
                <h3>Model Tree</h3>
            </div>
            <div class="feature-list">
                <For each={props.graph.sort_order}>
                    {(id) => {
                        // Access feature reactively by using a function derived from props.graph
                        // This ensures that even if 'id' stays the same, if the content in props.graph.nodes[id] changes,
                        // accessed values will update.
                        const feature = () => props.graph.nodes[id];

                        // Guard against missing feature
                        if (!feature()) return null;

                        return (
                            <div class="feature-block">
                                <div
                                    class={`feature-item ${props.selectedId === id ? 'selected' : ''}`}
                                    onClick={() => props.onSelect(id)}
                                >
                                    {feature().feature_type === 'Sketch' && (
                                        <span
                                            class="feature-expander"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                props.onToggleExpand(id);
                                            }}
                                            style={{ "margin-right": "4px", "cursor": "pointer", "font-size": "10px", "width": "12px", "display": "inline-block" }}
                                        >
                                            {props.expanded[id] ? '▼' : '▶'}
                                        </span>
                                    )}
                                    <span
                                        class={`feature-toggle ${feature().suppressed ? 'suppressed' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            props.onToggle(id);
                                        }}
                                    >
                                        {feature().suppressed ? '🚫' : '👁️'}
                                    </span>
                                    <span class="feature-icon">{getIcon(feature().feature_type)}</span>
                                    <span class={`feature-name ${feature().suppressed ? 'text-suppressed' : ''}`}>
                                        {feature().name}
                                    </span>
                                    <span
                                        class="feature-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            props.onDelete(id);
                                        }}
                                        title="Delete Feature"
                                        style={{
                                            "margin-left": "auto",
                                            "cursor": "pointer",
                                            "opacity": 0.5,
                                            "font-size": "12px"
                                        }}
                                    >
                                        🗑️
                                    </span>
                                </div>
                                {feature().feature_type === 'Sketch' && props.expanded[id] && (
                                    <SketchHistory
                                        feature={feature()}
                                        selectedId={props.selectedId}
                                        onSelect={props.onSelect}
                                    />
                                )}
                            </div>
                        );
                    }}
                </For>
                {
                    props.graph.sort_order.length === 0 && (
                        <div class="empty-tree">
                            No features
                            <div style={{ "font-size": "10px", "margin-top": "5px" }}>
                                Nodes: {Object.keys(props.graph.nodes).length}
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

// Sub-component for Sketch History to keep main tree clean
const SketchHistory: Component<{ feature: Feature, selectedId: string | null, onSelect: (id: string) => void }> = (props) => {
    // Robust extraction of sketch data
    const feature = props.feature;
    let sketchData: any = null;
    if (feature.parameters) {
        if (feature.parameters.sketch_data) {
            sketchData = feature.parameters.sketch_data.Sketch || feature.parameters.sketch_data;
        } else if (feature.parameters.sketch) {
            sketchData = feature.parameters.sketch.Sketch || feature.parameters.sketch;
        }
    }

    if (!sketchData) {
        const isEmpty = Object.keys(feature.parameters || {}).length === 0;
        return (
            <div class="feature-children" style={{ "padding-left": "20px", "font-size": "0.9em", "border-left": "1px solid #333", "margin-left": "10px" }}>
                {isEmpty ? (
                    <div style={{ color: "#aaa", "font-size": "10px", "font-style": "italic" }}>
                        Empty (Pending Setup)
                    </div>
                ) : (
                    <div style={{ color: "red", "font-size": "10px" }}>
                        Error: No Sketch Data found. Params keys: {Object.keys(feature.parameters || {}).join(", ")}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div class="feature-children" style={{ "padding-left": "20px", "font-size": "0.9em", "border-left": "1px solid #333", "margin-left": "10px" }}>
            <For each={sketchData.history || []}>
                {(op: any) => {
                    const geomId = op.AddGeometry?.id;
                    const isSelected = geomId && props.selectedId === geomId;

                    return (
                        <div
                            class={`history-item ${isSelected ? 'selected' : ''}`}
                            style={{
                                "padding": "2px 0",
                                "opacity": isSelected ? 1.0 : 0.8,
                                "cursor": geomId ? "pointer" : "default",
                                "background-color": isSelected ? "rgba(255, 255, 255, 0.1)" : "transparent"
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (geomId) {
                                    props.onSelect(geomId);
                                }
                            }}
                        >
                            <span style={{ "margin-right": "5px" }}>
                                {getOpIcon(op)}
                            </span>
                            <span>{getOpName(op)}</span>
                        </div>
                    );
                }}
            </For>
            {(!sketchData.history || sketchData.history.length === 0) && (
                <div style={{ opacity: 0.5, "font-style": "italic", "font-size": "10px" }}>
                    No history (Entities: {sketchData.entities?.length || 0})
                </div>
            )}
        </div>
    );
};

function getIcon(type: FeatureType) {
    switch (type) {
        case 'Sketch': return '✏️';
        case 'Extrude': return '⬆️';
        case 'Revolve': return '🔄';
        default: return '📦';
    }
}

function getOpIcon(op: any) {
    if (op.AddGeometry) {
        const geom = op.AddGeometry.geometry;
        if (geom.Line) return '╱';
        if (geom.Circle) return '◯';
        if (geom.Arc) return '◠';
        if (geom.Point) return '•';
    }
    if (op.AddConstraint) return '🔒';
    return '•';
}

function getOpName(op: any) {
    if (op.AddGeometry) {
        const geom = op.AddGeometry.geometry;
        if (geom.Line) return 'Line';
        if (geom.Circle) return 'Circle';
        if (geom.Arc) return 'Arc';
        if (geom.Point) return 'Point';
        if (geom.Ellipse) return 'Ellipse';
        return 'Geometry';
    }
    if (op.AddConstraint) {
        const c = op.AddConstraint.constraint;
        const type = Object.keys(c)[0]; // e.g., "Coincident"
        return type || 'Constraint';
    }
    return 'Operation';
}

export default FeatureTree;
