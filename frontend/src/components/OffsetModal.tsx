import { type Component } from 'solid-js';
import { BaseModal } from './BaseModal';

interface OffsetModalProps {
    isOpen: boolean;
    distance: number;
    setDistance: (d: number) => void;
    onFlip: () => void;
    onConfirm: () => void;
    onCancel: () => void;
    entityCount: number;
}

export const OffsetModal: Component<OffsetModalProps> = (props) => {
    return (
        <BaseModal
            isOpen={props.isOpen}
            title={`Offset Entities (${props.entityCount})`}
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            confirmDisabled={props.entityCount === 0}
            width={260}
        >
            <div style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
                <label style={{ "font-size": "12px", color: "#aaa" }}>Distance</label>
                <input
                    type="number"
                    step="0.1"
                    value={props.distance}
                    onInput={(e) => props.setDistance(parseFloat(e.currentTarget.value))}
                    style={{
                        background: "#222",
                        border: "1px solid #555",
                        color: "white",
                        padding: "8px",
                        "border-radius": "4px",
                        "font-size": "14px"
                    }}
                    autofocus
                    onKeyDown={(e) => {
                        if (e.key === "Enter") props.onConfirm();
                        if (e.key === "Escape") props.onCancel();
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
