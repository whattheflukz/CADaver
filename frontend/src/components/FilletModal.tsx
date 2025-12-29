import { createSignal, type Component, onMount, createEffect } from 'solid-js';
import { BaseModal } from './BaseModal';
import NumericInput from './NumericInput';
import { parseValueOrExpression } from '../expressionEvaluator';
import type { ParameterValue, FeatureGraphState } from '../types';

interface FilletModalProps {
    featureId: string;
    initialParams: { [key: string]: ParameterValue };
    onUpdate: (id: string, params: { [key: string]: ParameterValue }) => void;
    onClose: () => void;
    selection: any[];
    setSelection: (sel: any[]) => void;
    graph: FeatureGraphState;
}

const FilletModal: Component<FilletModalProps> = (props) => {
    // Store radius as expression string to support variables
    const [radiusExpr, setRadiusExpr] = createSignal("1");

    // Store selected edges locally to avoid clearing when global selection changes
    // This allows accumulating selection or handling implicit deselection gracefully
    const [selectedDetailEdges, setSelectedDetailEdges] = createSignal<any[]>([]);

    // Track initialization
    const [initialized, setInitialized] = createSignal(false);

    // Initialize from props
    onMount(() => {
        const params = props.initialParams;
        if (params['radius'] && typeof params['radius'] === 'object' && 'Float' in params['radius']) {
            setRadiusExpr(String((params['radius'] as any).Float));
        }

        // Initialize selection
        // If we have saved edges in params, load them
        // For now, Fillet just uses the global selection passed as props on mount as initial seed
        if (props.selection.length > 0) {
            const edges = props.selection.filter(s => s.rank === 'Edge');
            setSelectedDetailEdges(edges);
            // Sync initial selection to backend immediately
            syncEdgesToBackend(edges);
        }

        setInitialized(true);
    });

    // Helper to sync to backend
    const syncEdgesToBackend = (edges: any[]) => {
        const edgeIds = edges.map(s => JSON.stringify(s));
        props.onUpdate(props.featureId, { edges: { List: edgeIds } });
    };

    // Listen for NEW global selections (add to local state? or replace?)
    // Standard CAD behavior:
    // If modal is open, clicking in viewport usually ADDS to selection if Shift is held, or REPLACES if not.
    // However, our `selection` prop is the *entire* current selection state.
    // So if user clicks an edge, `selection` becomes [that edge].
    // If user Cmd+clicks, `selection` becomes [old, new].
    // So actually, tracking `props.selection` directly *is* correct for "What is currently selected in viewport".
    // THE PROBLEM: When modal opens, something clears the global selection? 
    // OR: We want to *persist* the selection inside the feature even if user deselects in viewport?
    // YES. The modal inspector should show "Selected Edges".
    // 
    // New Logic: 
    // 1. On Mount: Capture current selection.
    // 2. We do NOT bindingly sync global selection -> local selection automatically, 
    //    BECAUSE that would clear our local state if global selection is cleared (which happens on feature select etc).
    // 3. Instead, we listen for *additions*? Or we just provide a UI to "Add Selection"?
    // 
    // Better Logic for Modal:
    // - Local state `selectedEdges` is authoritative for the feature.
    // - On mount, seeded from global selection (if creating new) or backend params (if editing).
    // - User can click "Add from Selection" button? Or we automatically ingest valid edges?
    // 
    // Let's trying automatically ingesting valid edges from global selection, BUT ignoring empty selection?
    // No, that prevents deselecting.
    //
    // Let's stick to "Global Selection == Active Selection".
    // If something clears global selection, we lose it.
    // Maybe we just need to fix WHY global selection is cleared.
    //
    // But to be robust: let's use a "accumulator" pattern.
    // We watch props.selection.
    // If it contains valid edges, we UPDATE our local set to match (or merge?).
    // 
    // Let's try: Local state initialized once.
    // Then we rely on user interaction.
    // But `props.selection` is our only input from viewport.

    // FIX: If props.selection becomes EMPTY, we ignore it? 
    // No, user might want to clear.
    //
    // Let's try "Ignore empty selection update if it happens immediately after mount"?
    // Or check if the clearing source is valid.
    //
    // Alternative: The `props.selection` update that cleared it came from `CreateFeature` flow?
    // 
    // Let's try this:
    // 1. Initialize local state.
    // 2. Watch `props.selection`.
    // 3. If `props.selection` has edges, update local state (and sync).
    // 4. If `props.selection` is empty... we do nothing? (Preserve selection).
    //    User must use "Clear" button in modal to clear.
    //    This prevents accidental clearing, but makes "click background to deselect" fail inside modal.
    //    But "click background" usually closes modal or does nothing in many CADs?
    //    Actually, click background clears selection.
    //
    // Let's go with "Ignore Empty" for now to fix the specific bug, and add a "Clear" button.

    createEffect(() => {
        if (!initialized()) return;

        const currentSel = props.selection;
        const validEdges = currentSel.filter(s => s.rank === 'Edge');

        if (validEdges.length > 0) {
            setSelectedDetailEdges(validEdges);
            syncEdgesToBackend(validEdges);
        } else {
            // Received empty selection. 
            // IGNORE IT to prevent the auto-clear bug.
            // This means to clear selection, user might need a tailored UI action,
            // or we accept that "deselect all" in viewport doesn't clear the feature params.
        }
    });

    const handleRadiusChange = (expr: string) => {
        setRadiusExpr(expr);
        const variables = props.graph?.variables || { variables: {}, order: [] };
        const val = parseValueOrExpression(expr, variables);
        if (val !== null) {
            props.onUpdate(props.featureId, { radius: { Float: val } });
        }
    };

    const handleClearSelection = () => {
        setSelectedDetailEdges([]);
        syncEdgesToBackend([]);
        // Also clear global selection?
        props.setSelection([]);
    };

    return (
        <BaseModal
            title="Fillet"
            isOpen={true}
            onCancel={props.onClose}
            onConfirm={props.onClose}
            confirmLabel="Finish"
        >
            <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Parameters</label>
                    <div class="flex gap-2 items-center mt-1">
                        <span class="text-xs text-gray-400 w-12">Radius:</span>
                        <NumericInput
                            value={radiusExpr()}
                            onChange={handleRadiusChange}
                            onEvaluate={(expr) => parseValueOrExpression(expr, props.graph?.variables || { variables: {}, order: [] })}
                            variables={props.graph?.variables || { variables: {}, order: [] }}
                            unit="mm"
                            step={0.5}
                            min={0.01}
                            placeholder="1.0"
                        />
                    </div>
                </div>

                <div class="h-px bg-gray-700 w-full"></div>

                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <label class="text-xs text-gray-400 uppercase font-bold">Edges ({selectedDetailEdges().length})</label>
                        <button
                            onClick={handleClearSelection}
                            class="text-[10px] text-red-400 hover:text-red-300"
                        >
                            Clear
                        </button>
                    </div>
                    <div class="text-[10px] text-gray-500 italic">
                        Select edges in the 3D viewport.
                    </div>
                    <div class="overflow-y-auto max-h-[100px] bg-gray-900 rounded p-1">
                        {selectedDetailEdges().map((s, i) => (
                            <div class="text-[10px] text-gray-300 px-1 truncate">
                                Edge {i + 1} ({String(s.local_id).substring(0, 8)}...)
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};

export default FilletModal;
