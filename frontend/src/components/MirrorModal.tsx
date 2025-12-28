import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';
import { SelectionField } from './SelectionField';

interface MirrorModalProps {
    selectedAxis: string | null;
    selectedEntityCount: number;
    activeField: 'axis' | 'entities';
    onFieldFocus: (field: 'axis' | 'entities') => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const MirrorModal: Component<MirrorModalProps> = (props) => {
    // Use a getter to ensure reactivity - the const was computed once and never updated
    const isConfirmDisabled = () => !props.selectedAxis || props.selectedEntityCount === 0;

    return (
        <BaseModal
            isOpen={true}
            title="Mirror Objects"
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            confirmDisabled={isConfirmDisabled()}
            width={300}
            testId="mirror-modal"
            confirmTestId="mirror-confirm"
            cancelTestId="mirror-cancel"
        >
            {/* Mirror Axis Selection */}
            <SelectionField
                label="Mirror Line"
                value={props.selectedAxis}
                displayText={props.selectedAxis ? "Line Selected" : "Select a line..."}
                placeholder="Select a line..."
                active={props.activeField === 'axis'}
                onClick={() => props.onFieldFocus('axis')}
                testId="mirror-axis-select"
            />

            {/* Entities Selection */}
            <SelectionField
                label="Entities to Mirror"
                count={props.selectedEntityCount}
                active={props.activeField === 'entities'}
                onClick={() => props.onFieldFocus('entities')}
                testId="mirror-entities-select"
            />
        </BaseModal>
    );
};
