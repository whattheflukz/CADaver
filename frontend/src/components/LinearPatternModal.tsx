import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';

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
            <div
                onClick={() => props.onFieldFocus('direction')}
                style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
                data-testid="pattern-direction-select"
            >
                <div style={{
                    "font-size": '12px',
                    color: props.activeField === 'direction' ? '#4a90e2' : '#aaa',
                    "font-weight": props.activeField === 'direction' ? 'bold' : 'normal'
                }}>
                    Direction (Line)
                </div>
                <div style={{
                    "font-size": '14px',
                    padding: '8px',
                    background: '#3a3a3a',
                    "border-radius": '4px',
                    border: props.activeField === 'direction'
                        ? '2px solid #4a90e2'
                        : (props.selectedDirection ? '1px solid #666' : '1px dashed #666'),
                    color: props.selectedDirection ? 'white' : '#888',
                    "box-sizing": 'border-box'
                }}>
                    {props.selectedDirection ? "Line Selected" : "Select a line..."}
                </div>
            </div>

            {/* Entities Selection */}
            <div
                onClick={() => props.onFieldFocus('entities')}
                style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
                data-testid="pattern-entities-select"
            >
                <div style={{
                    "font-size": '12px',
                    color: props.activeField === 'entities' ? '#4a90e2' : '#aaa',
                    "font-weight": props.activeField === 'entities' ? 'bold' : 'normal'
                }}>
                    Entities to Pattern
                </div>
                <div style={{
                    "font-size": '14px',
                    padding: '8px',
                    background: '#3a3a3a',
                    "border-radius": '4px',
                    border: props.activeField === 'entities' ? '2px solid #4a90e2' : '1px solid #666',
                    color: 'white',
                    "box-sizing": 'border-box'
                }}>
                    {props.selectedEntityCount} selected
                </div>
            </div>

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
