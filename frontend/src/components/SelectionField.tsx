import { type Component } from 'solid-js';

export interface SelectionFieldProps {
    label: string;
    active: boolean;
    onClick: () => void;

    // Selection state
    value?: string | string[] | null;
    count?: number; // Explicit count useful for "N selected"

    // Display overrides
    placeholder?: string;
    displayText?: string;

    // Additional styling/data
    testId?: string;
}

export const SelectionField: Component<SelectionFieldProps> = (props) => {

    const getDisplayText = () => {
        if (props.displayText) return props.displayText;

        if (props.count !== undefined) {
            return `${props.count} selected`;
        }

        if (Array.isArray(props.value)) {
            return props.value.length > 0 ? `${props.value.length} selected` : (props.placeholder || "Select...");
        }

        return props.value ? "Selected" : (props.placeholder || "Select...");
    };

    const hasValue = () => {
        if (props.count !== undefined) return props.count > 0;
        if (Array.isArray(props.value)) return props.value.length > 0;
        return !!props.value;
    };

    return (
        <div
            onClick={props.onClick}
            style={{ display: 'flex', "flex-direction": 'column', gap: '4px', cursor: 'pointer' }}
            data-testid={props.testId}
        >
            <div style={{
                "font-size": '12px',
                color: props.active ? '#4a90e2' : '#aaa',
                "font-weight": props.active ? 'bold' : 'normal',
                transition: 'color 0.2s'
            }}>
                {props.label}
            </div>
            <div style={{
                "font-size": '14px',
                padding: '8px',
                background: '#3a3a3a',
                "border-radius": '4px',
                border: props.active
                    ? '2px solid #4a90e2'
                    : (hasValue() ? '1px solid #666' : '1px dashed #666'),
                color: hasValue() ? 'white' : '#888',
                "box-sizing": 'border-box',
                transition: 'border 0.2s'
            }}>
                {getDisplayText()}
            </div>
        </div>
    );
};
