import { Show, For } from "solid-js";
import type { Component } from "solid-js";
import type { SketchEntity, SelectionCandidate } from "../types";

interface ProposedAction {
    label: string;
    type: "Distance" | "Angle" | "Radius" | "Length" | "DistancePointLine" | "Unsupported";
    value?: number;
    isValid: boolean;
}

interface DimensionHUDProps {
    selections: SelectionCandidate[];
    // We pass the full entities list to look up names/types
    entities: SketchEntity[];
    proposedAction: ProposedAction | null;
    onFinish: () => void;
    onCancel: () => void;
}

const DimensionHUD: Component<DimensionHUDProps> = (props) => {

    const getSelectionLabel = (sel: SelectionCandidate) => {
        if (sel.type === "origin") return "Origin";
        if (sel.type === "point") return "Point";
        const ent = props.entities.find(e => e.id === sel.id);
        if (!ent) return "Unknown";
        if (ent.geometry.Line) return "Line";
        if (ent.geometry.Circle) return "Circle";
        if (ent.geometry.Arc) return "Arc";
        if (ent.geometry.Point) return "Point";
        return "Entity";
    };

    return (
        <div style={{
            position: "absolute",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2a2a2a",
            padding: "12px 20px",
            "border-radius": "8px",
            "box-shadow": "0 4px 12px rgba(0,0,0,0.5)",
            color: "#eee",
            "font-family": "sans-serif",
            "min-width": "250px",
            "z-index": 1000,
            display: "flex",
            "flex-direction": "column",
            gap: "10px"
        }}>
            <div style={{ "font-size": "12px", "color": "#aaa", "text-transform": "uppercase", "letter-spacing": "0.5px" }}>
                Dimension Selection
            </div>

            <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
                <Show when={props.selections.length > 0} fallback={<span style={{ color: "#666", "font-style": "italic" }}>Select entities...</span>}>
                    <For each={props.selections}>
                        {(sel) => (
                            <span style={{
                                background: "#444",
                                padding: "2px 8px",
                                "border-radius": "4px",
                                "font-size": "13px"
                            }}>
                                {getSelectionLabel(sel)}
                            </span>
                        )}
                    </For>
                </Show>
            </div>

            <div style={{
                "margin-top": "5px",
                "padding-top": "10px",
                "border-top": "1px solid #444",
                display: "flex",
                gap: "10px",
                "justify-content": "flex-end"
            }}>
                <button
                    onClick={props.onCancel}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "#aaa",
                        cursor: "pointer",
                        padding: "6px 12px",
                        "font-size": "13px"
                    }}
                >
                    Cancel
                </button>

                <Show when={props.proposedAction?.isValid}>
                    <span style={{ "align-self": "center", "font-size": "13px", "color": "#00dddd", "font-style": "italic" }}>
                        Click to Place
                    </span>
                </Show>
            </div>
        </div>
    );
};

export default DimensionHUD;
