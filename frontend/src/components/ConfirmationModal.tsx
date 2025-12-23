import type { Component } from 'solid-js';
import { Show } from 'solid-js';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: Component<ConfirmationModalProps> = (props) => {
    return (
        <Show when={props.isOpen}>
            <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.7)",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                "z-index": 2000,
                "backdrop-filter": "blur(2px)"
            }}>
                <div style={{
                    background: "#2d2d2d",
                    border: "1px solid #444",
                    "box-shadow": "0 4px 6px rgba(0,0,0,0.3)",
                    "border-radius": "8px",
                    padding: "20px",
                    "min-width": "300px",
                    "max-width": "400px",
                    color: "#e0e0e0",
                    "font-family": "system-ui, sans-serif"
                }}>
                    <h3 style={{ margin: "0 0 15px 0", "font-size": "18px", "font-weight": "600" }}>{props.title}</h3>
                    <p style={{ margin: "0 0 20px 0", "font-size": "14px", "line-height": "1.4", color: "#aaa" }}>
                        {props.message}
                    </p>
                    <div style={{ display: "flex", gap: "10px", "justify-content": "flex-end" }}>
                        <button
                            onClick={props.onCancel}
                            style={{
                                background: "#444",
                                color: "white",
                                border: "1px solid #555",
                                padding: "8px 16px",
                                "border-radius": "4px",
                                cursor: "pointer",
                                "font-size": "13px",
                                transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#555"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "#444"}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={props.onConfirm}
                            style={{
                                background: "#dc3545",
                                color: "white",
                                border: "none",
                                padding: "8px 16px",
                                "border-radius": "4px",
                                cursor: "pointer",
                                "font-size": "13px",
                                "font-weight": "500",
                                transition: "background 0.2s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#bd2130"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "#dc3545"}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
};
