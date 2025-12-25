import { createSignal, createEffect, on, type Component } from 'solid-js';
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

    // Reset input when modal opens or initialValue changes while open
    // Using on() to explicitly track props.isOpen and props.initialValue
    createEffect(on(
        () => [props.isOpen, props.initialValue] as const,
        ([isOpen, initialValue]) => {
            if (isOpen) {
                // Sync to initialValue whenever open (catches both opening and value changes)
                setInputValue(initialValue || "");
            }
        }
    ));

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
