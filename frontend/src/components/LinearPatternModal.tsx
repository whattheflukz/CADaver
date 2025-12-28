import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';
import { SelectionField } from './SelectionField';

interface LinearPatternModalProps {
    selectedDirection: string | null;
    selectedEntityCount: number;
    count: number;
    spacing: number;
    activeField: 'direction' | 'entities';
    onFieldFocus: (field: 'direction' | 'entities') => void;
    onCountChange: (count: number) => void;
    onSpacingChange: (spacing: number) => void;
    onFlip: () => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const LinearPatternModal: Component<LinearPatternModalProps> = (props) => {
    return (
        <BaseModal
            isOpen={true}
            title="Linear Pattern"
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            confirmDisabled={!props.selectedDirection || props.selectedEntityCount === 0 || props.count < 2}
            width={300}
            testId="linear-pattern-modal"
            confirmTestId="pattern-confirm"
            cancelTestId="pattern-cancel"
        >
            {/* Direction Line Selection */}
            <SelectionField
                label="Direction (Line)"
                value={props.selectedDirection}
                displayText={props.selectedDirection ? "Line Selected" : "Select a line..."}
                placeholder="Select a line..."
                active={props.activeField === 'direction'}
                onClick={() => props.onFieldFocus('direction')}
                testId="pattern-direction-select"
            />

            {/* Entities Selection */}
            <SelectionField
                label="Entities to Pattern"
                count={props.selectedEntityCount}
                active={props.activeField === 'entities'}
                onClick={() => props.onFieldFocus('entities')}
                testId="pattern-entities-select"
            />

            {/* Count Input */}
            <div style={{ display: 'flex', "flex-direction": 'column', gap: '4px' }}>
                <div style={{ "font-size": '12px', color: '#aaa' }}>
                    Count
                </div>
                <input
                    type="number"
                    min="2"
                    max="100"
                    value={props.count}
                    onChange={(e) => props.onCountChange(parseInt(e.currentTarget.value) || 2)}
                    data-testid="pattern-count-input"
                    style={{
                        padding: '8px',
                        background: '#3a3a3a',
                        border: '1px solid #666',
                        "border-radius": '4px',
                        color: 'white',
                        "font-size": '14px'
                    }}
                />
            </div>

            {/* Spacing Input */}
            <div style={{ display: 'flex', "flex-direction": 'column', gap: '4px' }}>
                <div style={{ "font-size": '12px', color: '#aaa' }}>
                    Spacing
                </div>
                <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={props.spacing}
                    onChange={(e) => props.onSpacingChange(parseFloat(e.currentTarget.value) || 1)}
                    data-testid="pattern-spacing-input"
                    style={{
                        padding: '8px',
                        background: '#3a3a3a',
                        border: '1px solid #666',
                        "border-radius": '4px',
                        color: 'white',
                        "font-size": '14px'
                    }}
                />
            </div>

            <button
                onClick={props.onFlip}
                data-testid="pattern-flip-btn"
                style={{
                    background: "#3a3a3a",
                    color: "white",
                    border: "1px solid #555",
                    padding: "8px",
                    "border-radius": "4px",
                    cursor: "pointer",
                    "font-size": "13px",
                    "margin-top": "4px",
                    transition: "background 0.15s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#4a4a4a'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#3a3a3a'}
            >
                ⇄ Flip Direction
            </button>
        </BaseModal>
    );
};
