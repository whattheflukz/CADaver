import { createSignal, createEffect, type Component } from 'solid-js';
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
    const [inputValue, setInputValue] = createSignal("");

    // Track previous open state to detect when modal opens
    let wasOpen = false;

    // Reset input when modal opens
    createEffect(() => {
        const isOpen = props.isOpen;
        const initialValue = props.initialValue;

        console.log("[DimensionEditModal] Effect running: isOpen=", isOpen, "initialValue=", initialValue, "wasOpen=", wasOpen);

        // When transitioning from closed to open, or if open and initialValue changes
        if (isOpen && !wasOpen) {
            console.log("[DimensionEditModal] Setting input to:", initialValue);
            setInputValue(initialValue || "");
        }

        wasOpen = isOpen;
    });

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
            testId="dimension-edit-modal"
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
                    testId="dimension-input"
                />
            </div>
            <div style={{ display: 'none' }}>
                <button data-testid="dimension-confirm" onClick={handleApply}></button>
            </div>
        </BaseModal>
    );
};
