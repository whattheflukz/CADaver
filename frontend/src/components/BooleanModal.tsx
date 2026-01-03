import { createSignal, type Component, onMount, createEffect, For, createMemo } from 'solid-js';
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
 * Supports:
 * - Viewport selection: Click on bodies in the 3D viewer
 * - List selection: Click features in the modal list
 * - Pre-selection: Existing viewport selections are adopted on open
 */
const BooleanModal: Component<BooleanModalProps> = (props) => {
    const [operation, setOperation] = createSignal<'Union' | 'Intersect' | 'Subtract'>('Union');
    const [selectedBodies, setSelectedBodies] = createSignal<string[]>([]);
    const [keepToolBody, setKeepToolBody] = createSignal(false); // If true, tool body is NOT consumed
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
                f.id !== props.featureId // Don't include self
            );
    });

    // Helper to extract FeatureGraph node UUID from a TopoId selection
    const extractFeatureNodeId = (sel: any): string | null => {
        if (!sel) return null;
        const fId = sel.feature_id;
        if (!fId) return null;

        // TopoId's feature_id might be wrapped in various formats
        let topoFeatureId: string | null = null;
        if (typeof fId === 'string') {
            topoFeatureId = fId;
        } else if (typeof fId === 'object' && fId.EntityId) {
            topoFeatureId = fId.EntityId;
        } else if (typeof fId === 'object') {
            topoFeatureId = String(fId);
        }

        // Look up in the mapping to get the FeatureGraph node UUID
        if (topoFeatureId && props.featureIdMap) {
            const nodeUuid = props.featureIdMap[topoFeatureId];
            if (nodeUuid) return nodeUuid;
            // Debug: log if not found
            console.log("[BooleanModal] TopoId feature_id not in map:", topoFeatureId);
        }

        return null;
    };

    // Sync selected bodies to backend
    const syncToBackend = (op: string, bodies: string[], keepTool: boolean) => {
        const params: { [key: string]: ParameterValue } = {
            operation: { String: op },
            target_feature: bodies.length > 0 ? { String: bodies[0] } : { String: '' },
            tool_feature: bodies.length > 1 ? { String: bodies[1] } : { String: '' },
            body_list: { List: bodies },
            keep_tool_body: { Bool: keepTool }, // New parameter: if true, tool body is NOT consumed
        };
        props.onUpdate(props.featureId, params);
    };

    // Initialize from saved params AND pre-selections
    onMount(() => {
        const params = props.initialParams;

        // Initialize operation from params
        if (params['operation'] && typeof params['operation'] === 'object' && 'String' in params['operation']) {
            const op = (params['operation'] as any).String;
            if (['Union', 'Intersect', 'Subtract'].includes(op)) {
                setOperation(op);
            }
        }

        // Initialize keep_tool_body from params (default false)
        if (params['keep_tool_body'] && typeof params['keep_tool_body'] === 'object' && 'Bool' in params['keep_tool_body']) {
            setKeepToolBody((params['keep_tool_body'] as any).Bool);
        }

        // Initialize from saved body_list OR current viewport selection
        let initialBodies: string[] = [];

        // First try saved params
        if (params['body_list'] && typeof params['body_list'] === 'object' && 'List' in params['body_list']) {
            initialBodies = (params['body_list'] as any).List.filter((id: string) => id);
        }

        // If no saved bodies, adopt from viewport selection
        if (initialBodies.length === 0 && props.selection.length > 0) {
            for (const sel of props.selection) {
                const nodeId = extractFeatureNodeId(sel);
                if (nodeId && !initialBodies.includes(nodeId)) {
                    // Verify it's a body-producing feature
                    const feature = props.graph?.nodes?.[nodeId];
                    if (feature && ['Extrude', 'Revolve', 'Boolean'].includes(feature.feature_type) && feature.id !== props.featureId) {
                        initialBodies.push(nodeId);
                    }
                }
            }
        }

        if (initialBodies.length > 0) {
            setSelectedBodies(initialBodies);
            syncToBackend(operation(), initialBodies, keepToolBody());
        }

        setInitialized(true);
    });

    // Watch for new viewport selections and add to list
    createEffect(() => {
        if (!initialized()) return;

        const currentSel = props.selection;
        if (currentSel.length === 0) return;

        // Extract body feature IDs from current selection
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
            // Add new bodies to the list (without duplicates)
            const current = selectedBodies();
            const combined = [...current];
            for (const id of newBodies) {
                if (!combined.includes(id)) {
                    combined.push(id);
                }
            }
            if (combined.length !== current.length) {
                setSelectedBodies(combined);
                syncToBackend(operation(), combined, keepToolBody());
            }
        }
    });

    const handleOperationChange = (e: Event) => {
        const val = (e.target as HTMLSelectElement).value as 'Union' | 'Intersect' | 'Subtract';
        setOperation(val);
        syncToBackend(val, selectedBodies(), keepToolBody());
    };

    const handleKeepToolBodyChange = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        setKeepToolBody(checked);
        syncToBackend(operation(), selectedBodies(), checked);
    };

    const toggleBody = (featureId: string) => {
        const current = selectedBodies();
        let updated: string[];

        if (current.includes(featureId)) {
            updated = current.filter(id => id !== featureId);
        } else {
            updated = [...current, featureId];
        }

        setSelectedBodies(updated);
        syncToBackend(operation(), updated, keepToolBody());
    };

    const handleClearAll = () => {
        setSelectedBodies([]);
        syncToBackend(operation(), [], keepToolBody());
    };

    const getOperationDescription = () => {
        switch (operation()) {
            case 'Union': return 'Combine all selected bodies into one';
            case 'Intersect': return 'Keep only the overlapping volume';
            case 'Subtract': return 'Remove second body from first';
        }
    };

    const isValid = () => selectedBodies().length >= 2;
    const isSelected = (id: string) => selectedBodies().includes(id);
    const getSelectionOrder = (id: string): number | null => {
        const idx = selectedBodies().indexOf(id);
        return idx >= 0 ? idx + 1 : null;
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
            <div class="flex flex-col gap-3">
                {/* Operation Type */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Operation</label>
                    <select
                        value={operation()}
                        onChange={handleOperationChange}
                        class="bg-gray-800 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 outline-none"
                    >
                        <option value="Union">🔗 Union - Combine bodies</option>
                        <option value="Intersect">∩ Intersect - Keep overlap</option>
                        <option value="Subtract">➖ Subtract - Remove second from first</option>
                    </select>
                    <span class="text-[10px] text-gray-500 italic">{getOperationDescription()}</span>
                </div>

                <div class="h-px bg-gray-700 w-full"></div>

                {/* Selection Info */}
                <div class="text-[10px] text-blue-400 bg-blue-900/30 rounded p-2">
                    <strong>↳ Click on bodies in the 3D viewer</strong> to add them to the selection.
                </div>

                {/* Available Bodies - Clickable List */}
                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <label class="text-xs text-gray-400 uppercase font-bold">
                            Bodies ({selectedBodies().length} selected)
                        </label>
                        <button
                            onClick={handleClearAll}
                            class="text-[10px] text-red-400 hover:text-red-300"
                        >
                            Clear
                        </button>
                    </div>
                    <div class="overflow-y-auto max-h-[180px] bg-gray-900 rounded p-1">
                        {bodyFeatures().length === 0 ? (
                            <div class="text-[10px] text-gray-500 italic p-2 text-center">
                                No body features available. Create an Extrude first.
                            </div>
                        ) : (
                            <For each={bodyFeatures()}>
                                {(feature) => {
                                    const selected = isSelected(feature.id);
                                    const order = getSelectionOrder(feature.id);
                                    return (
                                        <div
                                            class={`flex items-center justify-between text-[11px] px-2 py-1.5 rounded cursor-pointer transition-colors ${selected
                                                ? 'bg-blue-600/40 text-white border border-blue-500'
                                                : 'text-gray-300 hover:bg-gray-800 border border-transparent'
                                                }`}
                                            onClick={() => toggleBody(feature.id)}
                                        >
                                            <span class="flex items-center gap-2">
                                                {selected && (
                                                    <span class="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold min-w-[18px] text-center">
                                                        {order}
                                                    </span>
                                                )}
                                                <span class="text-blue-400">
                                                    {feature.feature_type === 'Extrude' && '⬆️'}
                                                    {feature.feature_type === 'Revolve' && '🔄'}
                                                    {feature.feature_type === 'Boolean' && '🔗'}
                                                </span>
                                                <span>{feature.name}</span>
                                            </span>
                                            <span class="text-[9px] text-gray-500">
                                                {feature.feature_type}
                                            </span>
                                        </div>
                                    );
                                }}
                            </For>
                        )}
                    </div>
                </div>

                {operation() === 'Subtract' && selectedBodies().length >= 2 && (
                    <div class="text-[10px] text-gray-400 bg-gray-800/50 rounded p-2">
                        <strong>Order:</strong>
                        <span class="text-blue-400 ml-1">1st</span> = target (keep) •
                        <span class="text-orange-400 ml-1">2nd</span> = tool (remove)
                    </div>
                )}

                {/* Keep Tool Body Checkbox - only shown for Subtract */}
                {operation() === 'Subtract' && (
                    <div class="flex items-center gap-2 bg-gray-800/50 rounded p-2">
                        <input
                            type="checkbox"
                            id="keepToolBody"
                            checked={keepToolBody()}
                            onChange={handleKeepToolBodyChange}
                            class="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <label for="keepToolBody" class="text-[11px] text-gray-300">
                            Keep tool body visible
                            <span class="text-[9px] text-gray-500 ml-1">(don't consume it)</span>
                        </label>
                    </div>
                )}

                {/* Validation Message */}
                {!isValid() && (
                    <div class="text-[10px] text-amber-400 bg-amber-900/30 rounded p-2">
                        ⚠️ Select at least 2 bodies to perform a boolean operation.
                    </div>
                )}

                {/* Info note */}
                <div class="text-[10px] text-gray-500 bg-gray-800/50 rounded p-2">
                    <strong>Tip:</strong> Click bodies in the viewport OR in the list above to select them.
                </div>
            </div>
        </BaseModal>
    );
};

export default BooleanModal;
