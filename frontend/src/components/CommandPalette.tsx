/**
 * CommandPalette - Draggable modal overlay for fuzzy command search
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Command palette infrastructure
 * 
 * Features:
 * - Fuzzy search across all commands
 * - Mode-aware filtering (only shows commands valid for current mode)
 * - Keyboard navigation (↑/↓/Enter/Escape)
 * - Click selection
 * - Draggable header
 * - Inline calculator (Raycast-style)
 */

import { type Component, createSignal, createMemo, For, Show, createEffect } from "solid-js";
import {
    type Command,
    type AppMode,
    getCommandsForMode,
    filterCommands
} from "../commandRegistry";

// ============================================================================
// Safe Math Expression Evaluator (no eval!)
// ============================================================================

type Token =
    | { type: 'number'; value: number }
    | { type: 'operator'; value: string }
    | { type: 'lparen' }
    | { type: 'rparen' };

function tokenize(expr: string): Token[] | null {
    const tokens: Token[] = [];
    let i = 0;

    // Normalize: replace × with *, ÷ with /, x with * (case insensitive)
    expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/x/gi, '*');

    while (i < expr.length) {
        const char = expr[i];

        // Skip whitespace
        if (/\s/.test(char)) {
            i++;
            continue;
        }

        // Numbers (including decimals)
        if (/[0-9.]/.test(char)) {
            let numStr = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                numStr += expr[i];
                i++;
            }
            const num = parseFloat(numStr);
            if (isNaN(num)) return null;
            tokens.push({ type: 'number', value: num });
            continue;
        }

        // Operators
        if (['+', '-', '*', '/', '^', '%'].includes(char)) {
            tokens.push({ type: 'operator', value: char });
            i++;
            continue;
        }

        // Parentheses
        if (char === '(') {
            tokens.push({ type: 'lparen' });
            i++;
            continue;
        }
        if (char === ')') {
            tokens.push({ type: 'rparen' });
            i++;
            continue;
        }

        // Unknown character - not a math expression
        return null;
    }

    return tokens.length > 0 ? tokens : null;
}

// Recursive descent parser for math expressions
function evaluateTokens(tokens: Token[]): number | null {
    let pos = 0;

    function peek(): Token | undefined {
        return tokens[pos];
    }

    function consume(): Token | undefined {
        return tokens[pos++];
    }

    // Parse addition/subtraction (lowest precedence)
    function parseAddSub(): number | null {
        let left = parseMulDiv();
        if (left === null) return null;

        while (peek()?.type === 'operator' && ['+', '-'].includes((peek() as { type: 'operator'; value: string }).value)) {
            const op = (consume() as { type: 'operator'; value: string }).value;
            const right = parseMulDiv();
            if (right === null) return null;
            left = op === '+' ? left + right : left - right;
        }

        return left;
    }

    // Parse multiplication/division/modulo
    function parseMulDiv(): number | null {
        let left = parsePower();
        if (left === null) return null;

        while (peek()?.type === 'operator' && ['*', '/', '%'].includes((peek() as { type: 'operator'; value: string }).value)) {
            const op = (consume() as { type: 'operator'; value: string }).value;
            const right = parsePower();
            if (right === null) return null;
            if (op === '*') left = left * right;
            else if (op === '/') left = right !== 0 ? left / right : null as unknown as number;
            else left = left % right;
            if (left === null) return null;
        }

        return left;
    }

    // Parse exponentiation (highest precedence, right-associative)
    function parsePower(): number | null {
        let base = parseUnary();
        if (base === null) return null;

        if (peek()?.type === 'operator' && (peek() as { type: 'operator'; value: string }).value === '^') {
            consume();
            const exp = parsePower(); // Right-associative
            if (exp === null) return null;
            base = Math.pow(base, exp);
        }

        return base;
    }

    // Parse unary minus
    function parseUnary(): number | null {
        if (peek()?.type === 'operator' && (peek() as { type: 'operator'; value: string }).value === '-') {
            consume();
            const val = parseUnary();
            return val !== null ? -val : null;
        }
        return parsePrimary();
    }

    // Parse numbers and parentheses
    function parsePrimary(): number | null {
        const token = peek();

        if (token?.type === 'number') {
            consume();
            return token.value;
        }

        if (token?.type === 'lparen') {
            consume();
            const result = parseAddSub();
            if (peek()?.type !== 'rparen') return null;
            consume();
            return result;
        }

        return null;
    }

    const result = parseAddSub();

    // Ensure all tokens were consumed
    if (pos !== tokens.length) return null;

    return result;
}

/**
 * Attempt to evaluate a string as a math expression.
 * Returns { expression: string, result: number } or null if not a valid math expression.
 */
function tryEvaluateMath(input: string): { expression: string; result: number } | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Must contain at least one operator to be considered a math expression
    if (!/[+\-*×÷/^%x]/.test(trimmed)) return null;

    // Must not start with a letter (except operators that look like letters)
    if (/^[a-wyzA-WYZ]/.test(trimmed)) return null;

    const tokens = tokenize(trimmed);
    if (!tokens) return null;

    // Need at least a number and an operator
    const hasNumber = tokens.some(t => t.type === 'number');
    const hasOperator = tokens.some(t => t.type === 'operator');
    if (!hasNumber || !hasOperator) return null;

    const result = evaluateTokens(tokens);
    if (result === null || !isFinite(result)) return null;

    return { expression: trimmed, result };
}

interface CommandPaletteProps {
    /** Whether the palette is visible */
    isOpen: boolean;
    /** Current application mode for filtering */
    currentMode: AppMode;
    /** Callback when a command is selected */
    onCommandSelect: (commandId: string) => void;
    /** Callback when palette is closed */
    onClose: () => void;
}

const CommandPalette: Component<CommandPaletteProps> = (props) => {
    const [searchQuery, setSearchQuery] = createSignal("");
    const [selectedIndex, setSelectedIndex] = createSignal(0);
    const [position, setPosition] = createSignal({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = createSignal(false);
    const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
    let inputRef: HTMLInputElement | undefined;
    let modalRef: HTMLDivElement | undefined;

    // Modal dimensions
    const MODAL_WIDTH = 450;
    const MODAL_MAX_HEIGHT = 380;

    // Get filtered commands based on mode and search
    const filteredCommands = createMemo(() => {
        const modeCommands = getCommandsForMode(props.currentMode);
        return filterCommands(modeCommands, searchQuery());
    });

    // Calculator mode: try to evaluate search query as math expression
    const calculationResult = createMemo(() => tryEvaluateMath(searchQuery()));
    const isCalculatorMode = createMemo(() => calculationResult() !== null);

    // Center modal when opened
    const centerModal = () => {
        const x = Math.max(0, (window.innerWidth - MODAL_WIDTH) / 2);
        const y = Math.max(0, (window.innerHeight - MODAL_MAX_HEIGHT) / 4); // Upper third
        setPosition({ x, y });
    };

    // Reset state when opened
    const handleOpen = () => {
        setSearchQuery("");
        setSelectedIndex(0);
        centerModal();
        // Focus input after render
        setTimeout(() => inputRef?.focus(), 10);
    };

    // Track when opened
    createEffect(() => {
        if (props.isOpen) {
            handleOpen();
        }
    });

    // Handle keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!props.isOpen) return;

        const commands = filteredCommands();

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, commands.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                // Calculator mode: copy result to clipboard
                if (isCalculatorMode()) {
                    const result = calculationResult()!.result;
                    const resultStr = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');
                    navigator.clipboard.writeText(resultStr).then(() => {
                        props.onClose();
                    });
                    return;
                }
                if (commands[selectedIndex()]) {
                    props.onCommandSelect(commands[selectedIndex()].id);
                }
                break;
            case "Escape":
                e.preventDefault();
                props.onClose();
                break;
        }
    };

    // Handle search input change
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setSelectedIndex(0); // Reset selection on search change
    };

    // Handle clicking outside to close
    const handleOverlayClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement).classList.contains("palette-overlay")) {
            props.onClose();
        }
    };

    // Drag handlers
    const startDrag = (e: MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position().x, y: e.clientY - position().y });

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newX = Math.max(0, Math.min(moveEvent.clientX - dragOffset().x, window.innerWidth - MODAL_WIDTH));
            const newY = Math.max(0, Math.min(moveEvent.clientY - dragOffset().y, window.innerHeight - 100));
            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Get category color
    const getCategoryColor = (category: Command["category"]): string => {
        switch (category) {
            case "geometry": return "#4CAF50";
            case "constraint": return "#FF9800";
            case "edit": return "#2196F3";
            case "dimension": return "#9C27B0";
            case "action": return "#607D8B";
            case "modeling": return "#E91E63";
            default: return "#666";
        }
    };

    return (
        <Show when={props.isOpen}>
            <div
                class="palette-overlay"
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0, 0, 0, 0.5)",
                    "z-index": 10000,
                }}
                onClick={handleOverlayClick}
                onKeyDown={handleKeyDown}
                data-testid="command-palette-overlay"
            >
                <div
                    ref={modalRef}
                    data-testid="command-palette"
                    style={{
                        position: "absolute",
                        top: `${position().y}px`,
                        left: `${position().x}px`,
                        background: "#2a2a2a",
                        "border-radius": "8px",
                        width: `${MODAL_WIDTH}px`,
                        "max-height": `${MODAL_MAX_HEIGHT}px`,
                        display: "flex",
                        "flex-direction": "column",
                        "box-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
                        border: "1px solid #444",
                        overflow: "hidden",
                        cursor: isDragging() ? "grabbing" : "auto",
                    }}
                >
                    {/* Draggable Header */}
                    <div
                        onMouseDown={startDrag}
                        style={{
                            padding: "8px 12px",
                            "border-bottom": "1px solid #444",
                            display: "flex",
                            "align-items": "center",
                            "justify-content": "space-between",
                            cursor: "grab",
                            background: "#333",
                            "user-select": "none",
                        }}
                    >
                        <span style={{ color: "#888", "font-size": "12px" }}>
                            Command Palette (⌘K)
                        </span>
                        <span style={{ color: "#555", "font-size": "10px" }}>⋮⋮</span>
                    </div>

                    {/* Search Input */}
                    <div style={{ padding: "10px 12px", "border-bottom": "1px solid #444" }}>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Type a command..."
                            value={searchQuery()}
                            onInput={(e) => handleSearchChange(e.currentTarget.value)}
                            data-testid="command-palette-input"
                            style={{
                                width: "100%",
                                padding: "8px 10px",
                                background: "#1a1a1a",
                                border: "1px solid #555",
                                "border-radius": "4px",
                                color: "#fff",
                                "font-size": "14px",
                                outline: "none",
                                "box-sizing": "border-box",
                            }}
                        />
                    </div>

                    {/* Calculator Result Preview (Raycast-style) */}
                    <Show when={isCalculatorMode()}>
                        <div
                            style={{
                                padding: "12px 16px",
                                background: "linear-gradient(135deg, #1e3a5f 0%, #2d2d44 100%)",
                                "border-bottom": "1px solid #444",
                                display: "flex",
                                "align-items": "center",
                                "justify-content": "center",
                                gap: "20px",
                            }}
                        >
                            {/* Expression side */}
                            <div style={{ "text-align": "center" }}>
                                <div style={{ color: "#fff", "font-size": "24px", "font-weight": "bold" }}>
                                    {calculationResult()!.expression.replace(/\*/g, '×').replace(/\//g, '÷')}
                                </div>
                                <div
                                    style={{
                                        background: "#444",
                                        color: "#aaa",
                                        padding: "3px 8px",
                                        "border-radius": "4px",
                                        "font-size": "10px",
                                        "margin-top": "6px",
                                        display: "inline-block",
                                    }}
                                >
                                    Expression
                                </div>
                            </div>

                            {/* Arrow */}
                            <span style={{ color: "#888", "font-size": "20px" }}>→</span>

                            {/* Result side */}
                            <div style={{ "text-align": "center" }}>
                                <div style={{ color: "#4CAF50", "font-size": "24px", "font-weight": "bold" }}>
                                    {(() => {
                                        const result = calculationResult()!.result;
                                        return Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');
                                    })()}
                                </div>
                                <div
                                    style={{
                                        background: "#4CAF50",
                                        color: "#fff",
                                        padding: "3px 8px",
                                        "border-radius": "4px",
                                        "font-size": "10px",
                                        "margin-top": "6px",
                                        display: "inline-block",
                                    }}
                                >
                                    Result
                                </div>
                            </div>
                        </div>
                    </Show>

                    {/* Command List */}
                    <div
                        style={{
                            "overflow-y": "auto",
                            flex: 1,
                            "max-height": "240px",
                        }}
                    >
                        <For each={filteredCommands()}>
                            {(command, index) => (
                                <div
                                    onClick={() => props.onCommandSelect(command.id)}
                                    data-testid="command-item"
                                    style={{
                                        padding: "8px 12px",
                                        cursor: "pointer",
                                        background: index() === selectedIndex() ? "#3a3a3a" : "transparent",
                                        "border-left": index() === selectedIndex() ? "3px solid #007bff" : "3px solid transparent",
                                        display: "flex",
                                        "align-items": "center",
                                        gap: "10px",
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index())}
                                >
                                    {/* Category Badge */}
                                    <span
                                        style={{
                                            background: getCategoryColor(command.category),
                                            color: "#fff",
                                            padding: "2px 5px",
                                            "border-radius": "3px",
                                            "font-size": "9px",
                                            "text-transform": "uppercase",
                                            "font-weight": "bold",
                                            "min-width": "60px",
                                            "text-align": "center",
                                        }}
                                        data-testid="command-category"
                                    >
                                        {command.category}
                                    </span>

                                    {/* Command Info */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: "#fff", "font-size": "13px" }} data-testid="command-name">
                                            {command.name}
                                        </div>
                                        <div style={{ color: "#777", "font-size": "11px" }}>
                                            {command.description}
                                        </div>
                                    </div>

                                    {/* Shortcut */}
                                    {command.shortcut && (
                                        <span
                                            style={{
                                                background: "#444",
                                                color: "#aaa",
                                                padding: "2px 6px",
                                                "border-radius": "3px",
                                                "font-size": "10px",
                                                "font-family": "monospace",
                                            }}
                                            data-testid="command-shortcut"
                                        >
                                            {command.shortcut}
                                        </span>
                                    )}
                                </div>
                            )}
                        </For>

                        {/* Empty state */}
                        {filteredCommands().length === 0 && (
                            <div
                                style={{
                                    padding: "16px",
                                    "text-align": "center",
                                    color: "#666",
                                }}
                            >
                                No commands found
                            </div>
                        )}
                    </div>

                    {/* Footer hint */}
                    <div
                        style={{
                            padding: "6px 10px",
                            "border-top": "1px solid #444",
                            color: "#555",
                            "font-size": "10px",
                            display: "flex",
                            gap: "12px",
                            background: "#2a2a2a",
                        }}
                    >
                        <Show when={!isCalculatorMode()}>
                            <span>↑↓ Navigate</span>
                        </Show>
                        <span>
                            Enter {isCalculatorMode() ? "Copy to clipboard" : "Select"}
                        </span>
                        <span>Esc Close</span>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default CommandPalette;
