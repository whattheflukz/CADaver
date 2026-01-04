import { type Component, createSignal, createEffect, onMount, For, Show } from 'solid-js';
import { BaseModal } from './BaseModal';
import type { EntityId, FeatureGraphState, Feature } from '../types';

interface LinearPatternModal3DProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (params: {
        bodyId: EntityId;
        direction: [number, number, number];
        count: number;
        spacing: number;
    }) => void;
    graph: FeatureGraphState;
    selection: any[];
    featureIdMap: Record<string, string>;
    featureId?: string;
    initialParams?: Record<string, any>;
}

export const LinearPatternModal3D: Component<LinearPatternModal3DProps> = (props) => {
    // Helper to robustly extract a value from ParameterValue enum or direct value
    const extractParam = (params: any, key: string, type: 'Float' | 'Bool' | 'String' | 'List', defaultValue: any) => {
        if (!params || !params[key]) return defaultValue;
        const val = params[key];
        if (typeof val === 'object' && type in val) {
            return (val as any)[type];
        }
        return val; // Fallback or direct value
    };

    const getInitialDirection = () => {
        // direction is stored as List(Vec<String>) in backend. 
        // extractParam helper might need adjustment for List.
        // Let's do it manually.
        if (props.initialParams && props.initialParams.direction) {
            const d = props.initialParams.direction;
            const list = d.List || d; // Handle Enum wrapper
            if (Array.isArray(list) && list.length >= 3) {
                const vec = list.map(Number);
                if (vec[0] === 1) return 'X';
                if (vec[1] === 1) return 'Y';
                if (vec[2] === 1) return 'Z';
            }
        }
        return 'X';
    };

    const [selectedBodyId, setSelectedBodyId] = createSignal<string | null>(
        props.initialParams && props.featureId ?
            // For editing, we might need to look up dependency. 
            // But initialParams usually just has params, not input body ID (that's in dependencies).
            // EDIT: backend stores dependencies. feature.dependencies[0] is body.
            // We catch this in onMount if featureId is provided.
            null
            : null
    );
    const [directionAxis, setDirectionAxis] = createSignal<'X' | 'Y' | 'Z'>(getInitialDirection());
    const [count, setCount] = createSignal(extractParam(props.initialParams, 'count', 'Float', 3));
    const [spacing, setSpacing] = createSignal(extractParam(props.initialParams, 'spacing', 'Float', 20));
    const [activeField, setActiveField] = createSignal<'body' | 'direction'>('body');

    // On Mount, if editing, try to find the body from dependencies
    onMount(() => {
        if (props.featureId) {
            const feature = props.graph.nodes[props.featureId];
            if (feature && feature.dependencies && feature.dependencies.length > 0) {
                setSelectedBodyId(feature.dependencies[0]);
            }
        }
    });

    // Helper to extract FeatureGraph node UUID from selection
    const extractFeatureNodeId = (sel: any): string | null => {
        if (!sel) return null;
        const fId = sel.feature_id;
        if (!fId) return null;

        let topoFeatureId: string | null = null;
        if (typeof fId === 'string') {
            topoFeatureId = fId;
        } else if (typeof fId === 'object' && fId.EntityId) {
            topoFeatureId = fId.EntityId;
        } else if (typeof fId === 'object') {
            topoFeatureId = String(fId);
        }

        if (topoFeatureId && props.featureIdMap) {
            const nodeUuid = props.featureIdMap[topoFeatureId];
            if (nodeUuid) return nodeUuid;
        }
        return null;
    };

    // Get feature name by ID
    const getFeatureName = (id: string): string => {
        const feature = props.graph?.nodes?.[id];
        return feature?.name || id.slice(0, 8);
    };

    // Initialize from selection if available on mount
    onMount(() => {
        if (props.selection.length > 0 && !selectedBodyId()) {
            for (const sel of props.selection) {
                const nodeId = extractFeatureNodeId(sel);
                if (nodeId) {
                    const feature = props.graph?.nodes?.[nodeId];
                    if (feature && ['Extrude', 'Revolve', 'Boolean', 'LinearPattern', 'CircularPattern'].includes(feature.feature_type)) {
                        setSelectedBodyId(nodeId);
                        break; // Only one body
                    }
                }
            }
        }
    });

    // Watch for new selections
    createEffect(() => {
        const currentSel = props.selection;
        if (currentSel.length === 0) return;

        // Only update if body field is active
        if (activeField() !== 'body') return;

        for (const sel of currentSel) {
            const nodeId = extractFeatureNodeId(sel);
            if (nodeId) {
                const feature = props.graph?.nodes?.[nodeId];
                if (feature && ['Extrude', 'Revolve', 'Boolean', 'LinearPattern', 'CircularPattern'].includes(feature.feature_type)) {
                    setSelectedBodyId(nodeId);
                    // Only looking for the most recent valid selection
                    break;
                }
            }
        }
    });

    const handleConfirm = () => {
        const bodyId = selectedBodyId();
        if (!bodyId) return;

        const direction: [number, number, number] =
            directionAxis() === 'X' ? [1, 0, 0] :
                directionAxis() === 'Y' ? [0, 1, 0] :
                    [0, 0, 1];

        props.onConfirm({
            bodyId,
            direction,
            count: count(),
            spacing: spacing()
        });
        props.onClose();
    };

    const isConfirmDisabled = () => !selectedBodyId() || count() < 2;

    // Styles
    const selectionBoxStyle = (isActive: boolean) => ({
        border: `2px solid ${isActive ? '#3b82f6' : '#374151'}`,
        'border-radius': '6px',
        padding: '8px 12px',
        'min-height': '44px',
        cursor: 'pointer',
        background: isActive ? 'rgba(59, 130, 246, 0.1)' : '#1f2937',
        transition: 'all 0.15s ease',
    });

    const tagStyle = {
        display: 'inline-flex',
        'align-items': 'center',
        gap: '6px',
        background: '#374151',
        padding: '4px 8px',
        'border-radius': '4px',
        'font-size': '12px',
        color: 'white',
    };

    const removeButtonStyle = {
        background: 'none',
        border: 'none',
        color: '#9ca3af',
        cursor: 'pointer',
        padding: '0',
        'font-size': '14px',
        'line-height': '1',
    };

    return (
        <BaseModal
            isOpen={props.isOpen}
            title="Linear Pattern (3D)"
            onConfirm={handleConfirm}
            onCancel={props.onClose}
            confirmDisabled={isConfirmDisabled()}
            width={320}
            testId="linear-pattern-3d-modal"
        >
            {/* Body Selection */}
            <div style={{ "margin-bottom": "16px" }}>
                <div style={{ "font-size": "11px", color: "#9ca3af", "margin-bottom": "4px", "text-transform": "uppercase", "font-weight": "600" }}>
                    Body to Pattern
                </div>
                <div
                    style={selectionBoxStyle(activeField() === 'body')}
                    onClick={() => setActiveField('body')}
                    data-testid="pattern-body-select"
                >
                    <Show when={selectedBodyId()} fallback={
                        <span style={{ color: '#6b7280', 'font-size': '12px', 'font-style': 'italic' }}>
                            Click to activate, then select a body
                        </span>
                    }>
                        <div style={tagStyle}>
                            {getFeatureName(selectedBodyId()!)}
                            <button
                                style={removeButtonStyle}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBodyId(null);
                                }}
                                title="Remove"
                            >
                                ×
                            </button>
                        </div>
                    </Show>
                </div>
            </div>

            {/* Direction Selection */}
            <div style={{ "margin-bottom": "16px" }}>
                <div style={{ "font-size": "11px", color: "#9ca3af", "margin-bottom": "4px", "text-transform": "uppercase", "font-weight": "600" }}>Direction</div>
                <div style={{ display: "flex", gap: "8px" }}>
                    {(['X', 'Y', 'Z'] as const).map(axis => (
                        <button
                            onClick={() => setDirectionAxis(axis)}
                            style={{
                                flex: 1,
                                padding: "8px",
                                background: directionAxis() === axis ? "#3b82f6" : "#374151",
                                color: "white",
                                border: "none",
                                "border-radius": "4px",
                                cursor: "pointer",
                                "font-size": "13px",
                                "font-weight": directionAxis() === axis ? "600" : "400"
                            }}
                        >
                            {axis}
                        </button>
                    ))}
                </div>
            </div>

            {/* Parameters */}
            <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px" }}>
                    <div style={{ "font-size": "11px", color: "#9ca3af", "text-transform": "uppercase", "font-weight": "600" }}>Count</div>
                    <input
                        type="number"
                        min="2"
                        value={count()}
                        onInput={(e) => setCount(Math.max(2, parseInt(e.currentTarget.value) || 2))}
                        style={{
                            padding: "8px",
                            background: "#1f2937",
                            border: "1px solid #4b5563",
                            "border-radius": "4px",
                            color: "white"
                        }}
                    />
                </div>
                <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px" }}>
                    <div style={{ "font-size": "11px", color: "#9ca3af", "text-transform": "uppercase", "font-weight": "600" }}>Spacing (mm)</div>
                    <input
                        type="number"
                        step="0.1"
                        value={spacing()}
                        onInput={(e) => setSpacing(parseFloat(e.currentTarget.value) || 0)}
                        style={{
                            padding: "8px",
                            background: "#1f2937",
                            border: "1px solid #4b5563",
                            "border-radius": "4px",
                            color: "white"
                        }}
                    />
                </div>
            </div>
        </BaseModal>
    );
};
