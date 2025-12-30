import { type Component, For, createSignal, Show } from 'solid-js';
import { type Feature, type FeatureGraphState, type Variable, type VariableUnit } from '../types';
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
    onEditExtrude?: (id: string) => void;
    onOpenVariables?: () => void;
    rollbackPoint?: string | null;
    onSetRollback?: (id: string | null) => void;
    onReorderFeature?: (id: string, newIndex: number) => void;
    onInsertAfter?: (afterId: string, featureType: string) => void;
    onExtrudeSketch?: (id: string) => void;
    // Standard plane visibility
    standardPlaneVisibility?: { XY: boolean; XZ: boolean; YZ: boolean };
    onToggleStandardPlane?: (plane: 'XY' | 'XZ' | 'YZ') => void;
}

const FeatureTree: Component<FeatureTreeProps> = (props) => {
    // Local state removed in favor of props for persistence

    console.log("FeatureTree Render. Nodes:", Object.keys(props.graph.nodes).length, "Sort:", props.graph.sort_order.length);

    const variableCount = () => {
        return props.graph.variables ? Object.keys(props.graph.variables.variables).length : 0;
    };

    const [variablesExpanded, setVariablesExpanded] = createSignal(false);
    const [hoverFeatureId, setHoverFeatureId] = createSignal<string | null>(null);

    const formatUnit = (unit: VariableUnit): string => {
        if (unit === 'Dimensionless') return '';
        if (typeof unit === 'object' && 'Length' in unit) {
            const lengthMap: Record<string, string> = {
                Millimeter: 'mm', Centimeter: 'cm', Meter: 'm', Inch: 'in', Foot: 'ft'
            };
            return lengthMap[unit.Length] || unit.Length;
        }
        if (typeof unit === 'object' && 'Angle' in unit) {
            return unit.Angle === 'Degrees' ? '°' : 'rad';
        }
        return '';
    };

    const formatVariableValue = (variable: Variable): string => {
        if (variable.error) return `Error: ${variable.error}`;
        if (variable.cached_value === undefined || variable.cached_value === null) return '...';
        const unitStr = formatUnit(variable.unit);
        return `${variable.cached_value.toFixed(4)}${unitStr ? ' ' + unitStr : ''}`;
    };

    // Dependency visualization helpers
    // Get features that depend on the given feature (children/dependents)
    const getDependents = (id: string): string[] => {
        return Object.values(props.graph.nodes)
            .filter(f => f.dependencies?.includes(id))
            .map(f => f.id);
    };

    // Get features this feature depends on (parents)
    const getParents = (id: string): string[] => {
        return props.graph.nodes[id]?.dependencies ?? [];
    };

    // Check if a feature is a parent of the currently hovered feature
    const isParentOfHovered = (id: string): boolean => {
        const hovered = hoverFeatureId();
        if (!hovered) return false;
        return getParents(hovered).includes(id);
    };

    // Check if a feature is a child/dependent of the currently hovered feature
    const isChildOfHovered = (id: string): boolean => {
        const hovered = hoverFeatureId();
        if (!hovered) return false;
        return getDependents(hovered).includes(id);
    };

    // Drag-and-drop state
    const [draggedId, setDraggedId] = createSignal<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = createSignal<number | null>(null);

    const handleDragStart = (e: DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', id);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setDropTargetIndex(null);
    };

    const handleDragOver = (e: DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        setDropTargetIndex(index);
    };

    const handleDrop = (e: DragEvent, targetIndex: number) => {
        e.preventDefault();
        const id = draggedId();
        if (id && props.onReorderFeature) {
            props.onReorderFeature(id, targetIndex);
        }
        setDraggedId(null);
        setDropTargetIndex(null);
    };

    // Context menu state
    const [contextMenu, setContextMenu] = createSignal<{ x: number, y: number, featureId: string } | null>(null);

    const handleContextMenu = (e: MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, featureId: id });
    };

    const closeContextMenu = () => setContextMenu(null);

    const handleInsertSketch = () => {
        const menu = contextMenu();
        if (menu && props.onInsertAfter) {
            props.onInsertAfter(menu.featureId, 'Sketch');
        }
        closeContextMenu();
    };

    // Close context menu on outside click
    const handleTreeClick = () => closeContextMenu();

    return (
        <div class="feature-tree" onClick={handleTreeClick}>
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
                        <span
                            class="feature-expander"
                            onClick={(e) => {
                                e.stopPropagation();
                                setVariablesExpanded(!variablesExpanded());
                            }}
                            title={variablesExpanded() ? "Collapse" : "Expand"}
                        >
                            {variablesExpanded() ? '▼' : '▶'}
                        </span>
                    </div>
                    <Show when={variablesExpanded()}>
                        <div class="feature-children variables-list-tree">
                            <For each={Object.values(props.graph.variables?.variables || {})}>
                                {(variable: any) => (
                                    <div class="variable-tree-item">
                                        <span class="var-name">@{variable.name}</span>
                                        <span class="var-value">= {formatVariableValue(variable)}</span>
                                    </div>
                                )}
                            </For>
                            <Show when={variableCount() === 0}>
                                <div class="empty-vars">No variables</div>
                            </Show>
                        </div>
                    </Show>
                </div>

                {/* Standard Planes - Always visible, not deletable */}
                <div class="feature-block standard-planes-block">
                    <div class="feature-item plane-item xy-plane" style={{ opacity: props.standardPlaneVisibility?.XY !== false ? 1 : 0.5 }}>
                        <span class="plane-color-indicator" style={{ background: '#0000ff' }} />
                        <span class="feature-name">XY Plane</span>
                        <span
                            class="visibility-toggle"
                            onClick={() => props.onToggleStandardPlane?.('XY')}
                            title={props.standardPlaneVisibility?.XY !== false ? "Hide" : "Show"}
                        >
                            {props.standardPlaneVisibility?.XY !== false ? '👁️' : '👁️‍🗨️'}
                        </span>
                    </div>
                    <div class="feature-item plane-item xz-plane" style={{ opacity: props.standardPlaneVisibility?.XZ !== false ? 1 : 0.5 }}>
                        <span class="plane-color-indicator" style={{ background: '#00ff00' }} />
                        <span class="feature-name">XZ Plane</span>
                        <span
                            class="visibility-toggle"
                            onClick={() => props.onToggleStandardPlane?.('XZ')}
                            title={props.standardPlaneVisibility?.XZ !== false ? "Hide" : "Show"}
                        >
                            {props.standardPlaneVisibility?.XZ !== false ? '👁️' : '👁️‍🗨️'}
                        </span>
                    </div>
                    <div class="feature-item plane-item yz-plane" style={{ opacity: props.standardPlaneVisibility?.YZ !== false ? 1 : 0.5 }}>
                        <span class="plane-color-indicator" style={{ background: '#ff0000' }} />
                        <span class="feature-name">YZ Plane</span>
                        <span
                            class="visibility-toggle"
                            onClick={() => props.onToggleStandardPlane?.('YZ')}
                            title={props.standardPlaneVisibility?.YZ !== false ? "Hide" : "Show"}
                        >
                            {props.standardPlaneVisibility?.YZ !== false ? '👁️' : '👁️‍🗨️'}
                        </span>
                    </div>
                </div>

                <For each={props.graph.sort_order}>

                    {(id, index) => {
                        // Access feature reactively by using a function derived from props.graph
                        // This ensures that even if 'id' stays the same, if the content in props.graph.nodes[id] changes,
                        // accessed values will update.
                        const feature = () => props.graph.nodes[id];

                        // Guard against missing feature
                        if (!feature()) return null;

                        // Check if this feature is the rollback point
                        const isRollbackPoint = () => props.rollbackPoint === id;

                        // Check if this feature is "after" the rollback point (rolled back / hidden)
                        const isRolledBack = () => {
                            if (!props.rollbackPoint) return false;
                            const rbIndex = props.graph.sort_order.indexOf(props.rollbackPoint);
                            return rbIndex !== -1 && index() > rbIndex;
                        };

                        return (
                            <div
                                class={`feature-block ${isRolledBack() ? 'rolled-back' : ''} ${dropTargetIndex() === index() ? 'drop-target' : ''}`}
                                onDragOver={(e) => handleDragOver(e, index())}
                                onDrop={(e) => handleDrop(e, index())}
                            >
                                {/* Drop indicator line */}
                                <Show when={dropTargetIndex() === index() && draggedId() !== id}>
                                    <div class="drop-indicator" />
                                </Show>
                                {/* Rollback indicator bar */}
                                <Show when={isRollbackPoint()}>
                                    <div class="rollback-indicator">
                                        <span class="rollback-bar">◄ Rollback Point</span>
                                        <button
                                            class="rollback-clear-btn"
                                            onClick={() => props.onSetRollback?.(null)}
                                            title="Show All Features"
                                        >
                                            Show All
                                        </button>
                                    </div>
                                </Show>
                                <div
                                    class={`feature-item ${props.selectedId === id ? 'selected' : ''} ${isRolledBack() ? 'faded' : ''} ${isParentOfHovered(id) ? 'dependency-parent' : ''} ${isChildOfHovered(id) ? 'dependency-child' : ''} ${draggedId() === id ? 'dragging' : ''}`}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, id)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => props.onSelect(id)}
                                    onDblClick={() => props.onSetRollback?.(isRollbackPoint() ? null : id)}
                                    onContextMenu={(e) => handleContextMenu(e, id)}
                                    onMouseEnter={() => setHoverFeatureId(id)}
                                    onMouseLeave={() => setHoverFeatureId(null)}
                                    title={isRolledBack() ? "Double-click to roll forward to this feature" : "Right-click for options • Drag to reorder"}
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
                                                    props.onEditExtrude?.(id);
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
            {/* Context Menu - Moved to root to avoid overflow/event issues */}
            <Show when={contextMenu()}>
                {(menu) => (
                    <div
                        class="feature-context-menu"
                        style={{
                            position: 'fixed',
                            left: `${menu().x}px`,
                            top: `${menu().y}px`,
                            'z-index': 1000
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                console.log("Insert Sketch After clicked, featureId:", menu().featureId);
                                handleInsertSketch();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            + Insert Sketch After
                        </button>
                        {props.graph.nodes[menu().featureId]?.feature_type === 'Sketch' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // We need a way to trigger extrude from here. 
                                    // FeatureTree doesn't have direct access to handleExtrude.
                                    // We can add a prop `onExtrudeSketch`?
                                    // Or reuse onUpdateFeature? No.
                                    // Let's assume we can pass a new prop.
                                    if (props.onExtrudeSketch) {
                                        props.onExtrudeSketch(menu().featureId);
                                    }
                                    closeContextMenu();
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                ⬆️ Extrude
                            </button>
                        )}
                    </div>
                )}
            </Show>
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


        </div >
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
