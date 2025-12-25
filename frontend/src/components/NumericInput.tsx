import { type Component, Show, createMemo } from 'solid-js';
import type { VariableStore } from '../types';
import ExpressionInput from './ExpressionInput';
import './NumericInput.css';

/**
 * NumericInput — Styled number input with unit support and variable expressions
 * 
 * Reference: plan.md Phase 0 → Reusable UI Components → NumericInput
 * 
 * Features:
 * - Wraps ExpressionInput for @variable autocomplete and expression evaluation
 * - Unit suffix badge display (mm, deg, etc.)
 * - Arrow keys for increment/decrement (literal numbers only)
 * - Min/max clamping on evaluated result
 */

interface NumericInputProps {
    /** Raw expression string (can be "10" or "@width + 5") */
    value: string;
    /** Callback when the expression string changes */
    onChange: (expr: string) => void;
    /** Evaluator function that resolves expressions to numbers */
    onEvaluate: (expr: string) => number | null;
    /** Variable store for autocomplete */
    variables: VariableStore;
    /** Unit suffix to display (e.g., "mm", "deg") */
    unit?: string;
    /** Step amount for arrow key increment/decrement (default: 1) */
    step?: number;
    /** Minimum allowed value */
    min?: number;
    /** Maximum allowed value */
    max?: number;
    /** Input placeholder text */
    placeholder?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Callback when Enter is pressed */
    onEnter?: () => void;
    /** Callback when Escape is pressed */
    onEscape?: () => void;
    /** Auto-focus the input on mount */
    autofocus?: boolean;
}

const NumericInput: Component<NumericInputProps> = (props) => {
    const step = () => props.step ?? 1;

    // Check if value is a plain number (no @ expressions)
    const isPlainNumber = createMemo(() => {
        const val = props.value.trim();
        return !val.includes('@') && !isNaN(parseFloat(val));
    });

    // Clamp value to min/max bounds
    const clamp = (val: number): number => {
        let result = val;
        if (props.min !== undefined) result = Math.max(props.min, result);
        if (props.max !== undefined) result = Math.min(props.max, result);
        return result;
    };

    // Handle arrow key stepping (only for literal numbers)
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isPlainNumber()) return;

        const currentVal = parseFloat(props.value);
        if (isNaN(currentVal)) return;

        let newVal: number | null = null;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            newVal = currentVal + step();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            newVal = currentVal - step();
        }

        if (newVal !== null) {
            newVal = clamp(newVal);
            props.onChange(newVal.toString());
        }
    };

    return (
        <div
            class="numeric-input-container"
            onKeyDown={handleKeyDown}
        >
            <ExpressionInput
                value={props.value}
                onChange={props.onChange}
                onEvaluate={props.onEvaluate}
                variables={props.variables}
                placeholder={props.placeholder}
                autofocus={props.autofocus}
                onEnter={props.onEnter}
                onEscape={props.onEscape}
            />
            <Show when={props.unit}>
                <span class="numeric-input-unit">{props.unit}</span>
            </Show>
        </div>
    );
};

export default NumericInput;
