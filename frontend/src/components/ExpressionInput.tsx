import { type Component, createSignal, createMemo, For, Show, onMount } from 'solid-js';
import type { VariableStore } from '../types';
import './ExpressionInput.css';

interface ExpressionInputProps {
    value: string;
    onChange: (value: string) => void;
    onEvaluate: (expression: string) => number | null; // Returns null if invalid
    variables: VariableStore;
    placeholder?: string;
    autofocus?: boolean;
    onEnter?: () => void;
    onEscape?: () => void;
}

const ExpressionInput: Component<ExpressionInputProps> = (props) => {
    const [inputValue, setInputValue] = createSignal(props.value);
    const [showAutocomplete, setShowAutocomplete] = createSignal(false);
    const [selectedIndex, setSelectedIndex] = createSignal(0);

    // Get all variable names for autocomplete
    const variableNames = createMemo(() => {
        if (!props.variables || !props.variables.variables) return [];
        return props.variables.order.map(id => {
            const variable = props.variables.variables[id];
            return variable ? variable.name : null;
        }).filter((n): n is string => n !== null);
    });

    // Filter variables based on current input after @
    const filteredVariables = createMemo(() => {
        const val = inputValue();
        const atIndex = val.lastIndexOf('@');
        if (atIndex === -1) return [];

        const searchTerm = val.substring(atIndex + 1).toLowerCase();
        return variableNames().filter(name =>
            name.toLowerCase().startsWith(searchTerm)
        );
    });

    // Evaluation result preview
    const evaluatedValue = createMemo(() => {
        const val = inputValue();
        if (!val.includes('@')) {
            // Plain number
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
        }
        // Try to evaluate expression
        return props.onEvaluate(val);
    });

    let inputRef: HTMLInputElement | undefined;

    // Auto-focus when mounted if requested
    createSignal(() => {
        if (props.autofocus && inputRef) {
            // Small timeout to ensure modal transition is done / element is painting
            setTimeout(() => {
                inputRef?.focus();
                // move cursor to end
                const len = inputRef?.value.length || 0;
                inputRef?.setSelectionRange(len, len);
            }, 50);
        }
    });

    // Also try on mount
    onMount(() => {
        if (props.autofocus && inputRef) {
            setTimeout(() => {
                inputRef?.focus();
                const len = inputRef?.value.length || 0;
                inputRef?.setSelectionRange(len, len);
            }, 10);
        }
    });

    const handleInput = (e: Event) => {
        const val = (e.target as HTMLInputElement).value;
        setInputValue(val);
        props.onChange(val);

        // Show autocomplete if typing after @
        const atIndex = val.lastIndexOf('@');
        if (atIndex !== -1 && atIndex === val.length - 1 ||
            (atIndex !== -1 && val.length > atIndex && !val.substring(atIndex).includes(' '))) {
            setShowAutocomplete(true);
            setSelectedIndex(0);
        } else {
            setShowAutocomplete(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (showAutocomplete() && filteredVariables().length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filteredVariables().length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && showAutocomplete())) {
                e.preventDefault();
                selectVariable(filteredVariables()[selectedIndex()]);
                return;
            }
        }

        if (e.key === 'Enter' && !showAutocomplete()) {
            props.onEnter?.();
        }
        if (e.key === 'Escape') {
            if (showAutocomplete()) {
                setShowAutocomplete(false);
            } else {
                props.onEscape?.();
            }
        }
    };

    const selectVariable = (name: string) => {
        const val = inputValue();
        const atIndex = val.lastIndexOf('@');
        const newValue = val.substring(0, atIndex + 1) + name;
        setInputValue(newValue);
        props.onChange(newValue);
        setShowAutocomplete(false);
        if (inputRef) inputRef.focus();
    };

    return (
        <div class="expression-input-container">
            <input
                ref={inputRef}
                type="text"
                class="expression-input"
                value={inputValue()}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                placeholder={props.placeholder}
                autofocus={props.autofocus}
            />

            <Show when={evaluatedValue() !== null && inputValue().includes('@')}>
                <span class="expression-preview">= {evaluatedValue()!.toFixed(4)}</span>
            </Show>

            <Show when={showAutocomplete() && filteredVariables().length > 0}>
                <div class="autocomplete-dropdown">
                    <For each={filteredVariables()}>
                        {(name, index) => {
                            const variable = props.variables.variables[
                                props.variables.order.find(id =>
                                    props.variables.variables[id]?.name === name
                                )!
                            ];
                            return (
                                <div
                                    class={`autocomplete-item ${index() === selectedIndex() ? 'selected' : ''}`}
                                    onMouseDown={() => selectVariable(name)}
                                    onMouseEnter={() => setSelectedIndex(index())}
                                >
                                    <span class="var-name">@{name}</span>
                                    <Show when={variable?.cached_value !== undefined}>
                                        <span class="var-value">= {variable!.cached_value!.toFixed(2)}</span>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </div>
            </Show>
        </div>
    );
};

export default ExpressionInput;
