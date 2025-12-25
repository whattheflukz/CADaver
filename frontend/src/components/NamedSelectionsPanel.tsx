import { type Component, For, createSignal, Show } from 'solid-js';
import { BaseModal } from './BaseModal';

interface SelectionGroup {
    name: string;
    count: number;
}

interface NamedSelectionsPanelProps {
    isOpen: boolean;
    groups: SelectionGroup[];
    currentSelectionCount: number;
    onCreateGroup: (name: string) => void;
    onRestoreGroup: (name: string) => void;
    onDeleteGroup: (name: string) => void;
    onClose: () => void;
}

const NamedSelectionsPanel: Component<NamedSelectionsPanelProps> = (props) => {
    const [newGroupName, setNewGroupName] = createSignal('');
    const [isAddingGroup, setIsAddingGroup] = createSignal(false);

    const handleCreateGroup = () => {
        const name = newGroupName().trim();
        if (name) {
            props.onCreateGroup(name);
            setNewGroupName('');
            setIsAddingGroup(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreateGroup();
        } else if (e.key === 'Escape') {
            setIsAddingGroup(false);
            setNewGroupName('');
        }
    };

    return (
        <BaseModal
            isOpen={props.isOpen}
            title="Named Selections"
            onConfirm={props.onClose}
            onCancel={props.onClose}
            confirmLabel="Close"
            showCancel={false}
            width={280}
            persistenceKey="named_selections"
        >
            {/* Save Current Selection */}
            <div style={{
                display: 'flex',
                "flex-direction": 'column',
                gap: '8px',
                "padding-bottom": '12px',
                "border-bottom": '1px solid #444'
            }}>
                <Show
                    when={isAddingGroup()}
                    fallback={
                        <button
                            onClick={() => setIsAddingGroup(true)}
                            disabled={props.currentSelectionCount === 0}
                            style={{
                                padding: '8px 12px',
                                background: props.currentSelectionCount === 0 ? '#3a3a3a' : '#2a6d3a',
                                border: 'none',
                                color: 'white',
                                "border-radius": '4px',
                                cursor: props.currentSelectionCount === 0 ? 'not-allowed' : 'pointer',
                                "font-size": '13px',
                                opacity: props.currentSelectionCount === 0 ? 0.5 : 1.0
                            }}
                        >
                            Save Current Selection ({props.currentSelectionCount} items)
                        </button>
                    }
                >
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="text"
                            value={newGroupName()}
                            onInput={(e) => setNewGroupName(e.currentTarget.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Group name..."
                            autofocus
                            style={{
                                flex: 1,
                                padding: '6px 10px',
                                background: '#1e1e1e',
                                border: '1px solid #555',
                                "border-radius": '4px',
                                color: 'white',
                                "font-size": '13px'
                            }}
                        />
                        <button
                            onClick={handleCreateGroup}
                            disabled={!newGroupName().trim()}
                            style={{
                                padding: '6px 12px',
                                background: newGroupName().trim() ? '#2a6d3a' : '#3a3a3a',
                                border: 'none',
                                color: 'white',
                                "border-radius": '4px',
                                cursor: newGroupName().trim() ? 'pointer' : 'not-allowed',
                                "font-size": '13px'
                            }}
                        >
                            Save
                        </button>
                    </div>
                </Show>
            </div>

            {/* Groups List */}
            <div style={{
                "max-height": '200px',
                "overflow-y": 'auto',
                display: 'flex',
                "flex-direction": 'column',
                gap: '4px'
            }}>
                <Show
                    when={props.groups.length > 0}
                    fallback={
                        <div style={{
                            color: '#777',
                            "font-size": '12px',
                            "text-align": 'center',
                            padding: '12px'
                        }}>
                            No saved selections yet
                        </div>
                    }
                >
                    <For each={props.groups}>
                        {(group) => (
                            <div style={{
                                display: 'flex',
                                "align-items": 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                background: '#1e1e1e',
                                "border-radius": '4px'
                            }}>
                                <button
                                    onClick={() => props.onRestoreGroup(group.name)}
                                    style={{
                                        flex: 1,
                                        padding: '4px 8px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        "font-size": '13px',
                                        "text-align": 'left'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#4a90e2'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = 'white'}
                                >
                                    {group.name}
                                </button>
                                <span style={{
                                    color: '#777',
                                    "font-size": '11px',
                                    "min-width": '40px',
                                    "text-align": 'right'
                                }}>
                                    {group.count} item{group.count !== 1 ? 's' : ''}
                                </span>
                                <button
                                    onClick={() => props.onDeleteGroup(group.name)}
                                    style={{
                                        padding: '2px 6px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#888',
                                        cursor: 'pointer',
                                        "font-size": '14px',
                                        "line-height": 1
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#e74c3c'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
                                    title="Delete group"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </For>
                </Show>
            </div>

            {/* Keyboard hint */}
            <div style={{
                "font-size": '11px',
                color: '#666',
                "text-align": 'center',
                "padding-top": '8px',
                "border-top": '1px solid #333'
            }}>
                Tip: Press Ctrl+G to quickly save current selection
            </div>
        </BaseModal>
    );
};

export default NamedSelectionsPanel;
