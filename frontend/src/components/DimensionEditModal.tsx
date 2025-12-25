import { createSignal, type Component } from 'solid-js';
import { BaseModal } from './BaseModal';
import ExpressionInput from './ExpressionInput';
import { parseValueOrExpression } from '../expressionEvaluator';
import type { VariableStore } from '../types';

interface DimensionEditModalProps {
    isOpen: boolean;
    title: string;
    initialValue: string;
    variables: VariableStore;
    onApply: (value: number, expression?: string) => void;
    onCancel: () => void;
}

export const DimensionEditModal: Component<DimensionEditModalProps> = (props) => {
    const [inputValue, setInputValue] = createSignal(props.initialValue || "");

    // Reset input when modal opens or initialValue changes
    // We can't easily listen to "open" in a declarative way without an effect on isOpen or initialValue
    // But since this component is likely conditionally rendered or re-rendered, we can initialize signal above.
    // However, if the component stays mounted and isOpen toggles, we need to reset.
    // Actually, looking at App.tsx, it conditionally renders: {editingDimension() && ...}
    // So it remounts every time. Initial state is fine.

    const handleApply = () => {
        const inputExpr = inputValue();
        const newValue = parseValueOrExpression(inputExpr, props.variables);

        if (newValue !== null) {
            const isExpression = inputExpr.includes('@');
            props.onApply(newValue, isExpression ? inputExpr : undefined);
        } else {
            console.warn("Failed to parse expression:", inputExpr);
            // Optionally show error state here
        }
    };

    return (
        <BaseModal
            isOpen={props.isOpen}
            title={props.title}
            onConfirm={handleApply}
            onCancel={props.onCancel}
            confirmLabel="Apply"
            width={300}
            persistenceKey="dimension-edit-modal-v3"
            spawnPosition="center"
        >
            <div style={{ padding: '5px 0' }}>
                <ExpressionInput
                    value={inputValue()}
                    onChange={setInputValue}
                    onEvaluate={(expr) => parseValueOrExpression(expr, props.variables)}
                    variables={props.variables}
                    placeholder="Enter value or @variable"
                    autofocus={true}
                    onEnter={handleApply}
                    onEscape={props.onCancel}
                />
            </div>
        </BaseModal>
    );
};
