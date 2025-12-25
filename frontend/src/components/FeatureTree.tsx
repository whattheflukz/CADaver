import { type Component, For, createSignal, Show } from 'solid-js';
import { type Feature, type FeatureGraphState } from '../types';
import './FeatureTree.css';



interface FeatureTreeProps {
    graph: FeatureGraphState;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    expanded: Record<string, boolean>;
    onToggleExpand: (id: string) => void;
    onUpdateFeature?: (id: string, params: Record<string, any>) => void;
    onEditSketch?: (id: string) => void;
    onOpenVariables?: () => void;
}

const FeatureTree: Component<FeatureTreeProps> = (props) => {
    // Local state removed in favor of props for persistence

    console.log("FeatureTree Render. Nodes:", Object.keys(props.graph.nodes).length, "Sort:", props.graph.sort_order.length);

    const variableCount = () => {
        return props.graph.variables ? Object.keys(props.graph.variables.variables).length : 0;
    };

    return (
        <div class="feature-tree">
            <div class="feature-tree-header">
                <h3>Model Tree</h3>
            </div>
            <div class="feature-list">
                {/* Variables Node - Always at top */}
                <div class="feature-block">
                    <div
                        class="feature-item variables-item"
                        onClick={() => props.onOpenVariables?.()}
                        title="Manage global variables"
                    >
                        <span class="feature-icon">𝑓(x)</span>
                        <span class="feature-name">Variables</span>
                        <Show when={variableCount() > 0}>
                            <span class="variable-count">{variableCount()}</span>
                        </Show>
                        <span class="feature-expander">▶</span>
                    </div>
                </div>

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
                                    {/* Delete button - far left, separated */}
                                    <span
                                        class="feature-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            props.onDelete(id);
                                        }}
                                        title="Delete Feature"
                                    >
                                        🗑️
                                    </span>

                                    {/* Feature name - flex grows to fill space */}
                                    <span class={`feature-name ${feature().suppressed ? 'text-suppressed' : ''}`}>
                                        {feature().name}
                                    </span>

                                    {/* Toggle visibility */}
                                    <span
                                        class={`feature-toggle ${feature().suppressed ? 'suppressed' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            props.onToggle(id);
                                        }}
                                        title={feature().suppressed ? "Show Feature" : "Hide Feature"}
                                    >
                                        {feature().suppressed ? '🚫' : '👁️'}
                                    </span>

                                    {/* Edit icon - for Sketch and Extrude */}
                                    {(feature().feature_type === 'Sketch' || feature().feature_type === 'Extrude') && (
                                        <span
                                            class="feature-edit"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (feature().feature_type === 'Sketch') {
                                                    props.onEditSketch?.(id);
                                                } else {
                                                    props.onSelect(id);
                                                }
                                            }}
                                            title="Edit Feature"
                                        >
                                            ✏️
                                        </span>
                                    )}

                                    {/* Expand/collapse arrow - far right (expandable features) */}
                                    {(feature().feature_type === 'Sketch' || feature().feature_type === 'Extrude') && (
                                        <span
                                            class="feature-expander"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                props.onToggleExpand(id);
                                            }}
                                            title={props.expanded[id] ? "Collapse" : "Expand"}
                                        >
                                            {props.expanded[id] ? '▼' : '▶'}
                                        </span>
                                    )}
                                </div>
                                {feature().feature_type === 'Sketch' && props.expanded[id] && (
                                    <SketchHistory
                                        feature={feature()}
                                        selectedId={props.selectedId}
                                        onSelect={props.onSelect}
                                    />
                                )}
                                {feature().feature_type === 'Extrude' && props.expanded[id] && (
                                    <ExtrudeControls
                                        feature={feature()}
                                        onUpdate={(params) => props.onUpdateFeature?.(id, params)}
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
            <div class="feature-children">
                {isEmpty ? (
                    <div style={{ color: "#aaa", "font-size": "11px", "font-style": "italic" }}>
                        Empty (Pending Setup)
                    </div>
                ) : (
                    <div style={{ color: "#ff6b6b", "font-size": "11px" }}>
                        Error: No Sketch Data found
                    </div>
                )}
            </div>
        );
    }

    return (
        <div class="feature-children">
            <For each={sketchData.history || []}>
                {(op: any) => {
                    const geomId = op.AddGeometry?.id;
                    const isSelected = geomId && props.selectedId === geomId;

                    return (
                        <div
                            class={`history-item ${isSelected ? 'selected' : ''}`}
                            style={{ cursor: geomId ? "pointer" : "default" }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (geomId) {
                                    props.onSelect(geomId);
                                }
                            }}
                        >
                            <span style={{ "margin-right": "6px", opacity: 0.7 }}>
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

// Sub-component for Extrude quick controls
const ExtrudeControls: Component<{ feature: Feature, onUpdate: (params: Record<string, any>) => void }> = (props) => {
    // Extract initial values from feature parameters
    const getInitialDistance = () => {
        const params = props.feature.parameters || {};
        if (params.distance && typeof params.distance === 'object' && 'Float' in params.distance) {
            return (params.distance as any).Float;
        }
        return 10.0;
    };

    const getInitialFlipped = () => {
        const params = props.feature.parameters || {};
        if (params.flip_direction && typeof params.flip_direction === 'object' && 'Bool' in params.flip_direction) {
            return (params.flip_direction as any).Bool;
        }
        return false;
    };

    const [localDistance, setLocalDistance] = createSignal(getInitialDistance());
    const [localFlipped, setLocalFlipped] = createSignal(getInitialFlipped());

    const handleDistanceChange = (e: Event) => {
        const input = e.target as HTMLInputElement;
        const val = parseFloat(input.value);
        if (!isNaN(val) && val > 0) {
            setLocalDistance(val);
            props.onUpdate({ distance: { Float: val } });
        }
    };

    const handleFlipDirection = () => {
        const newFlip = !localFlipped();
        setLocalFlipped(newFlip);
        props.onUpdate({ flip_direction: { Bool: newFlip } });
    };

    return (
        <div class="feature-children extrude-controls">
            <div class="extrude-control-row">
                <label>Distance:</label>
                <input
                    type="number"
                    class="extrude-input"
                    value={localDistance()}
                    min="0.1"
                    step="0.5"
                    onInput={handleDistanceChange}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
            <div class="extrude-control-row">
                <button
                    class="extrude-flip-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleFlipDirection();
                    }}
                    title="Flip extrusion direction"
                >
                    🔄 Flip Direction
                </button>
            </div>
        </div>
    );
};

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
