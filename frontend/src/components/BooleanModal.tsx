import { createSignal, type Component, onMount, createEffect, For, createMemo, Show } from 'solid-js';
import { BaseModal } from './BaseModal';
import type { ParameterValue, FeatureGraphState, Feature } from '../types';

interface BooleanModalProps {
    featureId: string;
    initialParams: { [key: string]: ParameterValue };
    onUpdate: (id: string, params: { [key: string]: ParameterValue }) => void;
    onClose: () => void;
    graph: FeatureGraphState;
    /** Current 3D viewport selection - TopoIds with feature_id */
    selection: any[];
    /** Clear/update viewport selection */
    setSelection: (sel: any[]) => void;
    /** Map from TopoId feature_id -> FeatureGraph node UUID */
    featureIdMap: Record<string, string>;
}

/**
 * BooleanModal - Modal for boolean operations (Union, Intersect, Subtract)
 * 
 * Features separate selection boxes for Target and Tool bodies,
 * similar to Onshape's UI pattern.
 */
const BooleanModal: Component<BooleanModalProps> = (props) => {
    const [operation, setOperation] = createSignal<'Union' | 'Intersect' | 'Subtract'>('Subtract');
    const [targetBodies, setTargetBodies] = createSignal<string[]>([]);
    const [toolBodies, setToolBodies] = createSignal<string[]>([]);
    const [keepToolBody, setKeepToolBody] = createSignal(false);
    const [activeField, setActiveField] = createSignal<'target' | 'tool'>('tool');
    const [initialized, setInitialized] = createSignal(false);

    // Get all features that produce geometry (Extrude, Revolve, Boolean - but not self)
    const bodyFeatures = createMemo(() => {
        const nodes = props.graph?.nodes || {};
        const order = props.graph?.sort_order || [];

        return order
            .map(id => nodes[id])
            .filter((f): f is Feature =>
                f != null &&
                !f.suppressed &&
                ['Extrude', 'Revolve', 'Boolean'].includes(f.feature_type) &&
                f.id !== props.featureId
            );
    });

    // Get feature name by ID
    const getFeatureName = (id: string): string => {
        const feature = props.graph?.nodes?.[id];
        return feature?.name || id.slice(0, 8);
    };

    // Helper to extract FeatureGraph node UUID from a TopoId selection
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

    // Sync selected bodies to backend
    const syncToBackend = (op: string, targets: string[], tools: string[], keepTool: boolean) => {
        // Combine targets and tools for body_list (target first, then tools)
        const bodyList = [...targets, ...tools];

        const params: { [key: string]: ParameterValue } = {
            operation: { String: op },
            target_feature: targets.length > 0 ? { String: targets[0] } : { String: '' },
            tool_feature: tools.length > 0 ? { String: tools[0] } : { String: '' },
            body_list: { List: bodyList },
            keep_tool_body: { Bool: keepTool },
        };
        props.onUpdate(props.featureId, params);
    };

    // Initialize from saved params
    onMount(() => {
        const params = props.initialParams;

        // Initialize operation from params
        if (params['operation'] && typeof params['operation'] === 'object' && 'String' in params['operation']) {
            const op = (params['operation'] as any).String;
            if (['Union', 'Intersect', 'Subtract'].includes(op)) {
                setOperation(op);
            }
        }

        // Initialize keep_tool_body from params
        if (params['keep_tool_body'] && typeof params['keep_tool_body'] === 'object' && 'Bool' in params['keep_tool_body']) {
            setKeepToolBody((params['keep_tool_body'] as any).Bool);
        }

        // Initialize from saved params - target is first, tool is second
        if (params['target_feature'] && typeof params['target_feature'] === 'object' && 'String' in params['target_feature']) {
            const targetId = (params['target_feature'] as any).String;
            if (targetId) {
                setTargetBodies([targetId]);
            }
        }

        if (params['tool_feature'] && typeof params['tool_feature'] === 'object' && 'String' in params['tool_feature']) {
            const toolId = (params['tool_feature'] as any).String;
            if (toolId) {
                setToolBodies([toolId]);
            }
        }

        // If no saved bodies, adopt from viewport selection
        if (targetBodies().length === 0 && toolBodies().length === 0 && props.selection.length > 0) {
            const initialBodies: string[] = [];
            for (const sel of props.selection) {
                const nodeId = extractFeatureNodeId(sel);
                if (nodeId && !initialBodies.includes(nodeId)) {
                    const feature = props.graph?.nodes?.[nodeId];
                    if (feature && ['Extrude', 'Revolve', 'Boolean'].includes(feature.feature_type) && feature.id !== props.featureId) {
                        initialBodies.push(nodeId);
                    }
                }
            }
            // First goes to tools (active by default), second to targets
            if (initialBodies.length >= 1) {
                setToolBodies([initialBodies[0]]);
            }
            if (initialBodies.length >= 2) {
                setTargetBodies([initialBodies[1]]);
            }
        }

        if (targetBodies().length > 0 || toolBodies().length > 0) {
            syncToBackend(operation(), targetBodies(), toolBodies(), keepToolBody());
        }

        setInitialized(true);
    });

    // Watch for new viewport selections and add to active field
    createEffect(() => {
        if (!initialized()) return;

        const currentSel = props.selection;
        if (currentSel.length === 0) return;

        const newBodies: string[] = [];
        for (const sel of currentSel) {
            const nodeId = extractFeatureNodeId(sel);
            if (nodeId) {
                const feature = props.graph?.nodes?.[nodeId];
                if (feature && ['Extrude', 'Revolve', 'Boolean'].includes(feature.feature_type) && feature.id !== props.featureId) {
                    if (!newBodies.includes(nodeId)) {
                        newBodies.push(nodeId);
                    }
                }
            }
        }

        if (newBodies.length > 0) {
            const field = activeField();
            if (field === 'tool') {
                const current = toolBodies();
                const combined = [...current];
                for (const id of newBodies) {
                    if (!combined.includes(id) && !targetBodies().includes(id)) {
                        combined.push(id);
                    }
                }
                if (combined.length !== current.length) {
                    setToolBodies(combined);
                    syncToBackend(operation(), targetBodies(), combined, keepToolBody());
                }
            } else {
                const current = targetBodies();
                const combined = [...current];
                for (const id of newBodies) {
                    if (!combined.includes(id) && !toolBodies().includes(id)) {
                        combined.push(id);
                    }
                }
                if (combined.length !== current.length) {
                    setTargetBodies(combined);
                    syncToBackend(operation(), combined, toolBodies(), keepToolBody());
                }
            }
        }
    });

    const handleOperationChange = (op: 'Union' | 'Intersect' | 'Subtract') => {
        setOperation(op);
        syncToBackend(op, targetBodies(), toolBodies(), keepToolBody());
    };

    const handleKeepToolBodyChange = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        setKeepToolBody(checked);
        syncToBackend(operation(), targetBodies(), toolBodies(), checked);
    };

    const removeFromTools = (id: string) => {
        const updated = toolBodies().filter(x => x !== id);
        setToolBodies(updated);
        syncToBackend(operation(), targetBodies(), updated, keepToolBody());
    };

    const removeFromTargets = (id: string) => {
        const updated = targetBodies().filter(x => x !== id);
        setTargetBodies(updated);
        syncToBackend(operation(), updated, toolBodies(), keepToolBody());
    };

    const isValid = () => targetBodies().length >= 1 && toolBodies().length >= 1;

    // Styles
    const tabStyle = (isActive: boolean) => ({
        padding: '8px 16px',
        border: 'none',
        background: isActive ? '#3b82f6' : 'transparent',
        color: isActive ? 'white' : '#9ca3af',
        cursor: 'pointer',
        'font-size': '13px',
        'font-weight': isActive ? '600' : '400',
        'border-bottom': isActive ? '2px solid #3b82f6' : '2px solid transparent',
        transition: 'all 0.15s ease',
    });

    const selectionBoxStyle = (isActive: boolean, borderColor: string) => ({
        border: `2px solid ${isActive ? borderColor : '#374151'}`,
        'border-radius': '6px',
        padding: '8px 12px',
        'min-height': '44px',
        cursor: 'pointer',
        background: isActive ? `${borderColor}10` : '#1f2937',
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
            title="Boolean Operation"
            isOpen={true}
            onCancel={props.onClose}
            onConfirm={props.onClose}
            confirmLabel="Finish"
            confirmDisabled={!isValid()}
        >
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
                {/* Operation Tabs */}
                <div style={{ display: 'flex', 'border-bottom': '1px solid #374151' }}>
                    <button
                        style={tabStyle(operation() === 'Union')}
                        onClick={() => handleOperationChange('Union')}
                    >
                        Union
                    </button>
                    <button
                        style={tabStyle(operation() === 'Subtract')}
                        onClick={() => handleOperationChange('Subtract')}
                    >
                        Subtract
                    </button>
                    <button
                        style={tabStyle(operation() === 'Intersect')}
                        onClick={() => handleOperationChange('Intersect')}
                    >
                        Intersect
                    </button>
                </div>

                {/* Tools Selection Box */}
                <div>
                    <div style={{ 'font-size': '11px', color: '#9ca3af', 'margin-bottom': '4px', 'text-transform': 'uppercase', 'font-weight': '600' }}>
                        Tools
                    </div>
                    <div
                        style={selectionBoxStyle(activeField() === 'tool', '#ef4444')}
                        onClick={() => setActiveField('tool')}
                    >
                        <Show when={toolBodies().length > 0} fallback={
                            <span style={{ color: '#6b7280', 'font-size': '12px', 'font-style': 'italic' }}>
                                Click to select, then click bodies in viewport
                            </span>
                        }>
                            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
                                <For each={toolBodies()}>
                                    {(id) => (
                                        <span style={tagStyle}>
                                            {getFeatureName(id)}
                                            <button
                                                style={removeButtonStyle}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFromTools(id);
                                                }}
                                                title="Remove"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Targets Selection Box */}
                <div>
                    <div style={{ 'font-size': '11px', color: '#9ca3af', 'margin-bottom': '4px', 'text-transform': 'uppercase', 'font-weight': '600' }}>
                        Targets
                    </div>
                    <div
                        style={selectionBoxStyle(activeField() === 'target', '#3b82f6')}
                        onClick={() => setActiveField('target')}
                    >
                        <Show when={targetBodies().length > 0} fallback={
                            <span style={{ color: '#6b7280', 'font-size': '12px', 'font-style': 'italic' }}>
                                Click to select, then click bodies in viewport
                            </span>
                        }>
                            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
                                <For each={targetBodies()}>
                                    {(id) => (
                                        <span style={tagStyle}>
                                            {getFeatureName(id)}
                                            <button
                                                style={removeButtonStyle}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFromTargets(id);
                                                }}
                                                title="Remove"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </div>

                {/* Keep tools checkbox */}
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="keepToolBody"
                        checked={keepToolBody()}
                        onChange={handleKeepToolBodyChange}
                        style={{ width: '16px', height: '16px' }}
                    />
                    <label for="keepToolBody" style={{ 'font-size': '13px', color: '#d1d5db' }}>
                        Keep tools
                    </label>
                </div>

                {/* Validation Message */}
                <Show when={!isValid()}>
                    <div style={{
                        'font-size': '11px',
                        color: '#fbbf24',
                        background: 'rgba(251, 191, 36, 0.1)',
                        'border-radius': '4px',
                        padding: '8px 12px',
                    }}>
                        ⚠️ Select at least one tool and one target body.
                    </div>
                </Show>
            </div>
        </BaseModal>
    );
};

export default BooleanModal;
