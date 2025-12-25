/**
 * useKeyboardShortcuts - Centralized keyboard shortcut manager
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Keyboard shortcut system
 * 
 * Features:
 * - Mode-aware shortcuts (sketch vs modeling)
 * - Customizable shortcuts with localStorage persistence
 * - Conflict detection
 * - Input focus handling (ignores shortcuts when typing)
 */

import { createSignal, onMount, onCleanup, type Accessor, createMemo } from 'solid-js';
import { type AppMode, COMMAND_DEFINITIONS, type Command } from '../commandRegistry';
import { type ShortcutConfig } from '../types';

const STORAGE_KEY = 'cad_keyboard_shortcuts';
const STORAGE_VERSION = 1;

/** Normalize a shortcut string for consistent comparison */
export function normalizeShortcut(shortcut: string): string {
    if (!shortcut) return '';

    const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
    const modifiers: string[] = [];
    let key = '';

    for (const part of parts) {
        if (part === 'ctrl' || part === 'control') {
            modifiers.push('ctrl');
        } else if (part === 'cmd' || part === 'meta' || part === '⌘') {
            modifiers.push('meta');
        } else if (part === 'shift') {
            modifiers.push('shift');
        } else if (part === 'alt' || part === 'option' || part === '⌥') {
            modifiers.push('alt');
        } else {
            key = part;
        }
    }

    // Sort modifiers for consistent ordering
    modifiers.sort();

    if (key) {
        return [...modifiers, key].join('+');
    }
    return modifiers.join('+');
}

/** Check if a keyboard event matches a shortcut string */
export function matchesKeyEvent(shortcut: string, event: KeyboardEvent): boolean {
    if (!shortcut) return false;

    const normalized = normalizeShortcut(shortcut);
    const parts = normalized.split('+');

    const eventKey = event.key.toLowerCase();
    const eventCode = event.code.toLowerCase();

    // Build what the event represents
    const eventParts: string[] = [];
    if (event.ctrlKey) eventParts.push('ctrl');
    if (event.metaKey) eventParts.push('meta');
    if (event.shiftKey) eventParts.push('shift');
    if (event.altKey) eventParts.push('alt');

    // Get the actual key (not modifier)
    let keyPart = '';
    if (!['control', 'meta', 'shift', 'alt'].includes(eventKey)) {
        keyPart = eventKey;
    }

    // Special key mappings
    if (eventCode === 'escape') keyPart = 'escape';
    if (eventCode === 'backspace') keyPart = 'backspace';
    if (eventCode === 'delete') keyPart = 'delete';
    if (eventCode === 'enter') keyPart = 'enter';

    if (keyPart) {
        eventParts.push(keyPart);
    }

    eventParts.sort();

    // Compare
    return eventParts.join('+') === parts.sort().join('+');
}

/** Format shortcut for display (platform-aware) */
export function formatShortcut(shortcut: string): string {
    if (!shortcut) return '';

    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts = shortcut.split('+');

    return parts.map(p => {
        const lower = p.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') return isMac ? '⌃' : 'Ctrl';
        if (lower === 'meta' || lower === 'cmd') return isMac ? '⌘' : 'Win';
        if (lower === 'shift') return isMac ? '⇧' : 'Shift';
        if (lower === 'alt' || lower === 'option') return isMac ? '⌥' : 'Alt';
        if (lower === 'escape') return 'Esc';
        if (lower === 'backspace') return '⌫';
        if (lower === 'delete') return 'Del';
        if (lower === 'enter') return '↵';
        return p.toUpperCase();
    }).join(isMac ? '' : '+');
}

/** Load custom shortcuts from localStorage */
function loadCustomShortcuts(): ShortcutConfig {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as ShortcutConfig;
            if (parsed.version === STORAGE_VERSION) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Failed to load custom shortcuts:', e);
    }
    return { version: STORAGE_VERSION, bindings: {} };
}

/** Save custom shortcuts to localStorage */
function saveCustomShortcuts(config: ShortcutConfig): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('Failed to save custom shortcuts:', e);
    }
}

export interface UseKeyboardShortcutsParams {
    currentMode: Accessor<AppMode>;
    onCommand: (commandId: string) => void;
    enabled: Accessor<boolean>;
}

export interface UseKeyboardShortcutsReturn {
    /** Get the current shortcut for a command (custom or default) */
    getShortcut: (commandId: string) => string | undefined;
    /** Set a custom shortcut for a command */
    setShortcut: (commandId: string, shortcut: string) => void;
    /** Reset a command to its default shortcut */
    resetShortcut: (commandId: string) => void;
    /** Reset all shortcuts to defaults */
    resetAllShortcuts: () => void;
    /** Check if a shortcut has a conflict */
    hasConflict: (commandId: string, shortcut: string) => string | null;
    /** Get all current bindings */
    getAllBindings: () => Array<{ command: Command; shortcut: string; isCustom: boolean }>;
}

export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams): UseKeyboardShortcutsReturn {
    const { currentMode, onCommand, enabled } = params;

    const [customShortcuts, setCustomShortcuts] = createSignal<ShortcutConfig>(loadCustomShortcuts());

    // Build shortcut -> commandId map for O(1) lookup
    const shortcutMap = createMemo(() => {
        const map = new Map<string, string>();
        const custom = customShortcuts().bindings;

        for (const cmd of COMMAND_DEFINITIONS) {
            const shortcut = custom[cmd.id] ?? cmd.shortcut;
            if (shortcut) {
                const normalized = normalizeShortcut(shortcut);
                map.set(normalized, cmd.id);
            }
        }

        return map;
    });

    const getShortcut = (commandId: string): string | undefined => {
        const custom = customShortcuts().bindings[commandId];
        if (custom !== undefined) return custom;
        const cmd = COMMAND_DEFINITIONS.find(c => c.id === commandId);
        return cmd?.shortcut;
    };

    const setShortcut = (commandId: string, shortcut: string) => {
        const current = customShortcuts();
        const newBindings = { ...current.bindings, [commandId]: shortcut };
        const updated = { ...current, bindings: newBindings };
        setCustomShortcuts(updated);
        saveCustomShortcuts(updated);
    };

    const resetShortcut = (commandId: string) => {
        const current = customShortcuts();
        const newBindings = { ...current.bindings };
        delete newBindings[commandId];
        const updated = { ...current, bindings: newBindings };
        setCustomShortcuts(updated);
        saveCustomShortcuts(updated);
    };

    const resetAllShortcuts = () => {
        const empty: ShortcutConfig = { version: STORAGE_VERSION, bindings: {} };
        setCustomShortcuts(empty);
        saveCustomShortcuts(empty);
    };

    const hasConflict = (commandId: string, shortcut: string): string | null => {
        if (!shortcut) return null;
        const normalized = normalizeShortcut(shortcut);
        const custom = customShortcuts().bindings;

        for (const cmd of COMMAND_DEFINITIONS) {
            if (cmd.id === commandId) continue;
            const cmdShortcut = custom[cmd.id] ?? cmd.shortcut;
            if (cmdShortcut && normalizeShortcut(cmdShortcut) === normalized) {
                return cmd.id;
            }
        }
        return null;
    };

    const getAllBindings = () => {
        const custom = customShortcuts().bindings;
        return COMMAND_DEFINITIONS.map(cmd => ({
            command: cmd,
            shortcut: custom[cmd.id] ?? cmd.shortcut ?? '',
            isCustom: cmd.id in custom
        }));
    };

    // Register global keydown handler
    onMount(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!enabled()) return;

            // Ignore if typing in an input
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                // Exception: Escape should always work
                if (e.key !== 'Escape') return;
            }

            const mode = currentMode();
            const map = shortcutMap();

            // Try to match a shortcut
            for (const [shortcut, commandId] of map.entries()) {
                if (matchesKeyEvent(shortcut, e)) {
                    // Check if command is valid for current mode
                    const cmd = COMMAND_DEFINITIONS.find(c => c.id === commandId);
                    if (cmd && (cmd.modes.includes(mode) || cmd.modes.includes('all'))) {
                        e.preventDefault();
                        e.stopPropagation();
                        onCommand(commandId);
                        return;
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        onCleanup(() => window.removeEventListener('keydown', handleKeyDown, true));
    });

    return {
        getShortcut,
        setShortcut,
        resetShortcut,
        resetAllShortcuts,
        hasConflict,
        getAllBindings
    };
}
