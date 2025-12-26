import { type Component, For, Show } from 'solid-js';
import { type SelectionCandidate, type SketchEntity } from '../types';

interface SketchSelectionPanelProps {
    selection: SelectionCandidate[];
    entities: SketchEntity[];
    onDeselect: (candidate: SelectionCandidate) => void;
    onClearAll: () => void;
}

const typeIcons: Record<string, string> = {
    point: '•',
    origin: '⌖',
    line: '—',
    circle: '◯',
    arc: '◠',
    entity: '□'
};

const typeColors: Record<string, string> = {
    point: '#ff6b6b',
    origin: '#ff6b6b',
    line: '#4a9eff',
    circle: '#4a9eff',
    arc: '#4a9eff',
    entity: '#a0a0a0'
};

const SketchSelectionPanel: Component<SketchSelectionPanelProps> = (props) => {
    const formatId = (id: string) => id.slice(0, 8);

    const getEntityDetails = (candidate: SelectionCandidate) => {
        if (candidate.type === 'origin') return { type: 'origin', label: 'Origin' };

        const ent = props.entities.find(e => e.id === candidate.id);
        if (!ent) return { type: candidate.type, label: `Unknown ${formatId(candidate.id)}` };

        let type = 'entity';
        let label = 'Entity';

        if (ent.geometry.Line) { type = 'line'; label = 'Line'; }
        else if (ent.geometry.Circle) { type = 'circle'; label = 'Circle'; }
        else if (ent.geometry.Arc) { type = 'arc'; label = 'Arc'; }
        else if (ent.geometry.Point) { type = 'point'; label = 'Point'; }

        // If selecting a point on an entity (endpoint)
        if (candidate.type === 'point' && candidate.index !== undefined) {
            type = 'point';
            label = `${label} Point ${candidate.index}`;
        } else {
            label = `${label} ${formatId(ent.id)}`;
        }

        return { type, label };
    };

    return (
        <Show when={props.selection.length > 0}>
            <div class="selection-panel" data-testid="selection-panel">
                <div class="selection-panel-header">
                    <span class="selection-panel-title" data-testid="selection-count">
                        Sketch Selection ({props.selection.length})
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
                        {(item) => {
                            const details = getEntityDetails(item);
                            return (
                                <div class="selection-panel-item" data-testid="selection-item">
                                    <span
                                        class="selection-item-icon"
                                        style={{ color: typeColors[details.type] || '#fff' }}
                                    >
                                        {typeIcons[details.type] || '?'}
                                    </span>
                                    <span class="selection-item-label" data-testid="selection-type">
                                        {details.label}
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
                            );
                        }}
                    </For>
                </div>
            </div>
        </Show>
    );
};

export default SketchSelectionPanel;
