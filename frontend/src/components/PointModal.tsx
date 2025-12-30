import { createSignal, type Component } from 'solid-js';
import { BaseModal } from './BaseModal';
import NumericInput from './NumericInput';
import type { ParameterValue, VariableStore } from '../types';
import { parseValueOrExpression } from '../expressionEvaluator';

interface PointModalProps {
    onConfirm: (params: { [key: string]: ParameterValue }) => void;
    onCancel: () => void;
    variables?: VariableStore;
}

const PointModal: Component<PointModalProps> = (props) => {
    const [pointName, setPointName] = createSignal('Point 1');
    const [xExpr, setXExpr] = createSignal('0');
    const [yExpr, setYExpr] = createSignal('0');
    const [zExpr, setZExpr] = createSignal('0');

    const handleConfirm = () => {
        const vars = props.variables || { variables: {}, order: [] };
        const x = parseValueOrExpression(xExpr(), vars) ?? 0;
        const y = parseValueOrExpression(yExpr(), vars) ?? 0;
        const z = parseValueOrExpression(zExpr(), vars) ?? 0;

        props.onConfirm({
            point_data: {
                String: JSON.stringify({
                    position: [x, y, z]
                })
            },
            name: { String: pointName() },
        });
    };

    return (
        <BaseModal
            title="Create Reference Point"
            isOpen={true}
            onCancel={props.onCancel}
            onConfirm={handleConfirm}
            confirmLabel="Create"
            width={280}
        >
            <div class="flex flex-col gap-3">
                {/* Point Name */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Name</label>
                    <input
                        type="text"
                        value={pointName()}
                        onInput={(e) => setPointName(e.currentTarget.value)}
                        class="bg-gray-700 text-white p-2 rounded text-sm border border-gray-600"
                    />
                </div>

                {/* Coordinates */}
                <div class="flex flex-col gap-2">
                    <label class="text-xs text-gray-400 uppercase font-bold">Position</label>
                    <div class="flex gap-2 items-center">
                        <span class="text-xs text-gray-500 w-4">X</span>
                        <NumericInput
                            value={xExpr()}
                            onChange={setXExpr}
                            onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })}
                            variables={props.variables || { variables: {}, order: [] }}
                            unit="mm"
                            step={1}
                            placeholder="0"
                        />
                    </div>
                    <div class="flex gap-2 items-center">
                        <span class="text-xs text-gray-500 w-4">Y</span>
                        <NumericInput
                            value={yExpr()}
                            onChange={setYExpr}
                            onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })}
                            variables={props.variables || { variables: {}, order: [] }}
                            unit="mm"
                            step={1}
                            placeholder="0"
                        />
                    </div>
                    <div class="flex gap-2 items-center">
                        <span class="text-xs text-gray-500 w-4">Z</span>
                        <NumericInput
                            value={zExpr()}
                            onChange={setZExpr}
                            onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })}
                            variables={props.variables || { variables: {}, order: [] }}
                            unit="mm"
                            step={1}
                            placeholder="0"
                        />
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};

export default PointModal;
