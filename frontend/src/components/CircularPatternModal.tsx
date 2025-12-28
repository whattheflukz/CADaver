import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';
import { SelectionField } from './SelectionField';

interface CircularPatternModalProps {
    centerType: 'origin' | 'point' | null;
    selectedCenterId: string | null;
    selectedEntityCount: number;
    count: number;
    totalAngle: number; // degrees
    activeField: 'center' | 'entities';
    onFieldFocus: (field: 'center' | 'entities') => void;
    onCenterTypeChange: (type: 'origin' | 'point') => void;
    onCountChange: (count: number) => void;
    onAngleChange: (angle: number) => void;
    onFlip: () => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const CircularPatternModal: Component<CircularPatternModalProps> = (props) => {
    return (
        <BaseModal
            isOpen={true}
            title="Circular Pattern"
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            confirmDisabled={!((props.centerType === 'origin' || (props.centerType === 'point' && props.selectedCenterId)) && props.selectedEntityCount > 0 && props.count >= 2)}
            width={300}
            testId="circular-pattern-modal"
            confirmTestId="pattern-confirm"
            cancelTestId="pattern-cancel"
        >
            {/* Center Selection */}
            <div style={{ display: 'flex', "flex-direction": 'column', gap: '4px' }}>
                <div style={{ "font-size": '12px', color: '#aaa' }}>
                    Center Point
                </div>

                {/* Quick Origin Selection Toggle */}
                <div style={{ display: 'flex', gap: '8px', "margin-bottom": '4px' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); props.onCenterTypeChange('origin'); }}
                        data-testid="pattern-center-origin-btn"
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: props.centerType === 'origin' ? '#4a90e2' : '#3a3a3a',
                            border: '1px solid #666',
                            "border-radius": '4px',
                            color: 'white',
                            cursor: 'pointer',
                            "font-size": '12px'
                        }}
                    >
                        Origin
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); props.onCenterTypeChange('point'); }}
                        data-testid="pattern-center-point-btn"
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: props.centerType === 'point' ? '#4a90e2' : '#3a3a3a',
                            border: '1px solid #666',
                            "border-radius": '4px',
                            color: 'white',
                            cursor: 'pointer',
                            "font-size": '12px'
                        }}
                    >
                        Select Point
                    </button>
                </div>

                {props.centerType === 'point' && (
                    <SelectionField
                        label="Selected Point"
                        value={props.selectedCenterId}
                        displayText={props.selectedCenterId ? "Point Selected" : "Select a point..."}
                        placeholder="Select a point..."
                        active={props.activeField === 'center'}
                        onClick={() => props.onFieldFocus('center')}
                        testId="pattern-center-select"
                    />
                )}
            </div>

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

            {/* Total Angle Input */}
            <div style={{ display: 'flex', "flex-direction": 'column', gap: '4px' }}>
                <div style={{ "font-size": '12px', color: '#aaa' }}>
                    Total Angle (degrees)
                </div>
                <input
                    type="number"
                    step="15"
                    min="1"
                    max="360"
                    value={props.totalAngle}
                    onChange={(e) => props.onAngleChange(parseFloat(e.currentTarget.value) || 360)}
                    data-testid="pattern-angle-input"
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
                ⇄ Flip Direction ({props.totalAngle >= 0 ? 'CCW' : 'CW'})
            </button>
        </BaseModal>
    );
};
