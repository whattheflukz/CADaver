import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';

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
        >
            {/* Center Selection */}
            <div
                onClick={() => props.onFieldFocus('center')}
                style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
            >
                <div style={{
                    "font-size": '12px',
                    color: props.activeField === 'center' ? '#4a90e2' : '#aaa',
                    "font-weight": props.activeField === 'center' ? 'bold' : 'normal'
                }}>
                    Center Point
                </div>

                {/* Quick Origin Selection */}
                <div style={{ display: 'flex', gap: '8px', "margin-bottom": '4px' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); props.onCenterTypeChange('origin'); }}
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
                    <div style={{
                        "font-size": '14px',
                        padding: '8px',
                        background: '#3a3a3a',
                        "border-radius": '4px',
                        border: props.activeField === 'center'
                            ? '2px solid #4a90e2'
                            : (props.selectedCenterId ? '1px solid #666' : '1px dashed #666'),
                        color: props.selectedCenterId ? 'white' : '#888',
                        "box-sizing": 'border-box'
                    }}>
                        {props.selectedCenterId ? "Point Selected" : "Select a point..."}
                    </div>
                )}
            </div>

            {/* Entities Selection */}
            <div
                onClick={() => props.onFieldFocus('entities')}
                style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
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
