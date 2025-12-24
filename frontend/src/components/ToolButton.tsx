import { type Component, type JSX, Show } from 'solid-js';

/**
 * ToolButton - Reusable toolbar button with rich tooltip support
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Hover tooltips with descriptions
 * Reference: plan.md Phase 0 → Reusable UI Components → ToolButton
 */

export interface ToolButtonProps {
    /** Button label text */
    label: string;
    /** Optional emoji/icon displayed above label */
    icon?: string;
    /** Keyboard shortcut to display in tooltip */
    shortcut?: string;
    /** Description text shown in tooltip */
    description?: string;
    /** Whether this tool is currently active/selected */
    isActive: boolean;
    /** Style as a constraint tool (different background) */
    isConstraint?: boolean;
    /** Disabled state */
    disabled?: boolean;
    /** Click handler */
    onClick: () => void;
    /** Optional minimum width */
    minWidth?: string;
}

const ToolButton: Component<ToolButtonProps> = (props) => {
    const baseStyle = (): JSX.CSSProperties => ({
        position: 'relative',
        display: 'inline-flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '2px',
        padding: '5px 10px',
        'min-width': props.minWidth || '40px',
        background: props.isActive
            ? '#007bff'
            : props.isConstraint
                ? '#5a5a5a'
                : '#666',
        color: props.disabled ? '#888' : 'white',
        border: props.isConstraint ? '1px solid #888' : 'none',
        'border-radius': '4px',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        'font-size': '12px',
        opacity: props.disabled ? 0.5 : 1,
        'user-select': 'none',
    });

    const handleClick = () => {
        if (!props.disabled) {
            props.onClick();
        }
    };

    // Check if we have tooltip content
    const hasTooltip = () => props.description || props.shortcut;

    return (
        <button
            style={baseStyle()}
            onClick={handleClick}
            disabled={props.disabled}
            class="tool-button"
        >
            {/* Icon if provided */}
            <Show when={props.icon}>
                <span style={{ 'font-size': '16px', 'line-height': 1 }}>{props.icon}</span>
            </Show>

            {/* Label */}
            <span style={{
                'font-size': props.icon ? '10px' : '12px',
                'font-weight': props.icon ? 'medium' : 'normal'
            }}>
                {props.label}
            </span>

            {/* Rich Tooltip - CSS-based, appears on hover */}
            <Show when={hasTooltip()}>
                <div class="tool-button-tooltip">
                    <div class="tooltip-content">
                        <Show when={props.description}>
                            <div class="tooltip-description">{props.description}</div>
                        </Show>
                        <Show when={props.shortcut}>
                            <div class="tooltip-shortcut">
                                <kbd>{props.shortcut}</kbd>
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>
        </button>
    );
};

export default ToolButton;

// CSS styles to be added to index.css or a dedicated stylesheet
export const toolButtonStyles = `
/* ToolButton Tooltip Styles */
.tool-button {
    position: relative;
}

.tool-button-tooltip {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
    padding: 8px 12px;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
    white-space: nowrap;
    min-width: 120px;
    text-align: center;
}

.tool-button:hover .tool-button-tooltip {
    opacity: 1;
}

.tooltip-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tooltip-description {
    font-size: 12px;
    color: #e0e0e0;
    line-height: 1.3;
}

.tooltip-shortcut {
    display: flex;
    justify-content: center;
}

.tooltip-shortcut kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 11px;
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    color: #fff;
    background: linear-gradient(180deg, #555 0%, #333 100%);
    border: 1px solid #666;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Tooltip arrow */
.tool-button-tooltip::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #444;
}

.tool-button-tooltip::after {
    content: '';
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid #1a1a1a;
}
`;
