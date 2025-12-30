import { createSignal, type Component, For, Show } from 'solid-js';
import { BaseModal } from './BaseModal';
import NumericInput from './NumericInput';
import type { ParameterValue, VariableStore } from '../types';
import { parseValueOrExpression } from '../expressionEvaluator';

interface PlaneModalProps {
    onConfirm: (params: { [key: string]: ParameterValue }) => void;
    onCancel: () => void;
    variables?: VariableStore;
}

type PlaneMode = 'offset' | 'point_normal';

interface BasePlane {
    id: string;
    label: string;
    normal: [number, number, number];
}

const BASE_PLANES: BasePlane[] = [
    { id: 'XY', label: 'XY Plane (Top)', normal: [0, 0, 1] },
    { id: 'XZ', label: 'XZ Plane (Front)', normal: [0, 1, 0] },
    { id: 'YZ', label: 'YZ Plane (Right)', normal: [1, 0, 0] },
];

const PlaneModal: Component<PlaneModalProps> = (props) => {
    const [mode, setMode] = createSignal<PlaneMode>('offset');
    const [basePlane, setBasePlane] = createSignal('XY');
    const [offsetExpr, setOffsetExpr] = createSignal('10');
    const [planeName, setPlaneName] = createSignal('Plane 1');

    // For point_normal mode
    const [pointX, setPointX] = createSignal('0');
    const [pointY, setPointY] = createSignal('0');
    const [pointZ, setPointZ] = createSignal('0');
    const [normalX, setNormalX] = createSignal('0');
    const [normalY, setNormalY] = createSignal('0');
    const [normalZ, setNormalZ] = createSignal('1');

    const handleConfirm = () => {
        const vars = props.variables || { variables: {}, order: [] };

        if (mode() === 'offset') {
            const offset = parseValueOrExpression(offsetExpr(), vars) ?? 10;
            const base = basePlane();

            // Compute the plane data based on offset from base plane
            const basePlaneData = BASE_PLANES.find(p => p.id === base) || BASE_PLANES[0];
            const normal = basePlaneData.normal;
            const origin: [number, number, number] = [
                normal[0] * offset,
                normal[1] * offset,
                normal[2] * offset
            ];

            // Compute x_axis and y_axis based on normal
            let x_axis: [number, number, number];
            let y_axis: [number, number, number];

            if (base === 'XY') {
                x_axis = [1, 0, 0];
                y_axis = [0, 1, 0];
            } else if (base === 'XZ') {
                x_axis = [1, 0, 0];
                y_axis = [0, 0, 1];
            } else { // YZ
                x_axis = [0, 1, 0];
                y_axis = [0, 0, 1];
            }

            props.onConfirm({
                plane_definition: {
                    String: JSON.stringify({
                        Offset: { base, distance: offset }
                    })
                },
                plane_data: {
                    String: JSON.stringify({
                        origin,
                        normal,
                        x_axis,
                        y_axis,
                    })
                },
                name: { String: planeName() },
            });
        } else {
            // Point and Normal mode
            const vars = props.variables || { variables: {}, order: [] };
            const point: [number, number, number] = [
                parseValueOrExpression(pointX(), vars) ?? 0,
                parseValueOrExpression(pointY(), vars) ?? 0,
                parseValueOrExpression(pointZ(), vars) ?? 0,
            ];
            const normal: [number, number, number] = [
                parseValueOrExpression(normalX(), vars) ?? 0,
                parseValueOrExpression(normalY(), vars) ?? 0,
                parseValueOrExpression(normalZ(), vars) ?? 1,
            ];

            // Normalize the normal vector
            const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
            if (len > 0.0001) {
                normal[0] /= len;
                normal[1] /= len;
                normal[2] /= len;
            }

            // Compute x_axis and y_axis from normal
            let up: [number, number, number] = [0, 0, 1];
            if (Math.abs(normal[2]) > 0.9) {
                up = [0, 1, 0];
            }
            const x_axis: [number, number, number] = [
                up[1] * normal[2] - up[2] * normal[1],
                up[2] * normal[0] - up[0] * normal[2],
                up[0] * normal[1] - up[1] * normal[0],
            ];
            const xLen = Math.sqrt(x_axis[0] ** 2 + x_axis[1] ** 2 + x_axis[2] ** 2);
            if (xLen > 0.0001) {
                x_axis[0] /= xLen;
                x_axis[1] /= xLen;
                x_axis[2] /= xLen;
            }
            const y_axis: [number, number, number] = [
                normal[1] * x_axis[2] - normal[2] * x_axis[1],
                normal[2] * x_axis[0] - normal[0] * x_axis[2],
                normal[0] * x_axis[1] - normal[1] * x_axis[0],
            ];

            props.onConfirm({
                plane_definition: {
                    String: JSON.stringify({
                        PointAndNormal: { point, normal }
                    })
                },
                plane_data: {
                    String: JSON.stringify({
                        origin: point,
                        normal,
                        x_axis,
                        y_axis,
                    })
                },
                name: { String: planeName() },
            });
        }
    };

    return (
        <BaseModal
            title="Create Plane"
            isOpen={true}
            onCancel={props.onCancel}
            onConfirm={handleConfirm}
            confirmLabel="Create"
            width={320}
        >
            <div class="flex flex-col gap-3">
                {/* Plane Name */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Name</label>
                    <input
                        type="text"
                        value={planeName()}
                        onInput={(e) => setPlaneName(e.currentTarget.value)}
                        class="bg-gray-700 text-white p-2 rounded text-sm border border-gray-600"
                    />
                </div>

                {/* Mode Selector */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Definition Type</label>
                    <select
                        value={mode()}
                        onChange={(e) => setMode(e.currentTarget.value as PlaneMode)}
                        class="bg-gray-700 text-white p-2 rounded text-sm border border-gray-600"
                    >
                        <option value="offset">Offset from Plane</option>
                        <option value="point_normal">Point and Normal</option>
                    </select>
                </div>

                {/* Offset Mode */}
                <Show when={mode() === 'offset'}>
                    <div class="flex flex-col gap-2">
                        <div class="flex flex-col gap-1">
                            <label class="text-xs text-gray-400">Base Plane</label>
                            <select
                                value={basePlane()}
                                onChange={(e) => setBasePlane(e.currentTarget.value)}
                                class="bg-gray-700 text-white p-2 rounded text-sm border border-gray-600"
                            >
                                <For each={BASE_PLANES}>
                                    {(plane) => <option value={plane.id}>{plane.label}</option>}
                                </For>
                            </select>
                        </div>
                        <div class="flex flex-col gap-1">
                            <label class="text-xs text-gray-400">Offset Distance</label>
                            <NumericInput
                                value={offsetExpr()}
                                onChange={setOffsetExpr}
                                onEvaluate={(expr) => parseValueOrExpression(expr, props.variables || { variables: {}, order: [] })}
                                variables={props.variables || { variables: {}, order: [] }}
                                unit="mm"
                                step={1}
                                placeholder="10 or @offset"
                            />
                        </div>
                    </div>
                </Show>

                {/* Point and Normal Mode */}
                <Show when={mode() === 'point_normal'}>
                    <div class="flex flex-col gap-2">
                        <label class="text-xs text-gray-400">Point (Origin)</label>
                        <div class="flex gap-2">
                            <NumericInput value={pointX()} onChange={setPointX} variables={props.variables || { variables: {}, order: [] }} placeholder="X" unit="" step={1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                            <NumericInput value={pointY()} onChange={setPointY} variables={props.variables || { variables: {}, order: [] }} placeholder="Y" unit="" step={1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                            <NumericInput value={pointZ()} onChange={setPointZ} variables={props.variables || { variables: {}, order: [] }} placeholder="Z" unit="" step={1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                        </div>
                        <label class="text-xs text-gray-400">Normal Direction</label>
                        <div class="flex gap-2">
                            <NumericInput value={normalX()} onChange={setNormalX} variables={props.variables || { variables: {}, order: [] }} placeholder="X" unit="" step={0.1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                            <NumericInput value={normalY()} onChange={setNormalY} variables={props.variables || { variables: {}, order: [] }} placeholder="Y" unit="" step={0.1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                            <NumericInput value={normalZ()} onChange={setNormalZ} variables={props.variables || { variables: {}, order: [] }} placeholder="Z" unit="" step={0.1} onEvaluate={(e) => parseValueOrExpression(e, props.variables || { variables: {}, order: [] })} />
                        </div>
                    </div>
                </Show>
            </div>
        </BaseModal>
    );
};

export default PlaneModal;
