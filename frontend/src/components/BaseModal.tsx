import { createSignal, type Component, type JSX, Show, onMount, onCleanup, createEffect } from 'solid-js';

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
    showCancel?: boolean;
    persistenceKey?: string;
    spawnPosition?: 'center' | 'bottom-left';
    children: JSX.Element;
}

export const BaseModal: Component<BaseModalProps> = (props) => {
    const MARGIN = 20; // Margin from viewport edges
    let modalRef: HTMLDivElement | undefined;

    // Start with a position that will be adjusted after mount
    const [position, setPosition] = createSignal({ x: MARGIN, y: MARGIN });
    const [isDragging, setIsDragging] = createSignal(false);
    const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

    // Calculate and clamp position to keep modal fully on-screen
    const clampPosition = (x: number, y: number, modalWidth: number, modalHeight: number) => {
        const maxX = window.innerWidth - modalWidth - MARGIN;
        const maxY = window.innerHeight - modalHeight - MARGIN;

        return {
            x: Math.max(MARGIN, Math.min(x, maxX)),
            y: Math.max(MARGIN, Math.min(y, maxY))
        };
    };

    // Keydown listener for Escape
    onMount(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && props.isOpen && props.onCancel) {
                props.onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        onCleanup(() => {
            window.removeEventListener('keydown', handleKeyDown);
        });
    });

    // Position modal when it opens
    createEffect(() => {
        // Only run if open and ref exists
        if (props.isOpen && modalRef) {
            const rect = modalRef.getBoundingClientRect();
            const modalHeight = rect.height;
            const modalWidth = rect.width;

            let targetX = MARGIN;
            let targetY = window.innerHeight - modalHeight - MARGIN;

            // Determine target position based on props and persistence
            let positionFound = false;

            // 1. Try persistence
            if (props.persistenceKey) {
                try {
                    const saved = localStorage.getItem(`modal_pos_${props.persistenceKey}`);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
                            targetX = parsed.x;
                            targetY = parsed.y;
                            positionFound = true;
                        }
                    }
                } catch (e) {
                    console.error('Failed to load modal position', e);
                }
            }

            // 2. Try spawnPosition='center' (if not already found)
            if (!positionFound && props.spawnPosition === 'center') {
                targetX = (window.innerWidth - modalWidth) / 2;
                targetY = (window.innerHeight - modalHeight) / 2;
                positionFound = true;
            }

            // 3. Try initialPosition prop (if not already found)
            if (!positionFound && props.initialPosition) {
                targetX = props.initialPosition.x;
                targetY = props.initialPosition.y;
                positionFound = true;
            }

            // Clamp to ensure it stays on screen (e.g. if window resized)
            const clamped = clampPosition(targetX, targetY, modalWidth, modalHeight);
            setPosition(clamped);
        }
    });

    const startDrag = (e: MouseEvent) => {
        setIsDragging(true);
        setDragOffset({ x: e.clientX - position().x, y: e.clientY - position().y });

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (modalRef) {
                const rect = modalRef.getBoundingClientRect();
                const newX = moveEvent.clientX - dragOffset().x;
                const newY = moveEvent.clientY - dragOffset().y;
                // Clamp while dragging too
                const clamped = clampPosition(newX, newY, rect.width, rect.height);
                setPosition(clamped);
            } else {
                setPosition({
                    x: moveEvent.clientX - dragOffset().x,
                    y: moveEvent.clientY - dragOffset().y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            // Save position if persistenceKey is set
            if (props.persistenceKey) {
                localStorage.setItem(`modal_pos_${props.persistenceKey}`, JSON.stringify(position()));
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const width = props.width ?? 300;
    const confirmLabel = props.confirmLabel ?? "Finish";
    const cancelLabel = props.cancelLabel ?? "Cancel";

    return (
        <Show when={props.isOpen}>
            <div ref={modalRef} style={{
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
                    <Show when={props.showCancel !== false}>
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
                    </Show>
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
