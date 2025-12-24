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
 */

import { type Component, createSignal, createMemo, For, Show, createEffect, onMount } from "solid-js";
import {
    type Command,
    type AppMode,
    getCommandsForMode,
    filterCommands
} from "../commandRegistry";

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
            >
                <div
                    ref={modalRef}
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
                                    >
                                        {command.category}
                                    </span>

                                    {/* Command Info */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: "#fff", "font-size": "13px" }}>
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
                        <span>↑↓ Navigate</span>
                        <span>Enter Select</span>
                        <span>Esc Close</span>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default CommandPalette;
