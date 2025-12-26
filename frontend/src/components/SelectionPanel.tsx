import { type Component, For, Show } from 'solid-js';

interface TopoId {
    feature_id: string;
    local_id: number;
    rank: 'Face' | 'Edge' | 'Vertex' | 'Body';
}

interface SelectionPanelProps {
    selection: TopoId[];
    onDeselect: (topoId: TopoId) => void;
    onClearAll: () => void;
}

const rankIcons: Record<string, string> = {
    Face: '▢',
    Edge: '—',
    Vertex: '•',
    Body: '◆'
};

const rankColors: Record<string, string> = {
    Face: '#4a9eff',
    Edge: '#ffaa00',
    Vertex: '#ff6b6b',
    Body: '#9b59b6'
};

const SelectionPanel: Component<SelectionPanelProps> = (props) => {
    const formatId = (id: string) => id.slice(0, 8);

    return (
        <Show when={props.selection.length > 0}>
            <div class="selection-panel" data-testid="selection-panel">
                <div class="selection-panel-header">
                    <span class="selection-panel-title" data-testid="selection-count">
                        Selection ({props.selection.length})
                    </span>
                    <button
                        class="selection-panel-clear"
                        onClick={() => props.onClearAll()}
                        title="Clear all selections"
                    >
                        Clear
                    </button>
                </div>
                <div class="selection-panel-list">
                    <For each={props.selection}>
                        {(item) => (
                            <div class="selection-panel-item" data-testid="selection-item">
                                <span
                                    class="selection-item-icon"
                                    style={{ color: rankColors[item.rank] || '#fff' }}
                                >
                                    {rankIcons[item.rank] || '?'}
                                </span>
                                <span class="selection-item-label" data-testid="selection-type">
                                    {item.rank} {formatId(item.feature_id)}:{item.local_id}
                                </span>
                                <button
                                    class="selection-item-remove"
                                    onClick={() => props.onDeselect(item)}
                                    title="Deselect"
                                    data-testid="selection-delete-btn"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </For>
                </div>
            </div>
        </Show>
    );
};

export default SelectionPanel;
