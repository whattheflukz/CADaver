/**
 * KeyboardShortcutsModal - View and customize keyboard shortcuts
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Keyboard shortcut system
 */

import { type Component, createSignal, For, Show } from 'solid-js';
import { type Command, COMMAND_DEFINITIONS } from '../commandRegistry';
import { formatShortcut, normalizeShortcut } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
    getShortcut: (commandId: string) => string | undefined;
    setShortcut: (commandId: string, shortcut: string) => void;
    resetShortcut: (commandId: string) => void;
    resetAllShortcuts: () => void;
    hasConflict: (commandId: string, shortcut: string) => string | null;
}

const KeyboardShortcutsModal: Component<KeyboardShortcutsModalProps> = (props) => {
    const [recordingFor, setRecordingFor] = createSignal<string | null>(null);
    const [pendingShortcut, setPendingShortcut] = createSignal<string>('');
    const [conflictWarning, setConflictWarning] = createSignal<{ commandId: string; conflictsWith: string } | null>(null);

    // Group commands by category
    const groupedCommands = () => {
        const groups: Record<string, Command[]> = {};
        for (const cmd of COMMAND_DEFINITIONS) {
            if (!groups[cmd.category]) {
                groups[cmd.category] = [];
            }
            groups[cmd.category].push(cmd);
        }
        return groups;
    };

    const categoryLabels: Record<string, string> = {
        geometry: '📐 Geometry Tools',
        constraint: '🔗 Constraints',
        edit: '✏️ Edit Tools',
        dimension: '📏 Dimensions',
        action: '⚡ Actions',
        modeling: '🧊 3D Modeling',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!recordingFor()) return;

        e.preventDefault();
        e.stopPropagation();

        // Ignore modifier-only keys
        if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
            return;
        }

        // Build shortcut string
        const parts: string[] = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.metaKey) parts.push('Ctrl'); // Treat Cmd as Ctrl for cross-platform
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');

        let key = e.key;
        if (key === ' ') key = 'Space';
        if (key.length === 1) key = key.toUpperCase();
        parts.push(key);

        const shortcut = parts.join('+');
        setPendingShortcut(shortcut);

        // Check for conflicts
        const conflict = props.hasConflict(recordingFor()!, shortcut);
        if (conflict) {
            const conflictCmd = COMMAND_DEFINITIONS.find(c => c.id === conflict);
            setConflictWarning({ commandId: recordingFor()!, conflictsWith: conflictCmd?.name || conflict });
        } else {
            setConflictWarning(null);
        }
    };

    const applyShortcut = () => {
        const cmdId = recordingFor();
        const shortcut = pendingShortcut();
        if (cmdId && shortcut) {
            props.setShortcut(cmdId, shortcut);
        }
        setRecordingFor(null);
        setPendingShortcut('');
        setConflictWarning(null);
    };

    const cancelRecording = () => {
        setRecordingFor(null);
        setPendingShortcut('');
        setConflictWarning(null);
    };

    const startRecording = (commandId: string) => {
        setRecordingFor(commandId);
        setPendingShortcut('');
        setConflictWarning(null);
    };

    const handleReset = (commandId: string) => {
        props.resetShortcut(commandId);
    };

    const handleResetAll = () => {
        if (confirm('Reset all shortcuts to defaults?')) {
            props.resetAllShortcuts();
        }
    };

    // Current shortcut for a command (display purposes)
    const getDisplayShortcut = (commandId: string) => {
        const shortcut = props.getShortcut(commandId);
        return shortcut ? formatShortcut(shortcut) : '—';
    };

    const isCustom = (commandId: string) => {
        const current = props.getShortcut(commandId);
        const defaultCmd = COMMAND_DEFINITIONS.find(c => c.id === commandId);
        if (!current && !defaultCmd?.shortcut) return false;
        if (!current || !defaultCmd?.shortcut) return true;
        return normalizeShortcut(current) !== normalizeShortcut(defaultCmd.shortcut);
    };

    return (
        <Show when={props.isOpen}>
            <div
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    'z-index': 3000,
                }}
                onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
                onKeyDown={handleKeyDown}
            >
                <div style={{
                    background: '#2a2a2a',
                    'border-radius': '12px',
                    padding: '20px',
                    width: '600px',
                    'max-height': '80vh',
                    'overflow-y': 'auto',
                    color: 'white',
                    border: '1px solid #444',
                }}>
                    <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
                        <h2 style={{ margin: 0 }}>⌨️ Keyboard Shortcuts</h2>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleResetAll}
                                style={{
                                    background: '#555',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 12px',
                                    'border-radius': '4px',
                                    cursor: 'pointer',
                                    'font-size': '12px',
                                }}
                            >
                                Reset All
                            </button>
                            <button
                                onClick={props.onClose}
                                style={{
                                    background: '#444',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 12px',
                                    'border-radius': '4px',
                                    cursor: 'pointer',
                                    'font-size': '16px',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Recording overlay */}
                    <Show when={recordingFor()}>
                        <div style={{
                            background: '#1a1a2e',
                            border: '2px solid #4a9eff',
                            'border-radius': '8px',
                            padding: '20px',
                            'margin-bottom': '20px',
                            'text-align': 'center',
                        }}>
                            <div style={{ 'font-size': '14px', 'margin-bottom': '10px' }}>
                                Recording shortcut for: <strong>{COMMAND_DEFINITIONS.find(c => c.id === recordingFor())?.name}</strong>
                            </div>
                            <div style={{
                                'font-size': '24px',
                                'font-family': 'monospace',
                                padding: '10px',
                                background: '#2a2a3e',
                                'border-radius': '4px',
                                'min-height': '40px',
                            }}>
                                {pendingShortcut() || 'Press keys...'}
                            </div>
                            <Show when={conflictWarning()}>
                                <div style={{ color: '#ff6b6b', 'margin-top': '10px', 'font-size': '13px' }}>
                                    ⚠️ Conflicts with: {conflictWarning()!.conflictsWith}
                                </div>
                            </Show>
                            <div style={{ display: 'flex', gap: '10px', 'justify-content': 'center', 'margin-top': '15px' }}>
                                <button
                                    onClick={applyShortcut}
                                    disabled={!pendingShortcut()}
                                    style={{
                                        background: pendingShortcut() ? '#28a745' : '#555',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 20px',
                                        'border-radius': '4px',
                                        cursor: pendingShortcut() ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Apply
                                </button>
                                <button
                                    onClick={cancelRecording}
                                    style={{
                                        background: '#666',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 20px',
                                        'border-radius': '4px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </Show>

                    {/* Shortcut list by category */}
                    <For each={Object.entries(groupedCommands())}>
                        {([category, commands]) => (
                            <div style={{ 'margin-bottom': '20px' }}>
                                <h3 style={{
                                    'font-size': '14px',
                                    color: '#888',
                                    'border-bottom': '1px solid #444',
                                    'padding-bottom': '5px',
                                    'margin-bottom': '10px',
                                }}>
                                    {categoryLabels[category] || category}
                                </h3>
                                <For each={commands}>
                                    {(cmd) => (
                                        <div style={{
                                            display: 'flex',
                                            'justify-content': 'space-between',
                                            'align-items': 'center',
                                            padding: '8px 10px',
                                            'border-radius': '4px',
                                            background: recordingFor() === cmd.id ? '#3a3a5a' : 'transparent',
                                        }}>
                                            <div>
                                                <div style={{ 'font-weight': 500 }}>{cmd.name}</div>
                                                <div style={{ 'font-size': '12px', color: '#888' }}>{cmd.description}</div>
                                            </div>
                                            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                                                <span
                                                    onClick={() => startRecording(cmd.id)}
                                                    style={{
                                                        background: '#444',
                                                        padding: '4px 10px',
                                                        'border-radius': '4px',
                                                        'font-family': 'monospace',
                                                        'font-size': '13px',
                                                        cursor: 'pointer',
                                                        border: isCustom(cmd.id) ? '1px solid #4a9eff' : '1px solid transparent',
                                                    }}
                                                >
                                                    {getDisplayShortcut(cmd.id)}
                                                </span>
                                                <Show when={isCustom(cmd.id)}>
                                                    <button
                                                        onClick={() => handleReset(cmd.id)}
                                                        title="Reset to default"
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#888',
                                                            cursor: 'pointer',
                                                            padding: '2px 6px',
                                                            'font-size': '14px',
                                                        }}
                                                    >
                                                        ↺
                                                    </button>
                                                </Show>
                                            </div>
                                        </div>
                                    )}
                                </For>
                            </div>
                        )}
                    </For>

                    <div style={{
                        'font-size': '12px',
                        color: '#666',
                        'text-align': 'center',
                        'margin-top': '20px',
                        'padding-top': '15px',
                        'border-top': '1px solid #333',
                    }}>
                        Click on a shortcut to change it. Custom shortcuts are highlighted with a blue border.
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default KeyboardShortcutsModal;
