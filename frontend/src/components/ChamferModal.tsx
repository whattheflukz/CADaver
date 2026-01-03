import { createSignal, type Component, onMount, createEffect } from 'solid-js';
import { BaseModal } from './BaseModal';
import NumericInput from './NumericInput';
import { parseValueOrExpression } from '../expressionEvaluator';
import type { ParameterValue, FeatureGraphState } from '../types';

interface ChamferModalProps {
    featureId: string;
    initialParams: { [key: string]: ParameterValue };
    onUpdate: (id: string, params: { [key: string]: ParameterValue }) => void;
    onClose: () => void;
    selection: any[];
    setSelection: (sel: any[]) => void;
    graph: FeatureGraphState;
}

const ChamferModal: Component<ChamferModalProps> = (props) => {
    // Store distance as expression string to support variables
    const [distanceExpr, setDistanceExpr] = createSignal("1");

    // Store selected edges locally to avoid clearing when global selection changes
    const [selectedDetailEdges, setSelectedDetailEdges] = createSignal<any[]>([]);

    // Track initialization
    const [initialized, setInitialized] = createSignal(false);

    // Initialize from props
    onMount(() => {
        const params = props.initialParams;
        if (params['distance'] && typeof params['distance'] === 'object' && 'Float' in params['distance']) {
            setDistanceExpr(String((params['distance'] as any).Float));
        }

        // Initialize selection from global selection if starting new
        if (props.selection.length > 0) {
            const edges = props.selection.filter(s => s.rank === 'Edge');
            setSelectedDetailEdges(edges);
            syncEdgesToBackend(edges);
        }

        setInitialized(true);
    });

    // Helper to sync to backend
    const syncEdgesToBackend = (edges: any[]) => {
        const edgeIds = edges.map(s => JSON.stringify(s));
        props.onUpdate(props.featureId, { edges: { List: edgeIds } });
    };

    createEffect(() => {
        if (!initialized()) return;

        const currentSel = props.selection;
        const validEdges = currentSel.filter(s => s.rank === 'Edge');

        if (validEdges.length > 0) {
            setSelectedDetailEdges(validEdges);
            syncEdgesToBackend(validEdges);
        } else {
            // Ignore empty selection to prevent auto-clearing
        }
    });

    const handleDistanceChange = (expr: string) => {
        setDistanceExpr(expr);
        const variables = props.graph?.variables || { variables: {}, order: [] };
        const val = parseValueOrExpression(expr, variables);
        if (val !== null) {
            props.onUpdate(props.featureId, { distance: { Float: val } });
        }
    };

    const handleClearSelection = () => {
        setSelectedDetailEdges([]);
        syncEdgesToBackend([]);
        props.setSelection([]);
    };

    return (
        <BaseModal
            title="Chamfer"
            isOpen={true}
            onCancel={props.onClose}
            onConfirm={props.onClose}
            confirmLabel="Finish"
        >
            <div class="flex flex-col gap-3">
                {/* Not Implemented Warning */}
                <div class="bg-amber-900/50 border border-amber-600 rounded-md p-3">
                    <div class="flex items-start gap-2">
                        <span class="text-amber-400 text-lg">⚠️</span>
                        <div class="flex flex-col gap-1">
                            <span class="text-amber-300 text-xs font-bold uppercase">Not Yet Implemented</span>
                            <span class="text-amber-200/80 text-[11px] leading-relaxed">
                                The Truck CAD kernel does not currently support chamfer operations.
                                This feature is planned for a future release. Your parameters will be saved
                                but no geometry changes will be applied.
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Parameters</label>
                    <div class="flex gap-2 items-center mt-1">
                        <span class="text-xs text-gray-400 w-16">Distance:</span>
                        <NumericInput
                            value={distanceExpr()}
                            onChange={handleDistanceChange}
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

export default ChamferModal;
