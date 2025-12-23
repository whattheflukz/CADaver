import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';

interface MirrorModalProps {
    selectedAxis: string | null;
    selectedEntityCount: number;
    activeField: 'axis' | 'entities';
    onFieldFocus: (field: 'axis' | 'entities') => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const MirrorModal: Component<MirrorModalProps> = (props) => {
    const isConfirmDisabled = !props.selectedAxis || props.selectedEntityCount === 0;

    return (
        <BaseModal
            isOpen={true}
            title="Mirror Objects"
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            confirmDisabled={isConfirmDisabled}
            width={300}
        >
            {/* Mirror Axis Selection */}
            <div
                onClick={() => props.onFieldFocus('axis')}
                style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
            >
                <div style={{
                    "font-size": '12px',
                    color: props.activeField === 'axis' ? '#4a90e2' : '#aaa',
                    "font-weight": props.activeField === 'axis' ? 'bold' : 'normal'
                }}>
                    Mirror Line
                </div>
                <div style={{
                    "font-size": '14px',
                    padding: '8px',
                    background: '#3a3a3a',
                    "border-radius": '4px',
                    border: props.activeField === 'axis'
                        ? '2px solid #4a90e2'
                        : (props.selectedAxis ? '1px solid #666' : '1px dashed #666'),
                    color: props.selectedAxis ? 'white' : '#888',
                    "box-sizing": 'border-box'
                }}>
                    {props.selectedAxis ? "Line Selected" : "Select a line..."}
                </div>
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
                    Entities to Mirror
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
        </BaseModal>
    );
};
