import { createSignal, type Component, type JSX, Show } from 'solid-js';

interface BaseModalProps {
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmDisabled?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    width?: number;
    initialPosition?: { x: number; y: number };
    children: JSX.Element;
}

export const BaseModal: Component<BaseModalProps> = (props) => {
    const defaultY = typeof window !== 'undefined' ? window.innerHeight - 300 : 500;
    const initial = props.initialPosition ?? { x: 20, y: defaultY };

    const [position, setPosition] = createSignal(initial);
    const [isDragging, setIsDragging] = createSignal(false);
    const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

    const startDrag = (e: MouseEvent) => {
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position().x, y: e.clientY - position().y });

        const handleMouseMove = (moveEvent: MouseEvent) => {
            setPosition({
                x: moveEvent.clientX - dragOffset().x,
                y: moveEvent.clientY - dragOffset().y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const width = props.width ?? 300;
    const confirmLabel = props.confirmLabel ?? "Finish";
    const cancelLabel = props.cancelLabel ?? "Cancel";

    return (
        <Show when={props.isOpen}>
            <div style={{
                position: 'fixed',
                top: `${position().y}px`,
                left: `${position().x}px`,
                "background-color": '#2c2c2c',
                "border-radius": '8px',
                padding: '16px',
                "box-shadow": '0 4px 6px rgba(0,0,0,0.3)',
                border: '1px solid #444',
                color: 'white',
                "z-index": 1000,
                width: `${width}px`,
                display: 'flex',
                "flex-direction": 'column',
                gap: '12px',
                "font-family": 'system-ui, sans-serif',
                cursor: isDragging() ? 'grabbing' : 'auto',
                "user-select": 'none'
            }}>
                {/* Draggable Header */}
                <div
                    onMouseDown={startDrag}
                    style={{
                        margin: 0,
                        "font-size": '16px',
                        "font-weight": '600',
                        cursor: 'grab',
                        "border-bottom": '1px solid #444',
                        "padding-bottom": '10px',
                        display: 'flex',
                        "align-items": 'center',
                        "justify-content": 'space-between'
                    }}
                >
                    <span>{props.title}</span>
                    <span style={{ "font-size": "10px", "font-weight": "normal", color: "#666" }}>⋮⋮</span>
                </div>

                {/* Content Slot */}
                <div style={{ display: 'flex', "flex-direction": 'column', gap: '10px' }}>
                    {props.children}
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', gap: '8px', "margin-top": '4px' }}>
                    <button
                        onClick={props.onCancel}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid #555',
                            color: 'white',
                            "border-radius": '4px',
                            cursor: 'pointer',
                            "font-size": '13px',
                            transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#3a3a3a'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={props.onConfirm}
                        disabled={props.confirmDisabled}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: props.confirmDisabled ? '#3a5a7a' : '#4a90e2',
                            border: 'none',
                            color: 'white',
                            "border-radius": '4px',
                            cursor: props.confirmDisabled ? 'not-allowed' : 'pointer',
                            "font-size": '13px',
                            "font-weight": '500',
                            opacity: props.confirmDisabled ? 0.6 : 1,
                            transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => { if (!props.confirmDisabled) e.currentTarget.style.background = '#5a9fef'; }}
                        onMouseLeave={(e) => { if (!props.confirmDisabled) e.currentTarget.style.background = '#4a90e2'; }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </Show>
    );
};
